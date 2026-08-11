import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';
import {
  getPosSelfServeTrialEndsAt,
  isLapsedPosSelfServeTrial,
  isLivePosSelfServeTrial,
  isPosSelfServeTrialPlan,
  isPosSelfServeTrialSubscription,
  POS_SELF_SERVE_TRIAL_MONTHS,
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
  it('ends the trial the configured number of calendar months later', () => {
    // 1 Jul 2026 + 6 months = 1 Jan 2027.
    const startsAt = new Date(2026, 6, 1, 9, 0, 0);
    const expected = new Date(
      2026,
      6 + POS_SELF_SERVE_TRIAL_MONTHS,
      1,
      9,
      0,
      0,
    );
    const endsAt = getPosSelfServeTrialEndsAt(startsAt);

    // Same day-of-month and clock time, six months on.
    expect(endsAt.toISOString()).toBe(expected.toISOString());
    expect(endsAt.getFullYear()).toBe(2027);
    expect(endsAt.getMonth()).toBe(0);
    expect(endsAt.getDate()).toBe(1);
  });

  it('clamps a start day the end month does not have', () => {
    // 31 Aug + 6 months has no 31 Feb — the trial ends on the last of February
    // rather than spilling into March.
    const endsAt = getPosSelfServeTrialEndsAt(new Date(2026, 7, 31, 9, 0, 0));

    expect(endsAt.getFullYear()).toBe(2027);
    expect(endsAt.getMonth()).toBe(1);
    expect(endsAt.getDate()).toBe(28);
  });

  it('still recognises a trial row stamped with a superseded plan code', () => {
    // Rows created before the trial was lengthened must keep opening their
    // branch until their own endsAt, not lock out mid-trial.
    const legacy = buildSubscription({ planCode: 'POS_BRANCH_TRIAL_14D' });

    expect(isPosSelfServeTrialPlan(legacy)).toBe(true);
    expect(isLivePosSelfServeTrial(legacy)).toBe(true);
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
  describe('predicate split (survives the cron persisting EXPIRED)', () => {
    it('still recognises the plan once the row has been expired', () => {
      const expired = buildSubscription({
        status: TenantSubscriptionStatus.EXPIRED,
        endsAt: new Date(Date.now() - 86_400_000),
      });

      // Status-based predicates stop matching...
      expect(isPosSelfServeTrialSubscription(expired)).toBe(false);
      expect(isLivePosSelfServeTrial(expired)).toBe(false);
      // ...but "did this start life on the trial?" must not.
      expect(isPosSelfServeTrialPlan(expired)).toBe(true);
    });

    it('answers lapsed the same before and after the sweep', () => {
      const lapsedNotYetSwept = buildSubscription({
        endsAt: new Date(Date.now() - 60_000),
      });
      const swept = buildSubscription({
        status: TenantSubscriptionStatus.EXPIRED,
        endsAt: new Date(Date.now() - 60_000),
      });

      expect(isLapsedPosSelfServeTrial(lapsedNotYetSwept)).toBe(true);
      expect(isLapsedPosSelfServeTrial(swept)).toBe(true);
    });

    it('does not call a live trial lapsed, nor a converted row a trial', () => {
      expect(isLapsedPosSelfServeTrial(buildSubscription())).toBe(false);
      // A paid conversion overwrites planCode, so nothing matches any more.
      const converted = buildSubscription({
        planCode: 'POS_BRANCH_1M',
        status: TenantSubscriptionStatus.ACTIVE,
      });
      expect(isPosSelfServeTrialPlan(converted)).toBe(false);
      expect(isLapsedPosSelfServeTrial(converted)).toBe(false);
    });
  });
});
