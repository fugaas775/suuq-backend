import { SupplierSubscriptionLifecycleService } from './supplier-subscription-lifecycle.service';

const NOW = new Date('2027-01-01T03:00:00.000Z');
const DEADLINE = new Date('2026-12-31T20:59:59.999Z');

function makeService({
  subs = [] as any[],
  profiles = [] as any[],
}: { subs?: any[]; profiles?: any[] } = {}) {
  const subscriptionsRepo: any = {
    find: jest.fn(async ({ where }: any) =>
      subs.filter((sub) => {
        if (where.status && sub.status !== where.status) return false;
        if (where.planCode && !where.planCode._value.includes(sub.planCode))
          return false;
        return true;
      }),
    ),
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

  it('closes it silently — the owner is never told it is ending', async () => {
    // By product decision: no countdown, no ending notice, no ended notice, on
    // any channel. The service holds no way to send one, which is the point —
    // this test fails the moment a notification dependency is added back.
    const service: any = new (SupplierSubscriptionLifecycleService as any)(
      { find: jest.fn(async () => []), findOne: jest.fn(), save: jest.fn() },
      { findOne: jest.fn(), save: jest.fn() },
    );

    expect(SupplierSubscriptionLifecycleService.length).toBe(2);
    expect(typeof service.sendUpcomingFreePeriodReminders).toBe('undefined');
    expect(await service.expireLapsedFreePeriods(NOW)).toBe(0);
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
});
