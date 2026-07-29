import { BadRequestException } from '@nestjs/common';
import {
  RetailModule,
  TenantModuleEntitlement,
} from './entities/tenant-module-entitlement.entity';

const DEFAULT_SELF_SERVE_SERVICE_FORMAT = 'RETAIL';
const RETAIL_SELF_SERVE_SERVICE_FORMATS = ['RETAIL'];
const EXTENDED_RETAIL_SELF_SERVE_SERVICE_FORMATS = [
  'PHARMACY',
  'GROCERY',
  'BAKERY',
  'LAUNDRY',
  'BUTCHERY',
  'GAS_STATION',
  'ELECTRONICS',
];
// The non-retail formats POS-S offers in its self-serve picker
// (SELF_SERVE_SERVICE_FORMAT_ORDER in pos-s/src/features/register/registerCatalog.js).
// These two lists MUST stay in step: a format the picker offers but this policy
// rejects fails at creation with a 400 the user cannot act on. QSR additionally
// backs auto-provisioning (see pos-self-serve-trial.policy.ts).
const HOSPITALITY_SELF_SERVE_SERVICE_FORMATS = new Set([
  'HOTEL',
  'QSR',
  'CAFETERIA',
  'PROPERTY_RENTAL',
  'BARBER',
  'PRINTING_PRESS',
]);
const HOSPITALITY_ENABLED_SELF_SERVE_SERVICE_FORMATS = [
  ...RETAIL_SELF_SERVE_SERVICE_FORMATS,
  ...EXTENDED_RETAIL_SELF_SERVE_SERVICE_FORMATS,
  ...HOSPITALITY_SELF_SERVE_SERVICE_FORMATS,
];

function expandRetailLinkedSelfServeServiceFormats(formats: string[]) {
  const normalizedFormats = Array.from(new Set(formats.filter(Boolean)));
  const hasRetailLinkedFormat = normalizedFormats.some(
    (format) => format === 'RETAIL',
  );

  if (!hasRetailLinkedFormat) {
    return normalizedFormats;
  }

  return Array.from(
    new Set([...normalizedFormats, ...RETAIL_SELF_SERVE_SERVICE_FORMATS]),
  );
}

function isTruthyFlagValue(value: unknown) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value || '')
      .trim()
      .toLowerCase(),
  );
}

export function areHospitalityServiceFormatsEnabled() {
  return isTruthyFlagValue(process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED);
}

export function getDefaultAllowedSelfServeServiceFormats() {
  return areHospitalityServiceFormatsEnabled()
    ? [...HOSPITALITY_ENABLED_SELF_SERVE_SERVICE_FORMATS]
    : [...RETAIL_SELF_SERVE_SERVICE_FORMATS];
}

export function resolveAllowedSelfServeServiceFormats(
  posCoreEntitlement?: TenantModuleEntitlement | null,
) {
  const configuredFormats = Array.isArray(
    posCoreEntitlement?.metadata?.allowedSelfServeServiceFormats,
  )
    ? posCoreEntitlement.metadata.allowedSelfServeServiceFormats
        .map((format) =>
          String(format || '')
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean)
    : [];

  return configuredFormats.length
    ? expandRetailLinkedSelfServeServiceFormats(configuredFormats)
    : getDefaultAllowedSelfServeServiceFormats();
}

export function buildSelfServeServiceFormatMetadata(
  allowedFormats = getDefaultAllowedSelfServeServiceFormats(),
) {
  return {
    allowedSelfServeServiceFormats: expandRetailLinkedSelfServeServiceFormats(
      allowedFormats
        .map((format) =>
          String(format || '')
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  };
}

export function getPosCoreEntitlement(
  entitlements: TenantModuleEntitlement[] = [],
) {
  return (
    entitlements.find(
      (entitlement) => entitlement.module === RetailModule.POS_CORE,
    ) || null
  );
}

export function normalizeSelfServeServiceFormat(value: unknown) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  return normalized || DEFAULT_SELF_SERVE_SERVICE_FORMAT;
}

export function assertAllowedSelfServeServiceFormat(
  value: unknown,
  contextLabel = 'Self-serve POS workspace creation',
  allowedFormats = getDefaultAllowedSelfServeServiceFormats(),
) {
  const normalized = normalizeSelfServeServiceFormat(value);
  const allowedFormatSet = new Set(
    allowedFormats
      .map((format) =>
        String(format || '')
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean),
  );

  if (allowedFormatSet.has(normalized)) {
    return normalized;
  }

  if (HOSPITALITY_SELF_SERVE_SERVICE_FORMATS.has(normalized)) {
    throw new BadRequestException(
      `${contextLabel} only supports ${Array.from(allowedFormatSet).join(', ')} until hospitality rollout is enabled for this tenant.`,
    );
  }

  throw new BadRequestException(
    `${contextLabel} does not support ${normalized} service format.`,
  );
}
