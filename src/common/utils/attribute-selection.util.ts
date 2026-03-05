type AnyRecord = Record<string, any>;

const RESERVED_SELECTION_KEYS = new Set(['offerId', 'offer_id']);
const OPTION_VALUE_KEYS = ['value', 'label', 'name', 'id', 'key', 'code'];

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : null;
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

function hasOptions(field: AnyRecord): boolean {
  return (
    asArray(field.options).length > 0 ||
    asArray(field.values).length > 0 ||
    asArray(field.choices).length > 0 ||
    asArray(field.items).length > 0
  );
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function isExplicitVariantField(field: AnyRecord): boolean | null {
  const trueFlags = ['variant', 'isVariant', 'isVariation', 'buyerSelectable'];
  const falseFlags = ['isSystem', 'system', 'internal'];

  for (const key of falseFlags) {
    if (key in field) {
      return !isTruthyFlag(field[key]) ? null : false;
    }
  }

  for (const key of trueFlags) {
    if (key in field) {
      return isTruthyFlag(field[key]);
    }
  }
  return null;
}

function fieldKey(field: AnyRecord): string {
  const raw = field.key ?? field.name ?? field.code ?? field.id;
  return typeof raw === 'string' ? raw.trim() : '';
}

function isMissingSelection(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normalizeOptionValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  const record = asRecord(value);
  if (!record) return '';
  for (const key of OPTION_VALUE_KEYS) {
    const candidate = record[key];
    if (
      typeof candidate === 'string' ||
      typeof candidate === 'number' ||
      typeof candidate === 'boolean'
    ) {
      const normalized = String(candidate).trim();
      if (normalized) return normalized;
    }
  }
  return '';
}

function extractOptions(field: AnyRecord): string[] {
  const rawOptions = [
    ...asArray(field.options),
    ...asArray(field.values),
    ...asArray(field.choices),
    ...asArray(field.items),
  ];
  const out = new Set<string>();
  for (const option of rawOptions) {
    const normalized = normalizeOptionValue(option);
    if (normalized) out.add(normalized);
  }
  return [...out];
}

function isSingleChoiceVariantField(field: AnyRecord): boolean {
  const explicitVariant = isExplicitVariantField(field);
  if (explicitVariant === false) return false;

  const required =
    isTruthyFlag(field.required) ||
    isTruthyFlag(field.isRequired) ||
    isTruthyFlag(field.mandatory);
  const multiSelect =
    isTruthyFlag(field.multiSelect) ||
    isTruthyFlag(field.isMultiSelect) ||
    isTruthyFlag(field.multiple);

  if (!required || multiSelect || !hasOptions(field)) return false;
  return true;
}

export type RequiredSelectionOption = {
  key: string;
  options: string[];
};

function collectRequiredOptionsFromArray(
  fields: any[],
): RequiredSelectionOption[] {
  const optionsByKey = new Map<string, Set<string>>();
  for (const rawField of fields) {
    const field = asRecord(rawField);
    if (!field) continue;
    const key = fieldKey(field);
    if (!key) continue;

    if (isSingleChoiceVariantField(field)) {
      if (!optionsByKey.has(key)) {
        optionsByKey.set(key, new Set());
      }
      const current = optionsByKey.get(key);
      for (const option of extractOptions(field)) {
        current.add(option);
      }
    }
  }
  return [...optionsByKey.entries()].map(([key, values]) => ({
    key,
    options: [...values],
  }));
}

export function getRequiredSelectionOptions(
  product: any,
): RequiredSelectionOption[] {
  const p = asRecord(product) || {};
  const attrs = asRecord(p.attributes) || {};
  const category = asRecord(p.category) || {};

  const schemaArrays = [
    asArray(attrs.categoryAttributes),
    asArray(attrs.attributeDefinitions),
    asArray(attrs.attributes),
    asArray(attrs.selectionSchema),
    asArray(attrs.variantOptions),
    asArray(attrs.variationOptions),
    asArray(category.attributes),
  ];

  const byKey = new Map<string, Set<string>>();
  for (const fields of schemaArrays) {
    for (const field of collectRequiredOptionsFromArray(fields)) {
      if (!byKey.has(field.key)) {
        byKey.set(field.key, new Set());
      }
      const current = byKey.get(field.key);
      for (const value of field.options) {
        current.add(value);
      }
    }
  }

  return [...byKey.entries()].map(([key, values]) => ({
    key,
    options: [...values],
  }));
}

export function getRequiredSelectionKeys(product: any): string[] {
  const p = asRecord(product) || {};
  const attrs = asRecord(p.attributes) || {};
  const category = asRecord(p.category) || {};

  const directKeyLists = [
    asArray(attrs.requiredAttributeKeys),
    asArray(attrs.requiredAttributes),
    asArray(category.requiredAttributeKeys),
    asArray(category.requiredAttributes),
  ];

  const keysFromLists = new Set<string>();
  for (const list of directKeyLists) {
    for (const entry of list) {
      if (typeof entry !== 'string') continue;
      const key = entry.trim();
      if (key) keysFromLists.add(key);
    }
  }

  const keysFromSchema = new Set(
    getRequiredSelectionOptions(product).map((entry) => entry.key),
  );

  if (keysFromSchema.size > 0) return [...keysFromSchema];
  return [...keysFromLists];
}

export function getMissingRequiredSelections(
  requiredKeys: string[],
  selected: Record<string, any> | null | undefined,
): string[] {
  if (!requiredKeys.length) return [];
  const payload = asRecord(selected) || {};

  return requiredKeys.filter((key) => {
    if (RESERVED_SELECTION_KEYS.has(key)) return false;
    return isMissingSelection(payload[key]);
  });
}

export function getInvalidRequiredSelections(
  product: any,
  selected: Record<string, any> | null | undefined,
): string[] {
  const payload = asRecord(selected) || {};
  const requiredOptions = getRequiredSelectionOptions(product);
  if (requiredOptions.length === 0) return [];

  const invalid: string[] = [];
  for (const option of requiredOptions) {
    const key = option.key;
    if (!key || RESERVED_SELECTION_KEYS.has(key)) continue;

    const selectedValue = payload[key];
    if (isMissingSelection(selectedValue)) continue;
    if (Array.isArray(selectedValue)) {
      invalid.push(key);
      continue;
    }

    const normalizedSelected = normalizeOptionValue(selectedValue);
    if (!normalizedSelected) {
      invalid.push(key);
      continue;
    }

    const allowed = new Set(
      option.options.map((entry) => normalizeKey(entry)).filter(Boolean),
    );
    if (!allowed.size) continue;
    if (!allowed.has(normalizeKey(normalizedSelected))) {
      invalid.push(key);
    }
  }

  return invalid;
}
