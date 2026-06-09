import { RetailSubscriptionLifecycleService } from './retail-subscription-lifecycle.service';
import { TenantSubscriptionStatus } from './entities/tenant-subscription.entity';

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
  return { service, subscriptionsRepo, tenantsRepo, notificationsService };
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
    // Idempotency flag persisted for this term end.
    expect(sub.metadata?.renewalReminderSentForEndsAt).toBe(
      sub.endsAt.toISOString(),
    );
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
});
