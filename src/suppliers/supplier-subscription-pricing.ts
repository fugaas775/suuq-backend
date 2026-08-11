/**
 * Supplier (wholesaler) account subscription pricing.
 *
 * Suppliers activate a paid subscription to go live (publish offers + receive
 * purchase orders), mirroring the per-branch POS subscription model. Like POS,
 * pricing + plan codes are defined HERE on the backend (frontend prices are
 * display-only — the backend charges from planCode/period). Two periods only:
 * a 1-month plan and a 1-year plan; no tiers.
 */
export type SupplierSubscriptionPeriod = 'MONTHLY' | 'ONE_YEAR';

export interface SupplierSubscriptionOption {
  /** Stable identifier used in DTOs and the Ebirr metadata payload. */
  period: SupplierSubscriptionPeriod;
  /** Number of months the subscription covers. */
  months: number;
  /** Total amount billed for the full period. */
  amount: number;
  /** ISO currency code. */
  currency: 'ETB';
  /** Human-friendly label rendered in the gate / billing UI. */
  label: string;
  /** Plan code recorded on `supplier_subscriptions.planCode`. */
  planCode: string;
}

export const SUPPLIER_SUBSCRIPTION_CURRENCY = 'ETB' as const;

export const SUPPLIER_SUBSCRIPTION_OPTIONS: readonly SupplierSubscriptionOption[] =
  [
    {
      period: 'MONTHLY',
      months: 1,
      amount: 2_900,
      currency: SUPPLIER_SUBSCRIPTION_CURRENCY,
      label: '1 month',
      planCode: 'SUPPLIER_1M',
    },
    {
      period: 'ONE_YEAR',
      months: 12,
      amount: 34_800,
      currency: SUPPLIER_SUBSCRIPTION_CURRENCY,
      label: '1 year',
      planCode: 'SUPPLIER_1Y',
    },
  ] as const;

export function findSupplierSubscriptionOption(
  period: string | null | undefined,
): SupplierSubscriptionOption | undefined {
  const normalized = String(period || '')
    .trim()
    .toUpperCase();
  return SUPPLIER_SUBSCRIPTION_OPTIONS.find(
    (option) => option.period === normalized,
  );
}

export function requireSupplierSubscriptionOption(
  period: string | null | undefined,
): SupplierSubscriptionOption {
  const option = findSupplierSubscriptionOption(period);
  if (!option) {
    throw new Error(
      `Unsupported supplier subscription period: ${String(period ?? '')}. ` +
        `Expected one of: ${SUPPLIER_SUBSCRIPTION_OPTIONS.map((o) => o.period).join(', ')}.`,
    );
  }
  return option;
}
