import { SupplierActivationService } from './supplier-activation.service';

const makeService = ({ profiles = {}, subscriptions = {}, grants }: any) => {
  // completeEbirrActivationPayment now runs inside
  // subscriptionsRepository.manager.transaction(...). Mock a transactional
  // manager that routes findOne/save to the per-entity mocks (matching the
  // production manager.findOne(Entity, …) / manager.save(entity) calls) and
  // no-ops the advisory-lock query.
  const txManager = {
    query: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn((entity: any, opts: any) =>
      entity?.name === 'SupplierProfile'
        ? profiles.findOne?.(opts)
        : subscriptions.findOne?.(opts),
    ),
    save: jest.fn((v: any) =>
      v && 'planCode' in v ? subscriptions.save?.(v) : profiles.save?.(v),
    ),
  };
  subscriptions.manager = {
    transaction: jest.fn(async (cb: any) => cb(txManager)),
  };
  return new SupplierActivationService(
    {} as any, // ebirrService
    {} as any, // supplierStaffService
    { ensureOutletForSupplier: jest.fn().mockResolvedValue(null) } as any, // supplierOutletService
    profiles,
    subscriptions,
    grants ?? {
      claim: jest.fn().mockResolvedValue({ id: 5 }),
      findActiveGrant: jest.fn().mockResolvedValue(null),
      hasClaimedFreeWorkspace: jest.fn().mockResolvedValue(false),
    },
  );
};

describe('SupplierActivationService.isSupplierActivationReference', () => {
  const svc = makeService({});
  it('matches SUPACT- references only', () => {
    expect(svc.isSupplierActivationReference('SUPACT-55-1700000000000')).toBe(
      true,
    );
    expect(svc.isSupplierActivationReference('POSACT-12-1700000000000')).toBe(
      false,
    );
    expect(svc.isSupplierActivationReference(null)).toBe(false);
    expect(svc.isSupplierActivationReference('')).toBe(false);
  });
});

describe('SupplierActivationService.completeEbirrActivationPayment', () => {
  it('ignores an unrecognized reference', async () => {
    const svc = makeService({});
    expect(await svc.completeEbirrActivationPayment('POSACT-1-123')).toBeNull();
  });

  it('activates the profile and writes an ACTIVE subscription', async () => {
    const profile: any = {
      id: 55,
      activationStatus: 'PENDING_PAYMENT',
      lastActivatedAt: null,
    };
    const profiles = {
      findOne: jest.fn().mockResolvedValue(profile),
      save: jest.fn(async (v: any) => v),
    };
    const subscriptions = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => ({ id: 1, ...v })),
    };
    const svc = makeService({ profiles, subscriptions });

    const result = await svc.completeEbirrActivationPayment(
      'SUPACT-55-1700000000000',
      'ONE_YEAR',
    );

    expect(result?.status).toBe('ACTIVE');
    expect(result?.planCode).toBe('SUPPLIER_1Y');
    expect(result?.periodMonths).toBe(12);
    expect(profile.activationStatus).toBe('ACTIVE');
    expect(profile.lastActivatedAt).toBeInstanceOf(Date);
    expect(profiles.save).toHaveBeenCalled();
    // The activation runs inside a transaction (with the advisory lock) so
    // concurrent webhook + return callbacks can't double-activate.
    expect((subscriptions as any).manager.transaction).toHaveBeenCalled();
  });

  it('is idempotent when the latest subscription is already ACTIVE', async () => {
    const subscriptions = {
      findOne: jest.fn().mockResolvedValue({ id: 9, status: 'ACTIVE' }),
      save: jest.fn(),
    };
    const profiles = {
      findOne: jest.fn().mockResolvedValue({ id: 55 }),
      save: jest.fn(),
    };
    const svc = makeService({ profiles, subscriptions });
    const result = await svc.completeEbirrActivationPayment('SUPACT-55-123');
    expect(result).toEqual({ id: 9, status: 'ACTIVE' });
    expect(subscriptions.save).not.toHaveBeenCalled();
  });
});

