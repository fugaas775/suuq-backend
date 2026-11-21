/**
 * POS branch subscription pricing.
 *
 * Branches subscribe per-period: a 1-month plan or a 1-year plan. Pricing is
 * strictly per-branch (not per-tenant) and there are no plan tiers — only the
 * period differs. (The legacy 6-month plan has been retired; existing
 * SIX_MONTHS subscription rows keep being honoured until they expire.)
 *
 * Effective monthly equivalent is 3,900 ETB, so equity-partner
 * payouts (1/2 of monthly = 1,950 ETB) scale with the branch price.
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
      amount: 3_900,
      currency: POS_BRANCH_SUBSCRIPTION_CURRENCY,
      label: '1 month',
      planCode: 'POS_BRANCH_1M',
    },
    {
      period: 'ONE_YEAR',
      months: 12,
      // 10% discount off 12× the 3,900 ETB monthly price (46,800 → 42,120) to
      // reward paying for a full year up front. Must match the pos-s frontend
      // POS_BRANCH_SUBSCRIPTION_OPTIONS so the charged amount lines up with the
      // price displayed at the gate / billing UI.
      amount: 42_120,
      currency: POS_BRANCH_SUBSCRIPTION_CURRENCY,
      label: '1 year',
      planCode: 'POS_BRANCH_1Y',
    },
  ] as const;

/**
 * Effective monthly price (ETB) used for derived calculations such as
 * equity-partner payouts. Both periods price at exactly 3,900 ETB / month.
 */
export const POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT = 3_900;

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

/**
 * The paid trial a NEW branch starts on: a small transfer up front, then the
 * branch trades for a fortnight before the first full term is due.
 *
 * Why 500 ETB / 14 days. Every payment is now a transfer an admin verifies by
 * hand, so a trial has to cost enough that only someone who means to open a
 * shop sends it (and that it is worth a person checking the account) — and
 * little enough that it is no obstacle: 500 is about an eighth of the 3,900
 * monthly price, a round figure to send, and roughly a quarter of what 14 days
 * cost at the full rate. Fourteen days covers two weekly trading cycles, which
 * is what it takes to load a catalogue, train staff and close a week's books.
 *
 * It is a term like any other once paid: the branch can pay for its first full
 * term at any point in the trial and that term is added AFTER the trial days,
 * so trying before buying costs nothing extra.
 */
export interface PosBranchStarterOption {
  period: 'STARTER';
  days: number;
  amount: number;
  currency: 'ETB';
  label: string;
  planCode: string;
}

export const POS_BRANCH_STARTER_OPTION: PosBranchStarterOption = {
  period: 'STARTER',
  days: 14,
  amount: 500,
  currency: POS_BRANCH_SUBSCRIPTION_CURRENCY,
  label: '14-day trial',
  // Deliberately not "TRIAL"/"FREE" in the code: those mark a FREE period, which
  // gets no grace, no reminders and cannot be renewed early. This one is paid.
  planCode: 'POS_BRANCH_STARTER_14D',
};

export type PosBranchPaymentPeriod = PosBranchSubscriptionPeriod | 'STARTER';
export type PosBranchPaymentOption =
  | PosBranchSubscriptionOption
  | PosBranchStarterOption;

export function isPosBranchStarterOption(
  option: PosBranchPaymentOption | null | undefined,
): option is PosBranchStarterOption {
  return option?.period === 'STARTER';
}

/** A regular term, or the starter trial — anything a branch payment can be for. */
export function findPosBranchPaymentOption(
  period: string | null | undefined,
): PosBranchPaymentOption | undefined {
  const normalized = String(period || '')
    .trim()
    .toUpperCase();
  if (normalized === POS_BRANCH_STARTER_OPTION.period) {
    return POS_BRANCH_STARTER_OPTION;
  }
  return findPosBranchSubscriptionOption(normalized);
}

/** Months a payment option covers; null for the starter, which is in days. */
export function monthsOfPaymentOption(
  option: PosBranchPaymentOption,
): number | null {
  return isPosBranchStarterOption(option) ? null : option.months;
}

/** When a term bought with this option ends, counted from `startsAt`. */
export function resolvePaymentOptionEnd(
  option: PosBranchPaymentOption,
  startsAt: Date,
  addMonths: (from: Date, months: number) => Date,
): Date {
  return isPosBranchStarterOption(option)
    ? new Date(startsAt.getTime() + option.days * 86_400_000)
    : addMonths(startsAt, option.months);
}
