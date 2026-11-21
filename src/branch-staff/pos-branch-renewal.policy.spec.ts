import { TenantSubscriptionStatus } from '../retail/entities/tenant-subscription.entity';
import {
  canRenewEarly,
  isLivePaidTerm,
  resolveStarterEligibility,
} from './pos-branch-renewal.policy';
import { POS_BRANCH_STARTER_OPTION } from './pos-workspace-pricing';

const DAY = 86_400_000;

describe('the paid 14-day trial', () => {
  it('is 500 ETB for 14 days', () => {
    expect(POS_BRANCH_STARTER_OPTION).toMatchObject({
      amount: 500,
      days: 14,
      currency: 'ETB',
      planCode: 'POS_BRANCH_STARTER_14D',
    });
  });

  it('is treated as a paid term, not a free period — it can be renewed early and gets grace', () => {
    const now = Date.now();
    const trial = {
      planCode: POS_BRANCH_STARTER_OPTION.planCode,
      status: TenantSubscriptionStatus.ACTIVE,
      endsAt: new Date(now + 9 * DAY),
    };
    expect(isLivePaidTerm(trial, now)).toBe(true);
    expect(canRenewEarly(trial, now)).toBe(true);
    expect(
      canRenewEarly({ ...trial, endsAt: new Date(now - DAY) }, now, 3),
    ).toBe(true);
  });

  it('is offered to a brand-new branch in a workspace with nothing outstanding', () => {
    expect(resolveStarterEligibility([], 21).eligible).toBe(true);
    expect(resolveStarterEligibility([], null).eligible).toBe(true);
  });

  it('is offered again once the earlier trial branch went on to subscribe', () => {
    const rows = [
      {
        branchId: 55,
        planCode: 'POS_BRANCH_STARTER_14D',
        metadata: { lastActivationReferenceId: 'POSACT-55-1-STARTER' },
      },
      {
        branchId: 55,
        planCode: 'POS_BRANCH_1M',
        metadata: { lastActivationReferenceId: 'POSACT-55-2-MONTHLY' },
      },
    ];
    expect(resolveStarterEligibility(rows, null).eligible).toBe(true);
  });

  it('is not a way to keep a branch going cheaply', () => {
    const tookTrial = [
      {
        branchId: 21,
        planCode: 'POS_BRANCH_STARTER_14D',
        metadata: { lastActivationReferenceId: 'POSACT-21-1-STARTER' },
      },
    ];
    expect(resolveStarterEligibility(tookTrial, 21).eligible).toBe(false);
    // ...nor by opening a fresh branch each fortnight.
    expect(resolveStarterEligibility(tookTrial, null).eligible).toBe(false);
  });
});
