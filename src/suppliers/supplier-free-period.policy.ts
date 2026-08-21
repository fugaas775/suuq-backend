import { TenantSubscriptionStatus } from '../retail/entities/tenant-subscription.entity';
import { SupplierSubscription } from './entities/supplier-subscription.entity';

export {
  getFreePeriodEndsAt as getSupplierFreePeriodEndsAt,
  isFreePeriodOpen as isSupplierFreePeriodOpen,
  formatFreePeriodEndsAt as formatSupplierFreePeriodEndsAt,
} from '../free-workspace/free-period.policy';

/**
 * The plan code that marks a supplier account opened on the free period rather
 * than paid for.
 *
 * Suppliers used to pay from day one — 2,900 ETB before a single offer could be
 * published. The platform now gives every account one free workspace until the
 * promotion's deadline, and the account chooses what to spend it on: a POS
 * branch OR a supplier account. So a supplier profile can now be live without
 * having paid, and something has to say which it is. This code does.
 *
 * Like the POS side, the code is the marker and not the status: a hand-set
 * TRIAL row (an operator extending someone) keeps its own meaning, and only a
 * row stamped with this code opens a supplier account unpaid.
 */
export const SUPPLIER_FREE_PERIOD_PLAN_CODE = 'SUPPLIER_FREE_2026';

/**
 * Codes recognised as a free-period supplier row — current first, then any
 * superseded ones. Never shorten this list: the code is baked into rows already
 * in the database, and dropping one would strand the accounts holding it.
 */
export const SUPPLIER_FREE_PERIOD_PLAN_CODES = [
  SUPPLIER_FREE_PERIOD_PLAN_CODE,
] as const;

/** This row was created by the free-period grant — whatever its status now is. */
export function isSupplierFreePeriodPlan(
  subscription: SupplierSubscription | null | undefined,
): boolean {
  return (SUPPLIER_FREE_PERIOD_PLAN_CODES as readonly string[]).includes(
    subscription?.planCode ?? '',
  );
}

/** A free period that has not run out — the supplier may trade unpaid. */
export function isLiveSupplierFreePeriod(
  subscription: SupplierSubscription | null | undefined,
  now: number = Date.now(),
): boolean {
  if (
    subscription?.status !== TenantSubscriptionStatus.TRIAL ||
    !isSupplierFreePeriodPlan(subscription)
  ) {
    return false;
  }

  const endsAt = subscription?.endsAt
    ? new Date(subscription.endsAt).getTime()
    : null;

  return endsAt != null && endsAt > now;
}

/**
 * The free period ran out. Answers the same before and after the sweep persists
 * EXPIRED, so callers do not change behaviour the night it first runs.
 */
export function isLapsedSupplierFreePeriod(
  subscription: SupplierSubscription | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!isSupplierFreePeriodPlan(subscription)) {
    return false;
  }

  if (subscription?.status === TenantSubscriptionStatus.EXPIRED) {
    return true;
  }

  const endsAt = subscription?.endsAt
    ? new Date(subscription.endsAt).getTime()
    : null;

  return (
    subscription?.status === TenantSubscriptionStatus.TRIAL &&
    endsAt != null &&
    endsAt <= now
  );
}
