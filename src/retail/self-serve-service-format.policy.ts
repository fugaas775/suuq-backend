import { BadRequestException } from '@nestjs/common';
import {
  RetailModule,
  TenantModuleEntitlement,
} from './entities/tenant-module-entitlement.entity';

const DEFAULT_SELF_SERVE_SERVICE_FORMAT = 'RETAIL';
const RETAIL_SELF_SERVE_SERVICE_FORMATS = ['RETAIL', 'BARBER'];
const EXTENDED_RETAIL_SELF_SERVE_SERVICE_FORMATS = [
  'PHARMACY',
  'GROCERY',
  'BAKERY',
  'LAUNDRY',
  'SALON_SPA',
  'BUTCHERY',
  'GAS_STATION',
  'ELECTRONICS',
];
const HOSPITALITY_SELF_SERVE_SERVICE_FORMATS = new Set(['HOTEL']);
const HOSPITALITY_ENABLED_SELF_SERVE_SERVICE_FORMATS = [
  ...RETAIL_SELF_SERVE_SERVICE_FORMATS,
  ...EXTENDED_RETAIL_SELF_SERVE_SERVICE_FORMATS,
  'HOTEL',
];

function expandRetailLinkedSelfServeServiceFormats(formats: string[]) {
  const normalizedFormats = Array.from(new Set(formats.filter(Boolean)));
  const hasRetailLinkedFormat = normalizedFormats.some(
    (format) => format === 'RETAIL' || format === 'BARBER',
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
