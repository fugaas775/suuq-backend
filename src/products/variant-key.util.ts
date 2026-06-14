/**
 * Deterministic variant key from a variant's attribute values.
 *
 * A RETAIL product variant is a specific combination of category attribute
 * values (e.g. { size: 'M', color: 'Red', material: 'Cotton' }). The key is
 * order-independent and case-insensitive so the same combination always maps to
 * the same variant, regardless of how the attributes were entered.
 *
 * IMPORTANT: the pos-s frontend computes the identical key
 * (src/features/register/retailCategoryTaxonomy.js → computeVariantKey) so a
 * cashier's cart selection resolves to the right variant at checkout. Keep the
 * two implementations in lockstep: sort keys ascending, trim + lowercase values,
 * join as `key:value` with `|`.
 */
export function computeVariantKey(
  attributes: Record<string, unknown> | null | undefined,
): string {
  if (!attributes || typeof attributes !== 'object') {
    return '';
  }
  const pairs: string[] = [];
  for (const rawKey of Object.keys(attributes)) {
    const key = String(rawKey).trim().toLowerCase();
    if (!key) {
      continue;
    }
    const value = String(attributes[rawKey] ?? '')
      .trim()
      .toLowerCase();
    if (!value) {
      continue;
    }
    pairs.push(`${key}:${value}`);
  }
  // keys are unique, so sorting the `key:value` strings sorts by key.
  return pairs.sort().join('|');
}
