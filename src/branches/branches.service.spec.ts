import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BranchesService } from './branches.service';
import { Branch } from './entities/branch.entity';
import { User } from '../users/entities/user.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';

/**
 * Covers the admin branch list's `ownerNeverSignedIn` flag — the signal that an
 * admin-provisioned branch is waiting on an owner who cannot yet get in, which
 * is what precedes them signing up on a different address and silently forking
 * a second tenant.
 */
describe('BranchesService.adminListBranches', () => {
  let service: BranchesService;
  let branchesRepository: { findAndCount: jest.Mock; count: jest.Mock };
  let subscriptions: Partial<TenantSubscription>[];

  const branchWithOwner = (id: number, owner: Partial<User> | null): Branch =>
    Object.assign(new Branch(), {
      id,
      name: `Branch ${id}`,
      ownerId: owner ? 100 + id : null,
      owner: owner ? Object.assign(new User(), owner) : null,
    });

  beforeEach(async () => {
    branchesRepository = {
      findAndCount: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };

    subscriptions = [];
    const subscriptionQuery = {
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(() => Promise.resolve(subscriptions)),
    };
    const dataSource = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: () => subscriptionQuery,
      })),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        { provide: getRepositoryToken(VendorStore), useValue: {} },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  it('flags an owner that has no way to sign in yet', async () => {
    branchesRepository.findAndCount.mockResolvedValue([
      [branchWithOwner(108, { id: 208, email: 'asalprintingp@gmail.com' })],
      1,
    ]);

    const result = await service.adminListBranches();

    expect(result.items[0]).toMatchObject({
      id: 108,
      ownerNeverSignedIn: true,
    });
  });

  it.each([
    ['a linked Google account', { googleId: 'google-sub-1' }],
    ['a linked Apple account', { appleId: 'apple-sub-1' }],
    ['a password', { password: 'hashed' }],
  ])('does not flag an owner with %s', async (_label, credential) => {
    branchesRepository.findAndCount.mockResolvedValue([
      [
        branchWithOwner(110, {
          id: 210,
          email: 'owner@gmail.com',
          ...credential,
        }),
      ],
      1,
    ]);

    const result = await service.adminListBranches();

    expect(result.items[0]).toMatchObject({ ownerNeverSignedIn: false });
  });

  it('does not flag an ownerless branch', async () => {
    branchesRepository.findAndCount.mockResolvedValue([
      [branchWithOwner(111, null)],
      1,
    ]);

    const result = await service.adminListBranches();

    expect(result.items[0]).toMatchObject({ ownerNeverSignedIn: false });
  });

  // The global ClassSerializerInterceptor strips the owner's @Exclude()'d
  // password only while these are still Branch instances — spreading them into
  // plain objects would quietly start leaking the hash to admins.
  it('keeps the returned items as Branch instances', async () => {
    branchesRepository.findAndCount.mockResolvedValue([
      [branchWithOwner(108, { id: 208, email: 'owner@gmail.com' })],
      1,
    ]);

    const result = await service.adminListBranches();

    expect(result.items[0]).toBeInstanceOf(Branch);
    expect(result.items[0].owner).toBeInstanceOf(User);
  });

  describe('billing', () => {
    const subscription = (
      overrides: Partial<TenantSubscription>,
    ): Partial<TenantSubscription> => ({
      planCode: 'POS_BRANCH_SUBSCRIPTION',
      status: TenantSubscriptionStatus.ACTIVE,
      billingInterval: TenantBillingInterval.MONTHLY,
      amount: 3900,
      currency: 'ETB',
      startsAt: new Date(Date.now() - 5 * 86400000),
      endsAt: new Date(Date.now() + 25 * 86400000),
      ...overrides,
    });

    it('reports a branch with no subscription as NONE', async () => {
      branchesRepository.findAndCount.mockResolvedValue([
        [branchWithOwner(120, null)],
        1,
      ]);

      const result = await service.adminListBranches();

      expect(result.items[0]).toMatchObject({
        billingState: 'NONE',
        subscription: null,
      });
    });

    it("prefers the branch's own subscription over a legacy tenant-wide one", async () => {
      const branch = Object.assign(branchWithOwner(121, null), {
        retailTenantId: 9,
      });
      branchesRepository.findAndCount.mockResolvedValue([[branch], 1]);
      subscriptions = [
        subscription({
          id: 1,
          tenantId: 9,
          branchId: null,
          planCode: 'LEGACY',
        }),
        subscription({
          id: 2,
          tenantId: 9,
          branchId: 121,
          status: TenantSubscriptionStatus.TRIAL,
        }),
      ];

      const result = await service.adminListBranches();

      expect(result.items[0]).toMatchObject({
        billingState: 'TRIAL',
        subscription: { id: 2, monthlyAmount: 3900 },
      });
    });

    it('falls back to the legacy tenant-wide subscription', async () => {
      const branch = Object.assign(branchWithOwner(122, null), {
        retailTenantId: 9,
      });
      branchesRepository.findAndCount.mockResolvedValue([[branch], 1]);
      subscriptions = [
        subscription({ id: 1, tenantId: 9, branchId: null, endsAt: null }),
      ];

      const result = await service.adminListBranches();

      expect(result.items[0]).toMatchObject({
        billingState: 'PAYING',
        subscription: { id: 1, daysRemaining: null },
      });
    });
  });
});

