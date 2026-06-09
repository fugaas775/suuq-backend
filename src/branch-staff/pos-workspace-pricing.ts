/**
 * POS branch subscription pricing.
 *
 * Branches subscribe per-period: a 1-month plan or a 1-year plan. Pricing is
 * strictly per-branch (not per-tenant) and there are no plan tiers — only the
 * period differs. (The legacy 6-month plan has been retired; existing
 * SIX_MONTHS subscription rows keep being honoured until they expire.)
 *
 * Effective monthly equivalent stays at 1,900 ETB so equity-partner
 * payouts (1/2 of monthly = 950 ETB) keep working unchanged.
 */
export type PosBranchSubscriptionPeriod = 'MONTHLY' | 'ONE_YEAR';

export interface PosBranchSubscriptionOption {
  /** Stable identifier used in DTOs and the Ebirr metadata payload. */
  period: PosBranchSubscriptionPeriod;
  /** Number of months the subscription covers. */
  months: number;
  /** Total amount billed for the full period. */
  amount: number;
  /** ISO currency code. */
  currency: 'ETB';
  /** Human-friendly label rendered in the gate / billing UI. */
  label: string;
  /** Plan code recorded on `tenant_subscriptions.planCode`. */
  planCode: string;
}

export const POS_BRANCH_SUBSCRIPTION_CURRENCY = 'ETB' as const;

export const POS_BRANCH_SUBSCRIPTION_OPTIONS: readonly PosBranchSubscriptionOption[] =
  [
    {
      period: 'MONTHLY',
      months: 1,
      amount: 1_900,
      currency: POS_BRANCH_SUBSCRIPTION_CURRENCY,
      label: '1 month',
      planCode: 'POS_BRANCH_1M',
    },
    {
      period: 'ONE_YEAR',
      months: 12,
      amount: 22_800,
      currency: POS_BRANCH_SUBSCRIPTION_CURRENCY,
      label: '1 year',
      planCode: 'POS_BRANCH_1Y',
    },
  ] as const;

/**
 * Effective monthly price (ETB) used for derived calculations such as
 * equity-partner payouts. Both periods price at exactly 1,900 ETB / month.
 */
export const POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT = 1_900;

export function findPosBranchSubscriptionOption(
  period: string | null | undefined,
): PosBranchSubscriptionOption | undefined {
  const normalized = String(period || '')
    .trim()
    .toUpperCase();
  return POS_BRANCH_SUBSCRIPTION_OPTIONS.find(
    (option) => option.period === normalized,
  );
}

export function requirePosBranchSubscriptionOption(
  period: string | null | undefined,
): PosBranchSubscriptionOption {
  const option = findPosBranchSubscriptionOption(period);
  if (!option) {
    throw new Error(
      `Unsupported POS branch subscription period: ${String(period ?? '')}. ` +
        `Expected one of: ${POS_BRANCH_SUBSCRIPTION_OPTIONS.map((o) => o.period).join(', ')}.`,
    );
  }
  return option;
}
