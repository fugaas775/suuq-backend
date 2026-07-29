import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';
import {
  getPosSelfServeTrialEndsAt,
  isLivePosSelfServeTrial,
  isPosSelfServeTrialSubscription,
  POS_SELF_SERVE_TRIAL_DAYS,
  POS_SELF_SERVE_TRIAL_PLAN_CODE,
} from './pos-self-serve-trial.policy';

function buildSubscription(
  overrides: Partial<TenantSubscription> = {},
): TenantSubscription {
  return {
    status: TenantSubscriptionStatus.TRIAL,
    planCode: POS_SELF_SERVE_TRIAL_PLAN_CODE,
    endsAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  } as TenantSubscription;
}

describe('pos self-serve trial policy', () => {
  it('ends the trial the configured number of days after it starts', () => {
    const startsAt = new Date('2026-07-01T09:00:00.000Z');

    expect(getPosSelfServeTrialEndsAt(startsAt).toISOString()).toBe(
      new Date(
        startsAt.getTime() + POS_SELF_SERVE_TRIAL_DAYS * 86_400_000,
      ).toISOString(),
    );
  });

  it('treats an unexpired auto-trial as live', () => {
    expect(isLivePosSelfServeTrial(buildSubscription())).toBe(true);
  });

  it('treats a lapsed auto-trial as not live so the paywall takes over', () => {
    const lapsed = buildSubscription({
      endsAt: new Date(Date.now() - 60_000),
    });

    expect(isPosSelfServeTrialSubscription(lapsed)).toBe(true);
    expect(isLivePosSelfServeTrial(lapsed)).toBe(false);
  });

  it('never opens a workspace on a legacy TRIAL row from another plan', () => {
    const legacy = buildSubscription({ planCode: 'LEGACY_TRIAL' });

    expect(isPosSelfServeTrialSubscription(legacy)).toBe(false);
    expect(isLivePosSelfServeTrial(legacy)).toBe(false);
  });

  it('never opens a workspace on an auto-trial row with no end date', () => {
    expect(isLivePosSelfServeTrial(buildSubscription({ endsAt: null }))).toBe(
      false,
    );
  });

  it('ignores non-trial subscriptions', () => {
    expect(
      isPosSelfServeTrialSubscription(
        buildSubscription({ status: TenantSubscriptionStatus.ACTIVE }),
      ),
    ).toBe(false);
    expect(isLivePosSelfServeTrial(null)).toBe(false);
  });
});
