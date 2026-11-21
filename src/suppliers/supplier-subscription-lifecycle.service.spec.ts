import { SupplierSubscriptionLifecycleService } from './supplier-subscription-lifecycle.service';

const NOW = new Date('2027-01-01T03:00:00.000Z');
const DEADLINE = new Date('2026-12-31T20:59:59.999Z');

function makeService({
  subs = [] as any[],
  profiles = [] as any[],
}: { subs?: any[]; profiles?: any[] } = {}) {
  const subscriptionsRepo: any = {
    find: jest.fn(async ({ where }: any) => {
      const clauses = Array.isArray(where) ? where : [where];
      const matches = (sub: any, clause: any) => {
        if (clause.status && sub.status !== clause.status) return false;
        if (clause.planCode) {
          const op = clause.planCode;
          if (op._type === 'not') {
            if (op._value._value.includes(sub.planCode)) return false;
          } else {
            const codes = op._value ?? [op];
            if (!codes.includes(sub.planCode)) return false;
          }
        }
        if (
          clause.endsAt?._type === 'lessThan' &&
          !(sub.endsAt < clause.endsAt._value)
        )
          return false;
        if (
          clause.endsAt?._type === 'between' &&
          !(
            sub.endsAt >= clause.endsAt._value[0] &&
            sub.endsAt <= clause.endsAt._value[1]
          )
        )
          return false;
        return true;
      };
      return subs.filter((sub) => clauses.some((c: any) => matches(sub, c)));
    }),
    findOne: jest.fn(
      async ({ where }: any) =>
        subs
          .filter((sub) => sub.supplierProfileId === where.supplierProfileId)
          .sort((a, b) => b.id - a.id)[0] ?? null,
    ),
    save: jest.fn(async (value: any) => value),
  };
  const profilesRepo: any = {
    findOne: jest.fn(
      async ({ where }: any) =>
        profiles.find((profile) => profile.id === where.id) ?? null,
    ),
    save: jest.fn(async (value: any) => value),
  };
  return {
    service: new SupplierSubscriptionLifecycleService(
      subscriptionsRepo,
      profilesRepo,
    ),
    subscriptionsRepo,
    profilesRepo,
  };
}

