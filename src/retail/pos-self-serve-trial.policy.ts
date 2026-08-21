import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';

/**
 * The free period a brand-new POS signup is provisioned with.
 *
 * A first-time Google/Apple signup is auto-provisioned a QSR branch that opens
 * immediately (see PosPortalOnboardingService.createTrialWorkspaceForNewUser),
 * so the owner can actually use POS-S before paying. The free period is what
 * makes that branch openable: `getBranchWorkspaceStatus` reports a LIVE one as
 * ACTIVE, and a LAPSED one as EXPIRED — which drops the branch out of the
 * session and routes the owner to the normal Ebirr activation paywall.
 *
 * The plan code is the marker. Legacy TRIAL subscriptions (created before this
 * existed, and any TRIAL row an admin sets by hand) keep their old
 * PAYMENT_REQUIRED meaning — only rows stamped with one of the free-period plan
 * codes can open a branch without payment, and only until `endsAt`.
 *
 * ONE free workspace per account, ever — a branch OR a supplier, whichever the
 * account opens first. That allowance is not enforced here: it lives in
 * FreeWorkspaceGrantService, which is the only thing that may hand one out.
 */
export const POS_SELF_SERVE_TRIAL_PLAN_CODE = 'POS_BRANCH_FREE_2026';

/**
 * Plan codes that mark a free-period row — current first, then superseded ones.
 *
 * The code is baked into every row already in the database, so shortening the
 * list would strand live grants: a branch whose row still says an old code
 * would stop matching, drop to PAYMENT_REQUIRED and lock its owner out
 * mid-period. Old codes stay recognised for as long as their rows can exist.
 */
export const POS_SELF_SERVE_TRIAL_PLAN_CODES = [
  POS_SELF_SERVE_TRIAL_PLAN_CODE,
  'POS_BRANCH_TRIAL_6M',
  'POS_BRANCH_TRIAL_14D',
] as const;

/** The service format a brand-new signup is auto-provisioned with. */
export const POS_SELF_SERVE_TRIAL_SERVICE_FORMAT = 'QSR';

/**
 * The deadline is platform-wide — the same date for a free branch and a free
 * supplier account — so it lives in free-period.policy.ts and is re-exported
 * here under POS-flavoured names for the callers that already import from this
 * file.
 */
export {
  getFreePeriodEndsAt as getPosFreePeriodEndsAt,
  isFreePeriodOpen as isPosFreePeriodOpen,
  formatFreePeriodEndsAt as formatPosFreePeriodEndsAt,
} from '../free-workspace/free-period.policy';

/**
 * This row was created by the free-period grant — whatever its status is NOW.
 *
 * Once the lifecycle cron persists a lapsed grant as EXPIRED (and once a paid
 * conversion overwrites the row), status-based predicates stop matching it.
 * Reporting and audit code that asks "did this workspace start life free?"
 * must use this one.
 */
export function isPosSelfServeTrialPlan(
  subscription: TenantSubscription | null | undefined,
): boolean {
  return (POS_SELF_SERVE_TRIAL_PLAN_CODES as readonly string[]).includes(
    subscription?.planCode ?? '',
  );
}

/** Still on the free period — not yet converted, not yet expired. */
export function isPosSelfServeTrialSubscription(
  subscription: TenantSubscription | null | undefined,
): boolean {
  return (
    subscription?.status === TenantSubscriptionStatus.TRIAL &&
    isPosSelfServeTrialPlan(subscription)
  );
}

/**
 * The free period ran out. Answers the same before and after the cron persists
 * EXPIRED, so callers do not change behaviour the night the sweep first runs.
 */
export function isLapsedPosSelfServeTrial(
  subscription: TenantSubscription | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!isPosSelfServeTrialPlan(subscription)) {
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

/** A free period that has not run out yet — the branch may open unpaid. */
export function isLivePosSelfServeTrial(
  subscription: TenantSubscription | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!isPosSelfServeTrialSubscription(subscription)) {
    return false;
  }

  const endsAt = subscription?.endsAt
    ? new Date(subscription.endsAt).getTime()
    : null;

  return endsAt != null && endsAt > now;
}
