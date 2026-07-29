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
 * PAYMENT_REQUIRED meaning — only rows stamped with this plan code can open a
 * branch without payment, and only until `endsAt`.
 */
export const POS_SELF_SERVE_TRIAL_PLAN_CODE = 'POS_BRANCH_TRIAL_14D';

export const POS_SELF_SERVE_TRIAL_DAYS = 14;

/** The service format a brand-new signup is auto-provisioned with. */
export const POS_SELF_SERVE_TRIAL_SERVICE_FORMAT = 'QSR';

export function getPosSelfServeTrialEndsAt(startsAt: Date): Date {
  return new Date(
    startsAt.getTime() + POS_SELF_SERVE_TRIAL_DAYS * 24 * 60 * 60 * 1000,
  );
}

/** A subscription row provisioned by the auto-trial (live or lapsed). */
export function isPosSelfServeTrialSubscription(
  subscription: TenantSubscription | null | undefined,
): boolean {
  return (
    subscription?.status === TenantSubscriptionStatus.TRIAL &&
    subscription?.planCode === POS_SELF_SERVE_TRIAL_PLAN_CODE
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
