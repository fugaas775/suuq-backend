import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';
import {
  formatPosFreePeriodEndsAt,
  getPosFreePeriodEndsAt,
  isLapsedPosSelfServeTrial,
  isLivePosSelfServeTrial,
  isPosFreePeriodOpen,
  isPosSelfServeTrialPlan,
  isPosSelfServeTrialSubscription,
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

describe('pos self-serve free-period policy', () => {
  const savedDeadline = process.env.POS_FREE_PERIOD_ENDS_AT;

  afterEach(() => {
    if (savedDeadline == null) {
      delete process.env.POS_FREE_PERIOD_ENDS_AT;
    } else {
      process.env.POS_FREE_PERIOD_ENDS_AT = savedDeadline;
    }
  });

  it('ends on the last moment of 31 December 2026 in Addis Ababa', () => {
    delete process.env.POS_FREE_PERIOD_ENDS_AT;

    // Not "six months from now" — one date, the same for everybody, whenever
    // they signed up. 23:59:59.999 +03:00 is 20:59:59.999Z.
    expect(getPosFreePeriodEndsAt().toISOString()).toBe(
      '2026-12-31T20:59:59.999Z',
    );
    expect(formatPosFreePeriodEndsAt()).toBe('31 December 2026');
  });

  it('is open before the deadline and shut after it', () => {
    delete process.env.POS_FREE_PERIOD_ENDS_AT;

    expect(isPosFreePeriodOpen(Date.parse('2026-12-31T20:59:59.000Z'))).toBe(
      true,
    );
    expect(isPosFreePeriodOpen(Date.parse('2027-01-01T00:00:00.000Z'))).toBe(
      false,
    );
  });

  it('honours a moved deadline, and ignores an unparseable one', () => {
    process.env.POS_FREE_PERIOD_ENDS_AT = '2027-06-30T23:59:59.999+03:00';
    expect(getPosFreePeriodEndsAt().toISOString()).toBe(
      '2027-06-30T20:59:59.999Z',
    );

    // A typo in an env var must not silently end every free workspace on the
    // platform — the built-in deadline stands instead.
    process.env.POS_FREE_PERIOD_ENDS_AT = 'next christmas';
    expect(getPosFreePeriodEndsAt().toISOString()).toBe(
      '2026-12-31T20:59:59.999Z',
    );
  });

  it('still recognises a trial row stamped with a superseded plan code', () => {
    // Rows created before the free period was reshaped must keep opening their
    // branch until their own endsAt, not lock out mid-period.
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
