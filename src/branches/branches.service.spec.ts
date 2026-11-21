import { EquityPartnerService } from '../retail/equity-partner.service';
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
  const equityPartnerService = {
    createMonthlyPayoutsForBranch: jest.fn(),
  };
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
    equityPartnerService.createMonthlyPayoutsForBranch
      .mockReset()
      .mockResolvedValue([{ id: 1 }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        { provide: getRepositoryToken(VendorStore), useValue: {} },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: EquityPartnerService, useValue: equityPartnerService },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shares a paid extension with the referring equity partner, and a free one with nobody', async () => {
    branchesRepository.findOne.mockResolvedValue(muntaha());
    subscriptions = [sixMonthRow()];

    const paid = await service.extendAdminBranchSubscription(
      47,
      { months: 6, reason: 'Paid 23,400 ETB by bank transfer' },
      actor,
    );
    expect(
      equityPartnerService.createMonthlyPayoutsForBranch,
    ).toHaveBeenCalledWith(
      47,
      expect.any(Date),
      expect.any(Date),
      23400,
      'ETB',
    );
    expect(paid.equityPayoutsCreated).toBe(1);

    equityPartnerService.createMonthlyPayoutsForBranch.mockClear();
    await service.extendAdminBranchSubscription(
      47,
      { months: 1, reason: 'Goodwill month', amountTotal: 0 },
      actor,
    );
    expect(
      equityPartnerService.createMonthlyPayoutsForBranch,
    ).not.toHaveBeenCalled();
  });

  it("chains six months from the running period's end at the platform rate", async () => {
    branchesRepository.findOne.mockResolvedValue(muntaha());
    subscriptions = [sixMonthRow()];

    const result = await service.extendAdminBranchSubscription(
      47,
      { months: 6, reason: 'Paid 23,400 ETB by bank transfer' },
      actor,
    );

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      tenantId: 19,
      branchId: 47,
      planCode: 'POS_BRANCH_6M',
      status: TenantSubscriptionStatus.ACTIVE,
      billingInterval: TenantBillingInterval.SIX_MONTHS,
      amount: 3900,
      amountTotal: 23400,
      periodMonths: 6,
      currency: 'ETB',
      autoRenew: false,
    });
    expect(saved[0].startsAt.toISOString()).toBe('2026-11-01T14:34:01.000Z');
    expect(saved[0].endsAt.toISOString()).toBe('2027-05-01T14:34:01.000Z');
    expect(saved[0].metadata).toMatchObject({
      posWorkspacePlanCode: 'POS_BRANCH_6M',
      periodMonths: 6,
      amountTotal: 23400,
      branchId: 47,
      manualExtension: {
        reason: 'Paid 23,400 ETB by bank transfer',
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
      subscription: { id: 500, planCode: 'POS_BRANCH_6M', monthlyAmount: 3900 },
      billingState: 'PAYING',
      chainsFromPreviousEnd: true,
      amountTotal: 23400,
      monthlyRate: 3900,
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

  it('charges the platform price for a free trial, and for a branch with no row at all', async () => {
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
      amount: 3900,
      amountTotal: 23400,
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

/**
 * The admin list carries what each branch's tills have taken. Those figures
 * are an extra: whatever happens to them, the list itself — the place billing
 * work is done from — has to keep opening.
 */
describe('BranchesService.adminListBranches — sales', () => {
  const branch = (id: number, billing?: 'PAYING') =>
    Object.assign(new Branch(), {
      id,
      name: `Branch ${id}`,
      isActive: true,
      retailTenantId: null,
      billing,
    });

  const build = (
    sales: Record<string, jest.Mock>,
    subscriptions: Partial<TenantSubscription>[] = [],
  ) => {
    const repository = {
      findAndCount: jest.fn().mockResolvedValue([[branch(1), branch(2)], 2]),
      find: jest.fn().mockResolvedValue([branch(1), branch(2)]),
      count: jest.fn().mockResolvedValue(0),
    };
    const dataSource = {
      getRepository: () => ({
        createQueryBuilder: () => ({
          where: jest.fn().mockReturnThis(),
          orWhere: jest.fn().mockReturnThis(),
          getMany: () => Promise.resolve(subscriptions),
        }),
      }),
    } as unknown as DataSource;
    const service = new BranchesService(
      repository as never,
      {} as never,
      dataSource,
      undefined,
      sales as never,
    );
    return { service, repository };
  };

  const summary = {
    today: { net: 100, count: 2 },
    month: { net: 900, count: 20 },
    lastSaleAt: new Date('2026-11-21T08:00:00Z'),
    currency: 'ETB',
  };
  const platform = { soldTodayCount: 1, todayNet: 100, currency: 'ETB' };

  it('attaches each branch its figures, and null where it has none', async () => {
    const { service } = build({
      summariesFor: jest.fn().mockResolvedValue(new Map([[1, summary]])),
      platformToday: jest.fn().mockResolvedValue(platform),
    });

    const result = await service.adminListBranches();

    expect(result.items[0].sales).toEqual(summary);
    expect(result.items[1].sales).toBeNull();
    expect(result.salesSummary).toEqual(platform);
    expect(result.salesOrderUnavailable).toBe(false);
  });

  it('returns the page in the order the sales ranking gave', async () => {
    const { service, repository } = build({
      rankBranchIds: jest.fn().mockResolvedValue({ ids: [2, 1], total: 7 }),
      summariesFor: jest.fn().mockResolvedValue(new Map()),
      platformToday: jest.fn().mockResolvedValue(platform),
    });

    const result = await service.adminListBranches({ sort: 'month' });

    expect(result.items.map((b) => b.id)).toEqual([2, 1]);
    expect(result.total).toBe(7);
    expect(repository.findAndCount).not.toHaveBeenCalled();
  });

  it('still opens, newest first and saying so, when the ranking cannot be read', async () => {
    const { service, repository } = build({
      rankBranchIds: jest.fn().mockRejectedValue(new Error('relation busy')),
      summariesFor: jest.fn().mockRejectedValue(new Error('relation busy')),
      platformToday: jest.fn().mockResolvedValue(platform),
    });

    const result = await service.adminListBranches({
      activity: 'SILENT_7_DAYS',
    });

    expect(repository.findAndCount).toHaveBeenCalled();
    expect(result.items).toHaveLength(2);
    expect(result.items[0].sales).toBeNull();
    expect(result.salesSummary).toBeNull();
    expect(result.salesOrderUnavailable).toBe(true);
  });

  it('lists only paying or trial branches as gone quiet', async () => {
    const now = Date.now();
    const { service } = build(
      {
        rankBranchIds: jest.fn().mockResolvedValue({ ids: [1, 2], total: 2 }),
        summariesFor: jest.fn().mockResolvedValue(new Map([[1, summary]])),
        platformToday: jest.fn().mockResolvedValue(platform),
        platformTrading: jest.fn().mockResolvedValue({ currency: 'ETB' }),
      },
      [
        {
          id: 9,
          branchId: 1,
          tenantId: 5,
          status: TenantSubscriptionStatus.ACTIVE,
          billingInterval: TenantBillingInterval.MONTHLY,
          planCode: 'POS_BRANCH',
          amount: 3900,
          currency: 'ETB',
          startsAt: new Date(now - 5 * 86400000),
          endsAt: new Date(now + 25 * 86400000),
        },
      ],
    );

    const overview = await service.adminTradingOverview();

    expect(overview.goneQuiet.count).toBe(1);
    expect(overview.goneQuiet.rows[0]).toMatchObject({
      branchId: 1,
      billingState: 'PAYING',
      lastSaleAt: summary.lastSaleAt,
    });
  });
});

/**
 * A discount is the platform's gift to one branch. Setting 100 % must leave
 * the branch unable to lock: it is given cover at once, exactly once however
 * many times the question is asked, and only while it has little left.
 */
describe('BranchesService — subscription discount', () => {
  const DAY = 86_400_000;
  const build = (opts: {
    branch: Partial<Branch>;
    subscriptions?: Partial<TenantSubscription>[];
  }) => {
    const branch = Object.assign(new Branch(), {
      id: 115,
      name: 'SMAQ School',
      serviceFormat: 'SCHOOL',
      retailTenantId: 60,
      subscriptionDiscountPercent: 0,
      ...opts.branch,
    });
    const subscriptions = opts.subscriptions ?? [];
    const saved: Partial<TenantSubscription>[] = [];
    const repository = {
      findOne: jest.fn().mockResolvedValue(branch),
      find: jest.fn().mockResolvedValue([branch]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const subscriptionsRepo = {
      createQueryBuilder: () => ({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getMany: () => Promise.resolve([...subscriptions, ...saved]),
      }),
      create: (value: Partial<TenantSubscription>) => value,
      save: jest.fn((value: Partial<TenantSubscription>) => {
        const row = { id: 900 + saved.length, ...value };
        saved.push(row);
        return Promise.resolve(row);
      }),
    };
    const dataSource = {
      getRepository: () => subscriptionsRepo,
      transaction: (work: (manager: unknown) => unknown) =>
        work({ query: jest.fn().mockResolvedValue([]) }),
    } as unknown as DataSource;
    const service = new BranchesService(
      repository as never,
      {} as never,
      dataSource,
      undefined,
      undefined,
    );
    return { service, repository, saved, branch };
  };
  const actor = { id: 1, email: 'admin@suuq.test' };
  const active = (endsInDays: number): Partial<TenantSubscription> => ({
    id: 5,
    branchId: 115,
    tenantId: 60,
    status: TenantSubscriptionStatus.ACTIVE,
    billingInterval: TenantBillingInterval.ONE_YEAR,
    planCode: 'POS_BRANCH_1Y',
    currency: 'ETB',
    startsAt: new Date(Date.now() - 300 * DAY),
    endsAt: new Date(Date.now() + endsInDays * DAY),
  });

  it('saves the discount with its reason and reports the new price', async () => {
    const { service, repository, saved } = build({ branch: {} });

    const result = await service.setAdminBranchDiscount(
      115,
      { percent: 25, reason: 'Founding school' },
      actor,
    );

    expect(repository.update).toHaveBeenCalledWith(
      { id: 115 },
      {
        subscriptionDiscountPercent: 25,
        subscriptionDiscountReason: 'Founding school',
      },
    );
    expect(result).toMatchObject({
      previousPercent: 0,
      percent: 25,
      listMonthlyRate: 4900,
      monthlyRate: 3675,
      complimentary: false,
      coverGranted: null,
    });
    expect(saved).toHaveLength(0);
  });

  it('refuses a discount outside 0–100 or without a reason', async () => {
    const { service } = build({ branch: {} });
    await expect(
      service.setAdminBranchDiscount(
        115,
        { percent: 120, reason: 'x y z' },
        actor,
      ),
    ).rejects.toThrow('between 0 and 100');
    await expect(
      service.setAdminBranchDiscount(115, { percent: 10, reason: ' ' }, actor),
    ).rejects.toThrow('reason');
  });

  it('gives a branch made complimentary a free year at once when it has no cover', async () => {
    const { service, saved } = build({ branch: {} });

    const result = await service.setAdminBranchDiscount(
      115,
      { percent: 100, reason: 'Owned by the platform' },
      actor,
    );

    expect(result.complimentary).toBe(true);
    expect(result.monthlyRate).toBe(0);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      branchId: 115,
      amount: 0,
      amountTotal: 0,
      periodMonths: 12,
      status: TenantSubscriptionStatus.ACTIVE,
    });
  });

  it('adds the free year after a term that is about to end, losing no day of it', async () => {
    const running = active(10);
    const { service, saved } = build({
      branch: { subscriptionDiscountPercent: 100 },
      subscriptions: [running],
    });

    await service.ensureComplimentaryCover(115);

    expect(saved).toHaveLength(1);
    expect(saved[0].startsAt).toEqual(running.endsAt);
  });

  it('leaves a well-covered complimentary branch alone, however often it is asked', async () => {
    const { service, saved } = build({
      branch: { subscriptionDiscountPercent: 100 },
      subscriptions: [active(200)],
    });

    await service.ensureComplimentaryCover(115);
    await service.ensureComplimentaryCover(115);

    expect(saved).toHaveLength(0);
  });

  it('renews once, not once per asking, when cover has run low', async () => {
    const { service, saved } = build({
      branch: { subscriptionDiscountPercent: 100 },
      subscriptions: [active(5)],
    });

    await service.ensureComplimentaryCover(115);
    await service.ensureComplimentaryCover(115);
    await service.renewComplimentaryBranches();

    expect(saved).toHaveLength(1);
  });

  it('never grants cover to a branch that is not complimentary', async () => {
    const { service, saved } = build({
      branch: { subscriptionDiscountPercent: 90 },
    });
    await expect(service.ensureComplimentaryCover(115)).resolves.toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('extends a school by hand at the school rate, less its discount', async () => {
    const { service, saved } = build({
      branch: { subscriptionDiscountPercent: 50 },
    });

    await service.extendAdminBranchSubscription(
      115,
      { months: 6, reason: 'Paid by bank transfer' },
      actor,
    );

    expect(saved[0]).toMatchObject({ amount: 2450, amountTotal: 14700 });
  });
});
