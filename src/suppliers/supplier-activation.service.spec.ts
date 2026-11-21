import { SupplierActivationService } from './supplier-activation.service';

// These tests exercise the free-workspace promotion itself. New grants were
// closed on 2026-11-21 (see getFreeGrantsClosedAt); the mechanism is kept, so it
// is tested with the door held open.
const savedGrantsClosedAt = process.env.POS_FREE_GRANTS_CLOSED_AT;
beforeAll(() => {
  process.env.POS_FREE_GRANTS_CLOSED_AT = '2099-01-01T00:00:00.000Z';
});
afterAll(() => {
  if (savedGrantsClosedAt == null) delete process.env.POS_FREE_GRANTS_CLOSED_AT;
  else process.env.POS_FREE_GRANTS_CLOSED_AT = savedGrantsClosedAt;
});

const makeService = ({ profiles = {}, subscriptions = {}, grants }: any) => {
  // completeActivationPayment now runs inside
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
    {
      assertProofAcceptable: jest.fn().mockResolvedValue(undefined),
      submit: jest.fn(),
      describeForCustomer: jest.fn(),
      findByReference: jest.fn().mockResolvedValue(null),
    } as any, // paymentClaims
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

describe('SupplierActivationService.completeActivationPayment', () => {
  it('ignores an unrecognized reference', async () => {
    const svc = makeService({});
    expect(await svc.completeActivationPayment('POSACT-1-123')).toBeNull();
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

    const result = await svc.completeActivationPayment(
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
    const result = await svc.completeActivationPayment('SUPACT-55-123');
    expect(result).toEqual({ id: 9, status: 'ACTIVE' });
    expect(subscriptions.save).not.toHaveBeenCalled();
  });

  it('grants the term when the old one ran out but is still stored ACTIVE', async () => {
    // Ended this afternoon; the midnight pass has not relabelled it. A payment
    // made in between used to be swallowed as a "duplicate".
    const lapsed = {
      id: 9,
      supplierProfileId: 55,
      status: 'ACTIVE',
      endsAt: new Date(Date.now() - 3 * 3_600_000),
      metadata: { lastActivationReferenceId: 'SUPACT-55-100' },
    };
    const subscriptions = {
      findOne: jest.fn().mockResolvedValue(lapsed),
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => v),
    };
    const profiles = {
      findOne: jest.fn().mockResolvedValue({ id: 55 }),
      save: jest.fn(async (v: any) => v),
    };
    const svc = makeService({ profiles, subscriptions });

    const result: any = await svc.completeActivationPayment('SUPACT-55-200');

    expect(result.endsAt.getTime()).toBeGreaterThan(
      Date.now() + 27 * 86_400_000,
    );
    expect(result.autoRenew).toBe(false);
    expect(result.metadata.lastActivationReferenceId).toBe('SUPACT-55-200');
  });

  it('adds a renewal paid ahead of the end date after the days already paid', async () => {
    const endsAt = new Date(Date.now() + 5 * 86_400_000);
    const startsAt = new Date(Date.now() - 25 * 86_400_000);
    const running = {
      id: 9,
      supplierProfileId: 55,
      planCode: 'SUPPLIER_1M',
      status: 'ACTIVE',
      startsAt,
      endsAt,
      metadata: { lastActivationReferenceId: 'SUPACT-55-1700000000000' },
    };
    const subscriptions = {
      findOne: jest.fn().mockResolvedValue(running),
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => v),
    };
    const profiles = {
      findOne: jest.fn().mockResolvedValue({ id: 55 }),
      save: jest.fn(async (v: any) => v),
    };
    const svc = makeService({ profiles, subscriptions });

    const result: any = await svc.completeActivationPayment(
      `SUPACT-55-${Date.now()}`,
    );

    // Not swallowed, and not restarted from today.
    expect(result.endsAt.getTime()).toBeGreaterThan(
      endsAt.getTime() + 27 * 86_400_000,
    );
    expect(result.startsAt).toBe(startsAt);
    expect(result.metadata.appliedActivationReferences).toHaveLength(2);
  });

  it('opens a new supplier account for 14 days on the paid trial, then adds the first term after it', async () => {
    const subscriptions: any = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => v),
    };
    const profiles = {
      findOne: jest.fn().mockResolvedValue({ id: 55 }),
      save: jest.fn(async (v: any) => v),
    };
    const svc = makeService({ profiles, subscriptions });

    const trial: any = await svc.completeActivationPayment(
      `SUPACT-55-${Date.now()}`,
      'STARTER',
    );

    expect(trial).toMatchObject({
      planCode: 'SUPPLIER_STARTER_14D',
      status: 'ACTIVE',
      amountTotal: 500,
      periodMonths: null,
      billingInterval: 'CUSTOM',
    });
    expect(
      Math.round(
        (trial.endsAt.getTime() - trial.startsAt.getTime()) / 86_400_000,
      ),
    ).toBe(14);

    // Subscribing during the trial loses none of its days.
    const trialEndsAt = trial.endsAt;
    subscriptions.findOne.mockResolvedValue({ id: 9, ...trial });
    const term: any = await svc.completeActivationPayment(
      `SUPACT-55-${Date.now() + 5}`,
      'MONTHLY',
    );
    expect(term.planCode).toBe('SUPPLIER_1M');
    expect(term.endsAt.getTime()).toBeGreaterThan(
      trialEndsAt.getTime() + 27 * 86_400_000,
    );
  });

  it('applies one supplier payment once, however often it is confirmed', async () => {
    const subscriptions = {
      findOne: jest.fn().mockResolvedValue({
        id: 9,
        status: 'ACTIVE',
        endsAt: new Date(Date.now() - 3_600_000),
        metadata: { lastActivationReferenceId: 'SUPACT-55-200' },
      }),
      save: jest.fn(),
    };
    const profiles = {
      findOne: jest.fn().mockResolvedValue({ id: 55 }),
      save: jest.fn(),
    };
    const svc = makeService({ profiles, subscriptions });

    await svc.completeActivationPayment('SUPACT-55-200');

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
