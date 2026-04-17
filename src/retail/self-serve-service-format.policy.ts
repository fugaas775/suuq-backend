import { BadRequestException } from '@nestjs/common';
import {
  RetailModule,
  TenantModuleEntitlement,
} from './entities/tenant-module-entitlement.entity';

const DEFAULT_SELF_SERVE_SERVICE_FORMAT = 'RETAIL';
const HOSPITALITY_SELF_SERVE_SERVICE_FORMATS = new Set(['QSR', 'FSR']);
const HOSPITALITY_ENABLED_SELF_SERVE_SERVICE_FORMATS = ['RETAIL', 'QSR', 'FSR'];

function isTruthyFlagValue(value: unknown) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value || '')
      .trim()
      .toLowerCase(),
  );
}

export function areHospitalityServiceFormatsEnabled() {
  return true; // isTruthyFlagValue(process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED);
}

export function getDefaultAllowedSelfServeServiceFormats() {
  return areHospitalityServiceFormatsEnabled()
    ? [...HOSPITALITY_ENABLED_SELF_SERVE_SERVICE_FORMATS]
    : [DEFAULT_SELF_SERVE_SERVICE_FORMAT];
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
    ? Array.from(new Set(configuredFormats))
    : getDefaultAllowedSelfServeServiceFormats();
}

export function buildSelfServeServiceFormatMetadata(
  allowedFormats = getDefaultAllowedSelfServeServiceFormats(),
) {
  return {
    allowedSelfServeServiceFormats: Array.from(
      new Set(
        allowedFormats
          .map((format) =>
            String(format || '')
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
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
