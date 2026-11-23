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

/**
 * The paid trial a NEW supplier account starts on — the same offer a new POS
 * branch gets, at the same figure, so there is one number to tell people:
 * 500 ETB by transfer for 14 days, then a full term. It is a paid term in every
 * respect (it can be followed by a full term at any point, which is added after
 * the trial days) and is only for an account that has never subscribed.
 */
export interface SupplierStarterOption {
  period: 'STARTER';
  days: number;
  amount: number;
  currency: 'ETB';
  label: string;
  planCode: string;
}

export const SUPPLIER_STARTER_OPTION: SupplierStarterOption = {
  period: 'STARTER',
  days: 14,
  amount: 500,
  currency: SUPPLIER_SUBSCRIPTION_CURRENCY,
  label: '14-day trial',
  // Not "TRIAL"/"FREE": those mark the free period, which behaves differently.
  planCode: 'SUPPLIER_STARTER_14D',
};

export type SupplierPaymentPeriod = SupplierSubscriptionPeriod | 'STARTER';
export type SupplierPaymentOption =
  | SupplierSubscriptionOption
  | SupplierStarterOption;

export function isSupplierStarterOption(
  option: SupplierPaymentOption | null | undefined,
): option is SupplierStarterOption {
  return option?.period === 'STARTER';
}

export function findSupplierPaymentOption(
  period: string | null | undefined,
): SupplierPaymentOption | undefined {
  const normalized = String(period || '')
    .trim()
    .toUpperCase();
  if (normalized === SUPPLIER_STARTER_OPTION.period) {
    return SUPPLIER_STARTER_OPTION;
  }
  return findSupplierSubscriptionOption(normalized);
}

/**
 * May this supplier account start on the trial? Only a NEW one — no
 * subscription row at all. Any row (the free period, a paid, BNPL or
 * admin-written term, an expired one) means the account is renewing, and
 * renews at 1 month or 1 year. Reading "no payment reference" instead offered
 * the trial on the Billing page of free-period and BNPL suppliers (owner
 * 2026-11-23). A row is only written once a payment is approved or a period
 * granted, so an account waiting on its first payment still has none.
 */
export function isSupplierStarterEligible(
  latest: { metadata?: Record<string, any> | null } | null | undefined,
): boolean {
  return !latest;
}