describe('SupplierSubscriptionLifecycleService.expireLapsedFreePeriods', () => {
  it('closes a supplier account whose free period ran out', async () => {
    // Without this the account stays ACTIVE for ever: activationStatus is what
    // every supplier gate reads, and nothing else moves it back.
    const sub = {
      id: 1,
      supplierProfileId: 55,
      planCode: 'SUPPLIER_FREE_2026',
      status: 'TRIAL',
      endsAt: DEADLINE,
      metadata: null,
    };
    const profile = { id: 55, userId: 9, activationStatus: 'ACTIVE' };
    const { service } = makeService({ subs: [sub], profiles: [profile] });

    expect(await service.expireLapsedFreePeriods(NOW)).toBe(1);
    expect(sub.status).toBe('EXPIRED');
    expect(profile.activationStatus).toBe('EXPIRED');
  });

  it('closes a FREE period silently — the owner is never told it is ending', async () => {
    // By product decision: no countdown, no ending notice, no ended notice for
    // a free supplier account. The service now holds a mailer, but only for
    // PAID terms — so the guard is on behaviour: a free row about to end, and
    // one that just ended, must produce no email at all.
    const mailer = { renewalDue: jest.fn(), termEnded: jest.fn() };
    const { subscriptionsRepo, profilesRepo } = makeService({
      subs: [
        {
          id: 1,
          supplierProfileId: 55,
          planCode: 'SUPPLIER_FREE_2026',
          status: 'ACTIVE',
          endsAt: new Date('2027-01-02T00:00:00.000Z'),
        },
        {
          id: 2,
          supplierProfileId: 56,
          planCode: 'SUPPLIER_FREE_2026',
          status: 'TRIAL',
          endsAt: new Date('2026-12-31T20:59:59.999Z'),
        },
      ],
      profiles: [
        { id: 55, userId: 9, companyName: 'A', isActive: true },
        { id: 56, userId: 10, companyName: 'B', isActive: true },
      ],
    });
    const service: any = new SupplierSubscriptionLifecycleService(
      subscriptionsRepo,
      profilesRepo,
      mailer as any,
    );

    expect(typeof service.sendUpcomingFreePeriodReminders).toBe('undefined');
    expect(await service.sendPaidTermNotices(NOW)).toBe(0);
    expect(mailer.renewalDue).not.toHaveBeenCalled();
    expect(mailer.termEnded).not.toHaveBeenCalled();
  });

  it('does not knock offline a supplier who paid before the deadline', async () => {
    // The lapsed free row is no longer the account's newest one — expiring it
    // must not close the subscription they just bought.
    const freeRow = {
      id: 1,
      supplierProfileId: 55,
      planCode: 'SUPPLIER_FREE_2026',
      status: 'TRIAL',
      endsAt: DEADLINE,
      metadata: null,
    };
    const paidRow = {
      id: 2,
      supplierProfileId: 55,
      planCode: 'SUPPLIER_1Y',
      status: 'ACTIVE',
      endsAt: new Date('2027-12-01T00:00:00.000Z'),
      metadata: null,
    };
    const profile = { id: 55, userId: 9, activationStatus: 'ACTIVE' };
    const { service } = makeService({
      subs: [freeRow, paidRow],
      profiles: [profile],
    });

    await service.expireLapsedFreePeriods(NOW);

    expect(freeRow.status).toBe('EXPIRED');
    expect(profile.activationStatus).toBe('ACTIVE');
  });

  it('closes a supplier whose paid 14-day trial has run out', async () => {
    // Nothing else expires a supplier term, so without this a 500 ETB trial
    // would keep the account open for good.
    const sub = {
      id: 1,
      supplierProfileId: 55,
      planCode: 'SUPPLIER_STARTER_14D',
      status: 'ACTIVE',
      endsAt: new Date('2026-12-20T00:00:00.000Z'),
      metadata: null,
    };
    const profile = { id: 55, userId: 9, activationStatus: 'ACTIVE' };
    const { service } = makeService({ subs: [sub], profiles: [profile] });

    expect(await service.expireLapsedFreePeriods(NOW)).toBe(1);
    expect(sub.status).toBe('EXPIRED');
    expect(profile.activationStatus).toBe('EXPIRED');
  });

  it('leaves a paid term alone while it is running or in its grace days', async () => {
    const running = {
      id: 1,
      supplierProfileId: 55,
      planCode: 'SUPPLIER_STARTER_14D',
      status: 'ACTIVE',
      endsAt: new Date('2027-01-09T00:00:00.000Z'),
    };
    const inGrace = {
      id: 2,
      supplierProfileId: 56,
      planCode: 'SUPPLIER_1M',
      status: 'ACTIVE',
      endsAt: new Date('2026-12-30T12:00:00.000Z'), // ended 1.6 days ago
    };
    const { service } = makeService({ subs: [running, inGrace] });

    expect(await service.expireLapsedFreePeriods(NOW)).toBe(0);
    expect(running.status).toBe('ACTIVE');
    expect(inGrace.status).toBe('ACTIVE');
  });

  it('closes a paid supplier term once its grace days are spent', async () => {
    const sub = {
      id: 2,
      supplierProfileId: 56,
      planCode: 'SUPPLIER_1Y',
      status: 'ACTIVE',
      endsAt: new Date('2026-12-20T00:00:00.000Z'),
    };
    const profile = { id: 56, userId: 9, activationStatus: 'ACTIVE' };
    const { service } = makeService({ subs: [sub], profiles: [profile] });

    expect(await service.expireLapsedFreePeriods(NOW)).toBe(1);
    expect(profile.activationStatus).toBe('EXPIRED');
  });

  it('emails a paying supplier before the term ends and once when it has, and never twice', async () => {
    const mailer = { renewalDue: jest.fn(), termEnded: jest.fn() };
    const dueSoon = {
      id: 3,
      supplierProfileId: 57,
      planCode: 'SUPPLIER_1Y',
      status: 'ACTIVE',
      endsAt: new Date('2027-01-03T03:00:00.000Z'), // 2 days out
      metadata: null as any,
    };
    const ended = {
      id: 4,
      supplierProfileId: 58,
      planCode: 'SUPPLIER_1M',
      status: 'ACTIVE',
      endsAt: new Date('2026-12-31T03:00:00.000Z'), // ended yesterday
      metadata: null as any,
    };
    const { subscriptionsRepo, profilesRepo } = makeService({
      subs: [dueSoon, ended],
      profiles: [
        { id: 57, userId: 9, companyName: 'Horn Trading', isActive: true },
        {
          id: 58,
          userId: 10,
          companyName: 'Jigjiga Wholesale',
          isActive: true,
        },
      ],
    });
    const service = new SupplierSubscriptionLifecycleService(
      subscriptionsRepo,
      profilesRepo,
      mailer as any,
    );

    expect(await service.sendPaidTermNotices(NOW)).toBe(2);
    expect(mailer.renewalDue).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectName: 'Horn Trading',
        daysLeft: 3,
        supplier: true,
      }),
    );
    expect(mailer.termEnded).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectName: 'Jigjiga Wholesale',
        supplier: true,
      }),
    );
    expect(await service.sendPaidTermNotices(NOW)).toBe(0);
  });
});
