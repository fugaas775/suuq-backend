import { RetailSubscriptionLifecycleService } from './retail-subscription-lifecycle.service';
import { TenantSubscriptionStatus } from './entities/tenant-subscription.entity';
import { POS_SELF_SERVE_TRIAL_PLAN_CODE } from './pos-self-serve-trial.policy';

function createService() {
  const subscriptionsRepo = {
    find: jest.fn(),
    save: jest.fn(async (v: any) => v),
  };
  const tenantsRepo = {
    findOne: jest.fn(),
  };
  const notificationsService = {
    createAndDispatch: jest.fn(async () => undefined),
  };
  const service = new RetailSubscriptionLifecycleService(
    subscriptionsRepo as any,
    tenantsRepo as any,
    notificationsService as any,
  );
  return {
    service,
    subscriptionsRepo,
    tenantsRepo,
    notificationsService,
  };
}

describe('RetailSubscriptionLifecycleService', () => {
  const now = new Date('2026-06-09T00:00:00.000Z');

  it('expires ACTIVE subscriptions whose term has ended', async () => {
    const { service, subscriptionsRepo } = createService();
    const sub = {
      id: 1,
      status: TenantSubscriptionStatus.ACTIVE,
      endsAt: new Date('2026-06-01T00:00:00.000Z'),
    };
    subscriptionsRepo.find.mockResolvedValueOnce([sub]);

    const count = await service.expireOverdueSubscriptions(now);

    expect(count).toBe(1);
    expect(sub.status).toBe(TenantSubscriptionStatus.EXPIRED);
    expect(subscriptionsRepo.save).toHaveBeenCalledWith([sub]);
  });

  it('sends a one-time renewal reminder to the tenant owner', async () => {
    const { service, subscriptionsRepo, tenantsRepo, notificationsService } =
      createService();
    const sub = {
      id: 7,
      tenantId: 34,
      branchId: 21,
      status: TenantSubscriptionStatus.ACTIVE,
      endsAt: new Date('2026-06-10T00:00:00.000Z'),
      metadata: null as Record<string, any> | null,
    };
    subscriptionsRepo.find.mockResolvedValueOnce([sub]);
    tenantsRepo.findOne.mockResolvedValueOnce({ id: 34, ownerUserId: 900 });

    const sent = await service.sendUpcomingRenewalReminders(now);

    expect(sent).toBe(1);
    expect(notificationsService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 900 }),
    );
    // Idempotency record persisted for this term end.
    expect(sub.metadata?.lifecycleRemindersSent).toEqual({
      endsAt: sub.endsAt.toISOString(),
      milestones: [3],
    });
  });

  it('does not re-send a reminder already sent for the same term end', async () => {
    const { service, subscriptionsRepo, notificationsService } =
      createService();
    const endsAt = new Date('2026-06-10T00:00:00.000Z');
    subscriptionsRepo.find.mockResolvedValueOnce([
      {
        id: 8,
        tenantId: 34,
        status: TenantSubscriptionStatus.ACTIVE,
        endsAt,
        metadata: { renewalReminderSentForEndsAt: endsAt.toISOString() },
      },
    ]);

    const sent = await service.sendUpcomingRenewalReminders(now);

    expect(sent).toBe(0);
    expect(notificationsService.createAndDispatch).not.toHaveBeenCalled();
  });
  const TRIAL_PLAN = 'POS_BRANCH_TRIAL_14D';

  describe('free periods', () => {
    it('expires a lapsed free period so the paywall takes over', async () => {
      const { service, subscriptionsRepo } = createService();
      const sub = {
        id: 3,
        tenantId: 34,
        branchId: 21,
        planCode: TRIAL_PLAN,
        status: TenantSubscriptionStatus.TRIAL,
        endsAt: new Date('2026-06-01T00:00:00.000Z'),
        metadata: null as Record<string, any> | null,
      };
      subscriptionsRepo.find.mockResolvedValueOnce([sub]);

      expect(await service.expireOverdueSubscriptions(now)).toBe(1);
      expect(sub.status).toBe(TenantSubscriptionStatus.EXPIRED);

      // Matched by plan code, not status: a hand-set TRIAL row an admin uses to
      // extend someone indefinitely keeps its open-ended meaning. Superseded
      // codes stay in the list so rows written before the free period was
      // reshaped still expire on their own date.
      const trialWhere = subscriptionsRepo.find.mock.calls[0][0].where.find(
        (clause: any) => clause.planCode,
      );
      expect(trialWhere.planCode._value).toEqual(
        expect.arrayContaining([POS_SELF_SERVE_TRIAL_PLAN_CODE, TRIAL_PLAN]),
      );
    });

    it('expires it silently — the owner is never told it ended', async () => {
      // By product decision: no email, no in-app notice, at any milestone or on
      // the day itself. The branch lands on the paywall, which explains itself.
      const { service, subscriptionsRepo, notificationsService } =
        createService();
      subscriptionsRepo.find.mockResolvedValueOnce([
        {
          id: 3,
          tenantId: 34,
          branchId: 21,
          planCode: TRIAL_PLAN,
          status: TenantSubscriptionStatus.TRIAL,
          endsAt: new Date('2026-06-01T00:00:00.000Z'),
          metadata: null as Record<string, any> | null,
        },
      ]);

      await service.expireOverdueSubscriptions(now);

      expect(notificationsService.createAndDispatch).not.toHaveBeenCalled();
    });

    it('sends no countdown either, however close the deadline is', async () => {
      // The exclusion is at the QUERY, so there is no arrangement of flags that
      // can put a free workspace back into the reminder loop: the row is never
      // fetched. Asserting on the where-clause is what makes that structural.
      const { service, subscriptionsRepo, notificationsService } =
        createService();
      subscriptionsRepo.find.mockResolvedValue([]);

      for (const day of [
        '2026-05-17T00:00:00.000Z', // 30 days out
        '2026-06-09T00:00:00.000Z', // 7
        '2026-06-13T00:00:00.000Z', // 3
        '2026-06-15T00:00:00.000Z', // 1
      ]) {
        expect(await service.sendUpcomingRenewalReminders(new Date(day))).toBe(
          0,
        );
      }

      const where = subscriptionsRepo.find.mock.calls[0][0].where;
      expect(Array.isArray(where)).toBe(false);
      expect(where.status).toBe(TenantSubscriptionStatus.ACTIVE);
      expect(where.planCode).toBeUndefined();
      expect(notificationsService.createAndDispatch).not.toHaveBeenCalled();
    });

    it('keeps warning a PAYING owner — that reminder is owed', async () => {
      const { service, subscriptionsRepo, tenantsRepo, notificationsService } =
        createService();
      const sub = {
        id: 5,
        tenantId: 34,
        branchId: 21,
        planCode: 'POS_BRANCH_1M',
        status: TenantSubscriptionStatus.ACTIVE,
        endsAt: new Date('2026-06-11T00:00:00.000Z'), // 2 days out
        metadata: null as Record<string, any> | null,
      };
      subscriptionsRepo.find.mockResolvedValueOnce([sub]);
      tenantsRepo.findOne.mockResolvedValue({ id: 34, ownerUserId: 900 });

      expect(await service.sendUpcomingRenewalReminders(now)).toBe(1);
      expect(notificationsService.createAndDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'POS_SUBSCRIPTION_RENEWAL' }),
        }),
      );
      expect(sub.metadata?.lifecycleRemindersSent?.milestones).toEqual([3]);
    });
  });
});
