import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';

/**
 * The free trial a brand-new POS signup is provisioned with.
 *
 * A first-time Google/Apple signup is auto-provisioned a QSR branch that opens
 * immediately (see PosPortalOnboardingService.createTrialWorkspaceForNewUser),
 * so the owner can actually use POS-S before paying. The trial is what makes
 * that branch openable: `getBranchWorkspaceStatus` reports a LIVE trial as
 * ACTIVE, and a LAPSED one as EXPIRED — which drops the branch out of the
 * session and routes the owner to the normal Ebirr activation paywall.
 *
 * The plan code is the marker. Legacy TRIAL subscriptions (created before this
 * existed, and any TRIAL row an admin sets by hand) keep their old
 * PAYMENT_REQUIRED meaning — only rows stamped with one of the auto-trial plan
 * codes can open a branch without payment, and only until `endsAt`.
 */
export const POS_SELF_SERVE_TRIAL_PLAN_CODE = 'POS_BRANCH_TRIAL_6M';

export const POS_SELF_SERVE_TRIAL_MONTHS = 6;

/**
 * Plan codes that mark an auto-trial row — current first, then superseded ones.
 *
 * The code is baked into every row already in the database, so shortening the
 * list would strand live trials: a branch whose row still says the old code
 * would stop matching, drop to PAYMENT_REQUIRED and lock its owner out
 * mid-trial. Old codes stay recognised for as long as their rows can exist.
 */
export const POS_SELF_SERVE_TRIAL_PLAN_CODES = [
  POS_SELF_SERVE_TRIAL_PLAN_CODE,
  'POS_BRANCH_TRIAL_14D',
] as const;

/** The service format a brand-new signup is auto-provisioned with. */
export const POS_SELF_SERVE_TRIAL_SERVICE_FORMAT = 'QSR';

/**
 * Calendar months, not 30-day blocks: a trial started on the 3rd ends on the
 * 3rd, which is what "six months free" means to the owner reading the date.
 * A start day with no counterpart in the end month (31 Aug + 6) clamps back to
 * that month's last day rather than spilling into the next one.
 */
export function getPosSelfServeTrialEndsAt(startsAt: Date): Date {
  const endsAt = new Date(startsAt.getTime());
  const startDayOfMonth = endsAt.getDate();

  endsAt.setMonth(endsAt.getMonth() + POS_SELF_SERVE_TRIAL_MONTHS);
  if (endsAt.getDate() !== startDayOfMonth) {
    endsAt.setDate(0);
  }

  return endsAt;
}

/**
 * This row was created by the auto-trial — whatever its status is NOW.
 *
 * Once the lifecycle cron persists a lapsed trial as EXPIRED (and once a paid
 * conversion overwrites the row), status-based predicates stop matching it.
 * Reporting and audit code that asks "did this workspace start life on the
 * trial?" must use this one.
 */
export function isPosSelfServeTrialPlan(
  subscription: TenantSubscription | null | undefined,
): boolean {
  return (POS_SELF_SERVE_TRIAL_PLAN_CODES as readonly string[]).includes(
    subscription?.planCode ?? '',
  );
}

/** Still on the unpaid trial — not yet converted, not yet expired. */
export function isPosSelfServeTrialSubscription(
  subscription: TenantSubscription | null | undefined,
): boolean {
  return (
    subscription?.status === TenantSubscriptionStatus.TRIAL &&
    isPosSelfServeTrialPlan(subscription)
  );
}

/**
 * The trial ran out. Answers the same before and after the cron persists
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

/** An auto-trial that has not run out yet — the branch may open unpaid. */
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