/**
 * The admin-recorded renewal: a further paid term written by hand when the
 * owner paid outside Ebirr, chained from the running period's end at the
 * branch's own price.
 */
describe('BranchesService.extendAdminBranchSubscription', () => {
  const NOW = new Date('2026-11-01T09:00:00Z');
  let service: BranchesService;
  let branchesRepository: { findOne: jest.Mock };
  let subscriptions: Partial<TenantSubscription>[];
  let saved: Record<string, any>[];

  const actor = { id: 1, email: 'admin@suuq.test' };

  const muntaha = (overrides: Partial<Branch> = {}): Branch =>
    Object.assign(new Branch(), {
      id: 47,
      name: 'Muntaha Hotel',
      retailTenantId: 19,
      ...overrides,
    });

  const sixMonthRow = (
    overrides: Partial<TenantSubscription> = {},
  ): Partial<TenantSubscription> => ({
    id: 90,
    tenantId: 19,
    branchId: 47,
    planCode: 'POS_BRANCH_6M',
    status: TenantSubscriptionStatus.ACTIVE,
    billingInterval: TenantBillingInterval.SIX_MONTHS,
    amount: 1900,
    amountTotal: 11400,
    periodMonths: 6,
    currency: 'ETB',
    startsAt: new Date('2026-05-01T14:34:01Z'),
    endsAt: new Date('2026-11-01T14:34:01Z'),
    ...overrides,
  });

  beforeEach(async () => {
    jest.useFakeTimers({ now: NOW });
    branchesRepository = { findOne: jest.fn() };
    subscriptions = [];
    saved = [];

    const subscriptionQuery = {
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(() => Promise.resolve(subscriptions)),
    };
    const subscriptionsRepo = {
      createQueryBuilder: () => subscriptionQuery,
      create: jest.fn((input: Record<string, any>) => ({ ...input })),
      save: jest.fn(async (row: Record<string, any>) => {
        const persisted = { id: 500 + saved.length, createdAt: NOW, ...row };
        saved.push(persisted);
        return persisted;
      }),
    };
    const dataSource = {
      getRepository: jest.fn(() => subscriptionsRepo),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        { provide: getRepositoryToken(VendorStore), useValue: {} },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("chains six months from the running period's end at the branch's own rate", async () => {
    branchesRepository.findOne.mockResolvedValue(muntaha());
    subscriptions = [sixMonthRow()];

    const result = await service.extendAdminBranchSubscription(
      47,
      { months: 6, reason: 'Paid 11,400 ETB by bank transfer' },
      actor,
    );

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      tenantId: 19,
      branchId: 47,
      planCode: 'POS_BRANCH_6M',
      status: TenantSubscriptionStatus.ACTIVE,
      billingInterval: TenantBillingInterval.SIX_MONTHS,
      amount: 1900,
      amountTotal: 11400,
      periodMonths: 6,
      currency: 'ETB',
      autoRenew: false,
    });
    expect(saved[0].startsAt.toISOString()).toBe('2026-11-01T14:34:01.000Z');
    expect(saved[0].endsAt.toISOString()).toBe('2027-05-01T14:34:01.000Z');
    expect(saved[0].metadata).toMatchObject({
      posWorkspacePlanCode: 'POS_BRANCH_6M',
      periodMonths: 6,
      amountTotal: 11400,
      branchId: 47,
      manualExtension: {
        reason: 'Paid 11,400 ETB by bank transfer',
        actorId: 1,
        actorEmail: 'admin@suuq.test',
        at: NOW.toISOString(),
        extendsSubscriptionId: 90,
        previousEndsAt: '2026-11-01T14:34:01.000Z',
        chainsFromPreviousEnd: true,
      },
    });
    expect(result).toMatchObject({
      branch: { id: 47, name: 'Muntaha Hotel', retailTenantId: 19 },
      previous: { id: 90, planCode: 'POS_BRANCH_6M' },
      subscription: { id: 500, planCode: 'POS_BRANCH_6M', monthlyAmount: 1900 },
      billingState: 'PAYING',
      chainsFromPreviousEnd: true,
      amountTotal: 11400,
      monthlyRate: 1900,
    });
    expect(result.subscription.daysRemaining).toBe(182);
  });

  it('starts today when the period has already lapsed', async () => {
    branchesRepository.findOne.mockResolvedValue(muntaha());
    subscriptions = [
      sixMonthRow({
        status: TenantSubscriptionStatus.EXPIRED,
        startsAt: new Date('2026-04-20T00:00:00Z'),
        endsAt: new Date('2026-10-20T00:00:00Z'),
      }),
    ];

    const result = await service.extendAdminBranchSubscription(
      47,
      { months: 6, reason: 'Late renewal' },
      actor,
    );

    expect(saved[0].startsAt.toISOString()).toBe(NOW.toISOString());
    expect(saved[0].endsAt.toISOString()).toBe('2027-05-01T09:00:00.000Z');
    expect(saved[0].metadata.manualExtension).toMatchObject({
      chainsFromPreviousEnd: false,
      previousEndsAt: '2026-10-20T00:00:00.000Z',
    });
    expect(result.billingState).toBe('PAYING');
  });

  it('charges the platform price when the branch has only a free trial, or no row at all', async () => {
    branchesRepository.findOne.mockResolvedValue(muntaha());
    subscriptions = [
      sixMonthRow({
        planCode: 'POS_SELF_SERVE_TRIAL',
        status: TenantSubscriptionStatus.TRIAL,
        amount: 0,
        amountTotal: 0,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        endsAt: new Date('2026-11-15T00:00:00Z'),
      }),
    ];

    await service.extendAdminBranchSubscription(
      47,
      { months: 6, reason: 'First paid term' },
      actor,
    );
    expect(saved[0]).toMatchObject({ amount: 3900, amountTotal: 23400 });
    expect(saved[0].startsAt.toISOString()).toBe('2026-11-15T00:00:00.000Z');

    subscriptions = [];
    await service.extendAdminBranchSubscription(
      47,
      { months: 1, reason: 'First paid month' },
      actor,
    );
    expect(saved[1]).toMatchObject({
      planCode: 'POS_BRANCH_1M',
      billingInterval: TenantBillingInterval.MONTHLY,
      amount: 3900,
      amountTotal: 3900,
      periodMonths: 1,
    });
    expect(saved[1].startsAt.toISOString()).toBe(NOW.toISOString());
    expect(saved[1].metadata.manualExtension.extendsSubscriptionId).toBeNull();
  });

  it('honours an explicit amount, including zero for a goodwill extension', async () => {
    branchesRepository.findOne.mockResolvedValue(muntaha());
    subscriptions = [sixMonthRow()];

    await service.extendAdminBranchSubscription(
      47,
      { months: 12, reason: 'Goodwill after the outage', amountTotal: 0 },
      actor,
    );
    expect(saved[0]).toMatchObject({
      planCode: 'POS_BRANCH_1Y',
      billingInterval: TenantBillingInterval.ONE_YEAR,
      amount: 0,
      amountTotal: 0,
      periodMonths: 12,
    });

    await service.extendAdminBranchSubscription(
      47,
      { months: 3, reason: 'Quarter paid in cash', amountTotal: 10000 },
      actor,
    );
    expect(saved[1]).toMatchObject({
      planCode: 'POS_BRANCH_3M',
      billingInterval: TenantBillingInterval.CUSTOM,
      amount: 3333.33,
      amountTotal: 10000,
      periodMonths: 3,
    });
  });

  it('falls back to the legacy tenant-wide row and ignores a sibling branch', async () => {
    branchesRepository.findOne.mockResolvedValue(muntaha());
    subscriptions = [
      sixMonthRow({
        id: 10,
        branchId: null,
        planCode: 'LEGACY',
        amount: 2500,
        amountTotal: null,
        periodMonths: null,
        billingInterval: TenantBillingInterval.MONTHLY,
        startsAt: new Date('2026-10-10T00:00:00Z'),
        endsAt: new Date('2026-11-10T00:00:00Z'),
      }),
      sixMonthRow({
        id: 11,
        branchId: 48,
        amount: 9999,
        startsAt: new Date('2026-10-30T00:00:00Z'),
        endsAt: new Date('2027-04-30T00:00:00Z'),
      }),
    ];

    const result = await service.extendAdminBranchSubscription(
      47,
      { months: 6, reason: 'Renewed' },
      actor,
    );

    expect(result.previous?.id).toBe(10);
    expect(saved[0]).toMatchObject({
      branchId: 47,
      amount: 2500,
      amountTotal: 15000,
    });
    expect(saved[0].startsAt.toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });

  it('refuses an unknown branch, one without a workspace, and bad input', async () => {
    branchesRepository.findOne.mockResolvedValue(null);
    await expect(
      service.extendAdminBranchSubscription(
        999,
        { months: 6, reason: 'x' },
        actor,
      ),
    ).rejects.toThrow('Branch #999 not found');

    branchesRepository.findOne.mockResolvedValue(
      muntaha({ retailTenantId: null }),
    );
    await expect(
      service.extendAdminBranchSubscription(
        47,
        { months: 6, reason: 'x' },
        actor,
      ),
    ).rejects.toThrow(/not assigned to a Retail OS tenant/);

    branchesRepository.findOne.mockResolvedValue(muntaha());
    await expect(
      service.extendAdminBranchSubscription(
        47,
        { months: 0, reason: 'x' },
        actor,
      ),
    ).rejects.toThrow(/months must be a whole number/);
    await expect(
      service.extendAdminBranchSubscription(
        47,
        { months: 6, reason: '   ' },
        actor,
      ),
    ).rejects.toThrow(/reason is required/);
    await expect(
      service.extendAdminBranchSubscription(
        47,
        { months: 6, reason: 'x', amountTotal: -5 },
        actor,
      ),
    ).rejects.toThrow(/zero or more/);

    expect(saved).toHaveLength(0);
  });
});
