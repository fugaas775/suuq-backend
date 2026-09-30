/**
 * The units an ingredient may be kept in, and the arithmetic between them.
 *
 * A closed list on purpose. The market run's `unitLabel` is free text because
 * a stall sells in sacks and crates and nobody should have to onboard a unit
 * before buying onions — but a RECIPE has to be arithmetic: twenty grams of a
 * thing kept in kilos is 0.02 of it, and that only works if both sides agree
 * on what a kilo is. Five units, two families with a conversion, one without.
 *
 * Mirrored in pos-s `src/shared/ingredientUnits.js`. Keep the two identical.
 */
export const INGREDIENT_UNITS = ['KG', 'G', 'L', 'ML', 'PCS'] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export type IngredientUnitFamily = 'MASS' | 'VOLUME' | 'COUNT';

export const UNIT_FAMILY: Record<IngredientUnit, IngredientUnitFamily> = {
  KG: 'MASS',
  G: 'MASS',
  L: 'VOLUME',
  ML: 'VOLUME',
  PCS: 'COUNT',
};

/** How many of the family's small unit make one of this unit. */
export const BASE_FACTOR: Record<IngredientUnit, number> = {
  KG: 1000,
  G: 1,
  L: 1000,
  ML: 1,
  PCS: 1,
};

/**
 * The service formats whose menu items may carry a recipe. One place to widen
 * it: CAFETERIA is deliberately left out, the way store products left it out.
 */
export const RECIPE_SERVICE_FORMATS = ['QSR'] as const;

export function normalizeUnit(raw: unknown): IngredientUnit | null {
  const code = String(raw ?? '')
    .trim()
    .toUpperCase();
  return (INGREDIENT_UNITS as readonly string[]).includes(code)
    ? (code as IngredientUnit)
    : null;
}

/** 4 decimal places — the ledger's own precision. */
export function roundQty(value: number): number {
  const n = Number(value) || 0;
  return Math.round(n * 10_000) / 10_000;
}

/** 2 decimal places. */
export function roundMoney(value: number): number {
  const n = Number(value) || 0;
  return Math.round(n * 100) / 100;
}

/**
 * A quantity restated in another unit of the SAME family, or null when the
 * two do not convert. Litres of sugar is a question, not a number.
 */
export function convertQuantity(
  quantity: number,
  from: IngredientUnit | null | undefined,
  to: IngredientUnit | null | undefined,
): number | null {
  const a = normalizeUnit(from);
  const b = normalizeUnit(to);
  if (!a || !b) return null;
  if (a === b) return roundQty(quantity);
  if (UNIT_FAMILY[a] !== UNIT_FAMILY[b]) return null;
  return roundQty((Number(quantity) || 0) * (BASE_FACTOR[a] / BASE_FACTOR[b]));
}

/**
 * What a market-run unit label most likely means. `null` for sack, crate,
 * bunch and anything else the ledger cannot count — the purchaser then types
 * the received quantity themselves, in the ingredient's unit.
 */
export function purchaseLabelToUnit(label: unknown): IngredientUnit | null {
  const text = String(label ?? '')
    .trim()
    .toLowerCase();
  if (!text) return null;
  if (['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'].includes(text)) {
    return 'KG';
  }
  if (['g', 'gr', 'gm', 'gram', 'grams'].includes(text)) return 'G';
  if (['l', 'lt', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(text)) {
    return 'L';
  }
  if (['ml', 'millilitre', 'milliliter'].includes(text)) return 'ML';
  if (['pcs', 'pc', 'piece', 'pieces', 'unit', 'units', 'each'].includes(text)) {
    return 'PCS';
  }
  return null;
}

export function branchTracksIngredients(
  branch: { serviceFormat?: string | null } | null | undefined,
): boolean {
  const format = String(branch?.serviceFormat ?? '')
    .trim()
    .toUpperCase();
  return (RECIPE_SERVICE_FORMATS as readonly string[]).includes(format);
}
