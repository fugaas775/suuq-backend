import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';
import {
  billingStateOf,
  monthlyEquivalent,
  pickCurrentSubscription,
  SubscriptionLike,
  summarizeSubscription,
} from './subscription-summary';

const NOW = new Date('2026-10-20T12:00:00Z');

function sub(overrides: Partial<SubscriptionLike> = {}): SubscriptionLike {
  return {
    id: 1,
    planCode: 'POS_BRANCH_SUBSCRIPTION',
    status: TenantSubscriptionStatus.ACTIVE,
    billingInterval: TenantBillingInterval.MONTHLY,
    amount: 3900,
    currency: 'ETB',
    startsAt: new Date('2026-10-01T00:00:00Z'),
    endsAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

describe('monthlyEquivalent', () => {
  it('spreads a period total over its months', () => {
    expect(
      monthlyEquivalent(
        sub({
          billingInterval: TenantBillingInterval.ONE_YEAR,
          amountTotal: '42120.00',
          periodMonths: 12,
        }),
      ),
    ).toBe(3510);
  });

  it('spreads a legacy per-interval amount over the interval', () => {
    expect(
      monthlyEquivalent(
        sub({ billingInterval: TenantBillingInterval.YEARLY, amount: 46800 }),
      ),
    ).toBe(3900);
    expect(monthlyEquivalent(sub({ amount: '3900.00' }))).toBe(3900);
  });

  it('counts a CUSTOM interval with no period length as zero, not a guess', () => {
    expect(
      monthlyEquivalent(
        sub({ billingInterval: TenantBillingInterval.CUSTOM, amount: 5000 }),
      ),
    ).toBe(0);
  });

  it('counts a missing amount as zero', () => {
    expect(monthlyEquivalent(sub({ amount: null }))).toBe(0);
  });
});

describe('pickCurrentSubscription', () => {
  it('returns null for no rows', () => {
    expect(pickCurrentSubscription([])).toBeNull();
  });

  it('prefers the latest start, then the newer row', () => {
    const old = sub({ id: 1, startsAt: new Date('2026-01-01') });
    const renewal = sub({ id: 2, startsAt: new Date('2026-07-01') });
    const sameStartNewer = sub({ id: 3, startsAt: new Date('2026-07-01') });
    expect(pickCurrentSubscription([old, renewal])).toBe(renewal);
    expect(pickCurrentSubscription([sameStartNewer, old, renewal])).toBe(
      sameStartNewer,
    );
  });
});

describe('billingStateOf', () => {
  it('is NONE without a subscription', () => {
    expect(billingStateOf(null, NOW)).toBe('NONE');
  });

  it('is PAYING for active and past-due rows inside their period', () => {
    expect(billingStateOf(sub(), NOW)).toBe('PAYING');
    expect(
      billingStateOf(sub({ status: TenantSubscriptionStatus.PAST_DUE }), NOW),
    ).toBe('PAYING');
    expect(billingStateOf(sub({ endsAt: null }), NOW)).toBe('PAYING');
  });

  it('is LAPSED once an active row has run past its end', () => {
    expect(
      billingStateOf(sub({ endsAt: new Date('2026-10-19T00:00:00Z') }), NOW),
    ).toBe('LAPSED');
  });

  it('is TRIAL only while the trial runs', () => {
    const trial = sub({ status: TenantSubscriptionStatus.TRIAL });
    expect(billingStateOf(trial, NOW)).toBe('TRIAL');
    expect(
      billingStateOf({ ...trial, endsAt: new Date('2026-10-01') }, NOW),
    ).toBe('LAPSED');
  });

  it('is LAPSED for expired and cancelled rows', () => {
    expect(
      billingStateOf(sub({ status: TenantSubscriptionStatus.EXPIRED }), NOW),
    ).toBe('LAPSED');
    expect(
      billingStateOf(sub({ status: TenantSubscriptionStatus.CANCELLED }), NOW),
    ).toBe('LAPSED');
  });
});

describe('summarizeSubscription', () => {
  it('reports whole days remaining, rounded up', () => {
    expect(summarizeSubscription(sub(), NOW).daysRemaining).toBe(12);
  });

  it('reports null days for an open-ended row', () => {
    expect(
      summarizeSubscription(sub({ endsAt: null }), NOW).daysRemaining,
    ).toBeNull();
  });
});
