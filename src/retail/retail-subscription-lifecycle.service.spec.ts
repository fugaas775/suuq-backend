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
  const branchesRepo = {
    findOne: jest.fn(async () => ({ id: 21, name: 'Bole Bites' })),
  };
  const notificationsService = {
    createAndDispatch: jest.fn(async () => undefined),
  };
  const emailService = {
    sendPosTrialReminderEmail: jest.fn(async () => undefined),
  };
  const service = new RetailSubscriptionLifecycleService(
    subscriptionsRepo as any,
    tenantsRepo as any,
    branchesRepo as any,
    notificationsService as any,
    emailService as any,
  );
  return {
    service,
    subscriptionsRepo,
    tenantsRepo,
    branchesRepo,
    notificationsService,
    emailService,
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

  describe('free trials', () => {
    it('expires a lapsed auto-trial so the paywall takes over', async () => {
      const { service, subscriptionsRepo, tenantsRepo } = createService();
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
      tenantsRepo.findOne.mockResolvedValue({ id: 34, ownerUserId: 900 });

      const count = await service.expireOverdueSubscriptions(now);

      expect(count).toBe(1);
      expect(sub.status).toBe(TenantSubscriptionStatus.EXPIRED);
      // The query must ask for trial rows by PLAN CODE, never by status alone —
      // a hand-set TRIAL row on another plan keeps its open-ended meaning. The
      // superseded code is in the list too, so trials opened before the term was
      // lengthened still expire on their own date.
      const trialWhere = subscriptionsRepo.find.mock.calls[0][0].where.find(
        (clause: any) => clause.planCode,
      );
      expect(trialWhere.planCode._value).toEqual(
        expect.arrayContaining([POS_SELF_SERVE_TRIAL_PLAN_CODE, TRIAL_PLAN]),
      );
    });

    it('tells the owner once when their trial has ended', async () => {
      const { service, subscriptionsRepo, tenantsRepo, notificationsService } =
        createService();
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
      tenantsRepo.findOne.mockResolvedValue({ id: 34, ownerUserId: 900 });

      await service.expireOverdueSubscriptions(now);

      expect(notificationsService.createAndDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 900,
          data: expect.objectContaining({ kind: 'POS_TRIAL_ENDED' }),
        }),
      );
      expect(sub.metadata?.trialEndedNotifiedAt).toBeTruthy();
    });

    it('does not re-announce a trial end it already announced', async () => {
      const { service, subscriptionsRepo, notificationsService } =
        createService();
      subscriptionsRepo.find.mockResolvedValueOnce([
        {
          id: 3,
          tenantId: 34,
          planCode: TRIAL_PLAN,
          status: TenantSubscriptionStatus.TRIAL,
          endsAt: new Date('2026-06-01T00:00:00.000Z'),
          metadata: { trialEndedNotifiedAt: '2026-06-02T00:00:00.000Z' },
        },
      ]);

      await service.expireOverdueSubscriptions(now);

      expect(notificationsService.createAndDispatch).not.toHaveBeenCalled();
    });

    it('warns at 7, then 3, then 1 day — once each', async () => {
      const endsAt = new Date('2026-06-16T00:00:00.000Z'); // 7 days out
      const sub = {
        id: 4,
        tenantId: 34,
        branchId: 21,
        planCode: TRIAL_PLAN,
        status: TenantSubscriptionStatus.TRIAL,
        endsAt,
        metadata: null as Record<string, any> | null,
      };

      async function runOn(day: string) {
        const {
          service,
          subscriptionsRepo,
          tenantsRepo,
          notificationsService,
        } = createService();
        subscriptionsRepo.find.mockResolvedValueOnce([sub]);
        tenantsRepo.findOne.mockResolvedValue({ id: 34, ownerUserId: 900 });
        const sent = await service.sendUpcomingRenewalReminders(new Date(day));
        return { sent, notificationsService };
      }

      const day7 = await runOn('2026-06-09T00:00:00.000Z');
      expect(day7.sent).toBe(1);
      expect(day7.notificationsService.createAndDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'POS_TRIAL_ENDING',
            daysLeft: 7,
          }),
        }),
      );

      // Same day again: nothing new is due.
      expect((await runOn('2026-06-09T00:00:00.000Z')).sent).toBe(0);
      // Still nothing at 5 days out — the next milestone is 3.
      expect((await runOn('2026-06-11T00:00:00.000Z')).sent).toBe(0);

      const day3 = await runOn('2026-06-13T00:00:00.000Z');
      expect(day3.sent).toBe(1);
      expect(sub.metadata?.lifecycleRemindersSent?.milestones).toEqual([7, 3]);

      const day1 = await runOn('2026-06-15T00:00:00.000Z');
      expect(day1.sent).toBe(1);
      expect(sub.metadata?.lifecycleRemindersSent?.milestones).toEqual([
        7, 3, 1,
      ]);
      expect((await runOn('2026-06-15T00:00:00.000Z')).sent).toBe(0);
    });

    it('opens the long trial with a 30-day nudge, then holds until 7', async () => {
      // Six free months is long enough that the end date is out of mind, so the
      // first warning lands a month ahead rather than a week.
      const sub = {
        id: 6,
        tenantId: 34,
        branchId: 21,
        planCode: POS_SELF_SERVE_TRIAL_PLAN_CODE,
        status: TenantSubscriptionStatus.TRIAL,
        endsAt: new Date('2026-12-02T00:00:00.000Z'),
        metadata: null as Record<string, any> | null,
      };

      async function runOn(day: string) {
        const {
          service,
          subscriptionsRepo,
          tenantsRepo,
          notificationsService,
        } = createService();
        subscriptionsRepo.find.mockResolvedValueOnce([sub]);
        tenantsRepo.findOne.mockResolvedValue({ id: 34, ownerUserId: 900 });
        const sent = await service.sendUpcomingRenewalReminders(new Date(day));
        return { sent, notificationsService };
      }

      const day30 = await runOn('2026-11-02T00:00:00.000Z');
      expect(day30.sent).toBe(1);
      expect(day30.notificationsService.createAndDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'POS_TRIAL_ENDING',
            daysLeft: 30,
          }),
        }),
      );

      // Every day in between stays quiet — 30 is spent, 7 is not yet reached.
      expect((await runOn('2026-11-10T00:00:00.000Z')).sent).toBe(0);
      expect((await runOn('2026-11-20T00:00:00.000Z')).sent).toBe(0);

      expect((await runOn('2026-11-25T00:00:00.000Z')).sent).toBe(1);
      expect(sub.metadata?.lifecycleRemindersSent?.milestones).toEqual([30, 7]);
    });

    it('does not re-nudge a trial first seen inside the 30-day window', async () => {
      // A trial the sweep only meets at 7 days left never had a 30-day moment;
      // that milestone is spent, not pending.
      const sub = {
        id: 7,
        tenantId: 34,
        branchId: 21,
        planCode: POS_SELF_SERVE_TRIAL_PLAN_CODE,
        status: TenantSubscriptionStatus.TRIAL,
        endsAt: new Date('2026-06-16T00:00:00.000Z'),
        metadata: null as Record<string, any> | null,
      };

      async function runOn(day: string) {
        const { service, subscriptionsRepo, tenantsRepo } = createService();
        subscriptionsRepo.find.mockResolvedValueOnce([sub]);
        tenantsRepo.findOne.mockResolvedValue({ id: 34, ownerUserId: 900 });
        return service.sendUpcomingRenewalReminders(new Date(day));
      }

      expect(await runOn('2026-06-09T00:00:00.000Z')).toBe(1); // 7 days left
      expect(await runOn('2026-06-10T00:00:00.000Z')).toBe(0);
      expect(sub.metadata?.lifecycleRemindersSent?.milestones).toEqual([7]);
    });

    it('keeps a paid subscription on its single 3-day reminder', async () => {
      const { service, subscriptionsRepo, tenantsRepo, notificationsService } =
        createService();
      const sub = {
        id: 5,
        tenantId: 34,
        planCode: 'POS_BRANCH_1M',
        status: TenantSubscriptionStatus.ACTIVE,
        endsAt: new Date('2026-06-16T00:00:00.000Z'), // 7 days out
        metadata: null as Record<string, any> | null,
      };
      subscriptionsRepo.find.mockResolvedValueOnce([sub]);
      tenantsRepo.findOne.mockResolvedValue({ id: 34, ownerUserId: 900 });

      // 7 days out is a trial-only milestone — a paid term stays quiet.
      expect(await service.sendUpcomingRenewalReminders(now)).toBe(0);
      expect(notificationsService.createAndDispatch).not.toHaveBeenCalled();
    });
  });
  describe('reaching an owner who is not in the app', () => {
    const TRIAL_PLAN = 'POS_BRANCH_TRIAL_14D';

    it('emails the owner at each trial milestone, not just in-app', async () => {
      const { service, subscriptionsRepo, tenantsRepo, emailService } =
        createService();
      const endsAt = new Date('2026-06-16T00:00:00.000Z');
      subscriptionsRepo.find.mockResolvedValueOnce([
        {
          id: 4,
          tenantId: 34,
          branchId: 21,
          planCode: TRIAL_PLAN,
          status: TenantSubscriptionStatus.TRIAL,
          endsAt,
          metadata: null as Record<string, any> | null,
        },
      ]);
      tenantsRepo.findOne.mockResolvedValue({
        id: 34,
        ownerUserId: 900,
        owner: { email: 'owner@example.com' },
      });

      await service.sendUpcomingRenewalReminders(
        new Date('2026-06-09T00:00:00.000Z'),
      );

      expect(emailService.sendPosTrialReminderEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          branchName: 'Bole Bites',
          branchId: 21,
          daysLeft: 7,
        }),
      );
    });

    it('emails the trial-ended notice when the sweep closes a branch', async () => {
      const { service, subscriptionsRepo, tenantsRepo, emailService } =
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
      tenantsRepo.findOne.mockResolvedValue({
        id: 34,
        ownerUserId: 900,
        owner: { email: 'owner@example.com' },
      });

      await service.expireOverdueSubscriptions(now);

      expect(emailService.sendPosTrialReminderEmail).toHaveBeenCalledWith(
        expect.objectContaining({ hasEnded: true, daysLeft: 0 }),
      );
    });

    it('falls back to the tenant billing address when the owner has no account email', async () => {
      const { service, subscriptionsRepo, tenantsRepo, emailService } =
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
      tenantsRepo.findOne.mockResolvedValue({
        id: 34,
        ownerUserId: 900,
        owner: null,
        billingEmail: 'billing@example.com',
      });

      await service.expireOverdueSubscriptions(now);

      expect(emailService.sendPosTrialReminderEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'billing@example.com' }),
      );
    });

    it('still expires the row and notifies in-app when the email fails', async () => {
      const {
        service,
        subscriptionsRepo,
        tenantsRepo,
        notificationsService,
        emailService,
      } = createService();
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
      tenantsRepo.findOne.mockResolvedValue({
        id: 34,
        ownerUserId: 900,
        owner: { email: 'owner@example.com' },
      });
      emailService.sendPosTrialReminderEmail.mockRejectedValue(
        new Error('mailer down'),
      );

      await expect(service.expireOverdueSubscriptions(now)).resolves.toBe(1);

      expect(sub.status).toBe(TenantSubscriptionStatus.EXPIRED);
      expect(notificationsService.createAndDispatch).toHaveBeenCalled();
    });

    it('does not email a paid renewal — that keeps the in-app nudge only', async () => {
      const { service, subscriptionsRepo, tenantsRepo, emailService } =
        createService();
      subscriptionsRepo.find.mockResolvedValueOnce([
        {
          id: 5,
          tenantId: 34,
          branchId: 21,
          planCode: 'POS_BRANCH_1M',
          status: TenantSubscriptionStatus.ACTIVE,
          endsAt: new Date('2026-06-10T00:00:00.000Z'),
          metadata: null as Record<string, any> | null,
        },
      ]);
      tenantsRepo.findOne.mockResolvedValue({
        id: 34,
        ownerUserId: 900,
        owner: { email: 'owner@example.com' },
      });

      await service.sendUpcomingRenewalReminders(now);

      expect(emailService.sendPosTrialReminderEmail).not.toHaveBeenCalled();
    });
  });
});