describe('SupplierActivationService.grantFreePeriod', () => {
  const savedDeadline = process.env.POS_FREE_PERIOD_ENDS_AT;

  afterEach(() => {
    if (savedDeadline == null) {
      delete process.env.POS_FREE_PERIOD_ENDS_AT;
    } else {
      process.env.POS_FREE_PERIOD_ENDS_AT = savedDeadline;
    }
  });

  function buildRepos(profileOverrides: any = {}) {
    const profile: any = {
      id: 55,
      userId: 9,
      companyName: 'Jigjiga Wholesale',
      activationStatus: 'PENDING_PAYMENT',
      lastActivatedAt: null,
      ...profileOverrides,
    };
    const profiles = {
      findOne: jest.fn().mockResolvedValue(profile),
      save: jest.fn(async (v: any) => v),
    };
    const subscriptions = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => ({ id: 1, ...v })),
    };
    return { profile, profiles, subscriptions };
  }

  it('opens the account free until the deadline and lets it trade', async () => {
    delete process.env.POS_FREE_PERIOD_ENDS_AT;
    const { profile, profiles, subscriptions } = buildRepos();
    const svc = makeService({ profiles, subscriptions });

    const result = await svc.grantFreePeriod(55, 9);

    expect(result?.planCode).toBe('SUPPLIER_FREE_2026');
    expect(result?.status).toBe('TRIAL');
    expect(result?.amountTotal).toBe(0);
    expect(result?.endsAt?.toISOString()).toBe('2026-12-31T20:59:59.999Z');
    // ACTIVE is what every supplier gate reads — publishing offers, receiving
    // purchase orders, the outlet. Free and unable to trade is not free.
    expect(profile.activationStatus).toBe('ACTIVE');
    expect(profiles.save).toHaveBeenCalled();
  });

  it('charges when the account already spent its free workspace', async () => {
    delete process.env.POS_FREE_PERIOD_ENDS_AT;
    const { profile, profiles, subscriptions } = buildRepos();
    const grants = {
      claim: jest.fn().mockResolvedValue(null),
      findActiveGrant: jest.fn().mockResolvedValue(null),
      hasClaimedFreeWorkspace: jest.fn().mockResolvedValue(true),
    };
    const svc = makeService({ profiles, subscriptions, grants });

    expect(await svc.grantFreePeriod(55, 9)).toBeNull();
    expect(subscriptions.save).not.toHaveBeenCalled();
    expect(profile.activationStatus).toBe('PENDING_PAYMENT');
  });

  it('charges once the promotion has closed', async () => {
    process.env.POS_FREE_PERIOD_ENDS_AT = '2020-01-01T00:00:00.000Z';
    const { profiles, subscriptions } = buildRepos();
    const grants = {
      claim: jest.fn(),
      findActiveGrant: jest.fn(),
      hasClaimedFreeWorkspace: jest.fn(),
    };
    const svc = makeService({ profiles, subscriptions, grants });

    expect(await svc.grantFreePeriod(55, 9)).toBeNull();
    // The slot must not be spent on a workspace that is chargeable anyway.
    expect(grants.claim).not.toHaveBeenCalled();
  });

  it('leaves a profile that already has a subscription alone', async () => {
    delete process.env.POS_FREE_PERIOD_ENDS_AT;
    const { profiles, subscriptions } = buildRepos();
    subscriptions.findOne = jest
      .fn()
      .mockResolvedValue({ id: 9, status: 'ACTIVE', planCode: 'SUPPLIER_1Y' });
    const grants = {
      claim: jest.fn(),
      findActiveGrant: jest.fn(),
      hasClaimedFreeWorkspace: jest.fn(),
    };
    const svc = makeService({ profiles, subscriptions, grants });

    expect(await svc.grantFreePeriod(55, 9)).toBeNull();
    expect(grants.claim).not.toHaveBeenCalled();
    expect(subscriptions.save).not.toHaveBeenCalled();
  });
});
