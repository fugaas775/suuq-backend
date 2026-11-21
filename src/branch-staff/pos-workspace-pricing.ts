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

/* ------------------------------------------------------------------ */
/* What a particular branch pays                                       */
/* ------------------------------------------------------------------ */

/**
 * The list above is the standard rate. Two things move a branch off it:
 *
 *  - its FORMAT — a school runs admissions, fees, classes, exams and payroll
 *    on the same subscription, and is priced at 4,900 ETB a month;
 *  - a DISCOUNT the platform has granted that one branch (0–100 %), set by an
 *    admin with a reason. At 100 % the branch is complimentary: it owes
 *    nothing, is never asked to pay, and is renewed by the platform.
 *
 * Everything that quotes, charges or records a branch price goes through
 * `priceOptionForBranch` / `monthlyRateForBranch`, so the figure an owner is
 * shown, the amount on their payment claim and the amount written on the term
 * cannot drift apart.
 */
export interface BranchPricingProfile {
  serviceFormat?: string | null;
  subscriptionDiscountPercent?: number | string | null;
}

/** Monthly list price by format; anything not named here pays the standard rate. */
export const POS_BRANCH_MONTHLY_LIST_PRICE_BY_FORMAT: Readonly<
  Record<string, number>
> = { SCHOOL: 4_900 };

/** Paying a year up front takes 10 % off twelve months, for every format. */
const YEARLY_DISCOUNT_RATE = 0.1;

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

/** 0–100, two decimals; anything unreadable is no discount. */
export function normalizeDiscountPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, roundMoney(n));
}

/** The monthly price before any discount: 4,900 for a school, else 3,900. */
export function listMonthlyRateForFormat(
  serviceFormat: string | null | undefined,
): number {
  const key = String(serviceFormat || '')
    .trim()
    .toUpperCase();
  return (
    POS_BRANCH_MONTHLY_LIST_PRICE_BY_FORMAT[key] ??
    POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT
  );
}

/** A term's price before any discount, for the branch's format. */
function listAmountFor(
  option: PosBranchPaymentOption,
  serviceFormat: string | null | undefined,
): number {
  if (isPosBranchStarterOption(option)) return option.amount;
  const monthly = listMonthlyRateForFormat(serviceFormat);
  if (monthly === POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT) {
    return option.amount;
  }
  const full = monthly * option.months;
  return option.period === 'ONE_YEAR'
    ? roundMoney(full * (1 - YEARLY_DISCOUNT_RATE))
    : full;
}

export function isComplimentaryBranch(
  profile: BranchPricingProfile | null | undefined,
): boolean {
  return normalizeDiscountPercent(profile?.subscriptionDiscountPercent) >= 100;
}

/** What this branch pays a month: its format's rate, less its discount. */
export function monthlyRateForBranch(
  profile: BranchPricingProfile | null | undefined,
): number {
  const discount = normalizeDiscountPercent(
    profile?.subscriptionDiscountPercent,
  );
  return roundMoney(
    listMonthlyRateForFormat(profile?.serviceFormat) * (1 - discount / 100),
  );
}

export type PricedForBranch<T extends PosBranchPaymentOption> = T & {
  /** The price before this branch's discount. */
  listAmount: number;
  discountPercent: number;
};

/**
 * The same option, priced for one branch. `amount` is what is charged;
 * `listAmount` is what it would have been without the discount.
 */
export function priceOptionForBranch<T extends PosBranchPaymentOption>(
  option: T,
  profile: BranchPricingProfile | null | undefined,
): PricedForBranch<T> {
  const listAmount = listAmountFor(option, profile?.serviceFormat);
  const discountPercent = normalizeDiscountPercent(
    profile?.subscriptionDiscountPercent,
  );
  return {
    ...option,
    amount: roundMoney(listAmount * (1 - discountPercent / 100)),
    listAmount,
    discountPercent,
  } as unknown as PricedForBranch<T>;
}

/** The monthly and yearly terms as this branch would be charged for them. */
export function subscriptionOptionsForBranch(
  profile: BranchPricingProfile | null | undefined,
): PricedForBranch<PosBranchSubscriptionOption>[] {
  return POS_BRANCH_SUBSCRIPTION_OPTIONS.map((option) =>
    priceOptionForBranch(option, profile),
  );
}

export function starterOptionForBranch(
  profile: BranchPricingProfile | null | undefined,
): PricedForBranch<PosBranchStarterOption> {
  return priceOptionForBranch(POS_BRANCH_STARTER_OPTION, profile);
}
