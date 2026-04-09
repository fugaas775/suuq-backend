export enum PosPartnerScope {
  POS_SYNC_WRITE = 'pos:sync:write',
  POS_CHECKOUT_READ = 'pos:checkout:read',
  POS_CHECKOUT_WRITE = 'pos:checkout:write',
  POS_REGISTER_READ = 'pos:register:read',
  POS_REGISTER_WRITE = 'pos:register:write',
}

export const DEFAULT_POS_PARTNER_SCOPES: PosPartnerScope[] = [
  PosPartnerScope.POS_SYNC_WRITE,
  PosPartnerScope.POS_CHECKOUT_READ,
  PosPartnerScope.POS_CHECKOUT_WRITE,
  PosPartnerScope.POS_REGISTER_READ,
  PosPartnerScope.POS_REGISTER_WRITE,
];

export enum PosPartnerScopePreset {
  FULL_TERMINAL = 'FULL_TERMINAL',
  CASHIER_TERMINAL = 'CASHIER_TERMINAL',
  INVENTORY_TERMINAL = 'INVENTORY_TERMINAL',
  SYNC_ONLY = 'SYNC_ONLY',
}

export const POS_PARTNER_SCOPE_PRESET_SCOPES: Record<
  PosPartnerScopePreset,
  PosPartnerScope[]
> = {
  [PosPartnerScopePreset.FULL_TERMINAL]: [...DEFAULT_POS_PARTNER_SCOPES],
  [PosPartnerScopePreset.CASHIER_TERMINAL]: [
    PosPartnerScope.POS_CHECKOUT_READ,
    PosPartnerScope.POS_CHECKOUT_WRITE,
    PosPartnerScope.POS_REGISTER_READ,
    PosPartnerScope.POS_REGISTER_WRITE,
  ],
  [PosPartnerScopePreset.INVENTORY_TERMINAL]: [
    PosPartnerScope.POS_SYNC_WRITE,
    PosPartnerScope.POS_CHECKOUT_READ,
    PosPartnerScope.POS_REGISTER_READ,
  ],
  [PosPartnerScopePreset.SYNC_ONLY]: [PosPartnerScope.POS_SYNC_WRITE],
};

export const LEGACY_POS_PARTNER_SCOPE_ALIASES: Record<
  string,
  PosPartnerScope[]
> = {
  'sync:write': [PosPartnerScope.POS_SYNC_WRITE],
  'pos:ingest': [PosPartnerScope.POS_SYNC_WRITE],
};

export const POS_PARTNER_SCOPE_INPUT_VALUES = [
  ...Object.values(PosPartnerScope),
  ...Object.keys(LEGACY_POS_PARTNER_SCOPE_ALIASES),
];

export function resolveGrantedPosScopes(
  scopes: string[] | null | undefined,
): Set<PosPartnerScope> {
  const granted = new Set<PosPartnerScope>();

  for (const rawScope of scopes ?? []) {
    if (Object.values(PosPartnerScope).includes(rawScope as PosPartnerScope)) {
      granted.add(rawScope as PosPartnerScope);
      continue;
    }

    for (const mappedScope of LEGACY_POS_PARTNER_SCOPE_ALIASES[rawScope] ??
      []) {
      granted.add(mappedScope);
    }
  }

  return granted;
}

export function canonicalizePosScopeInputs(
  scopes: string[] | null | undefined,
): PosPartnerScope[] {
  if (!scopes || scopes.length === 0) {
    return [...DEFAULT_POS_PARTNER_SCOPES];
  }

  return Array.from(resolveGrantedPosScopes(scopes));
}

export function resolvePosPresetScopes(
  preset: PosPartnerScopePreset | null | undefined,
): PosPartnerScope[] {
  if (!preset) {
    return [...DEFAULT_POS_PARTNER_SCOPES];
  }

  return [
    ...(POS_PARTNER_SCOPE_PRESET_SCOPES[preset] ?? DEFAULT_POS_PARTNER_SCOPES),
  ];
}

export function isSupportedPosScopeInput(scope: string): boolean {
  return POS_PARTNER_SCOPE_INPUT_VALUES.includes(scope);
}
