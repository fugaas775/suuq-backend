import { SupplierActivationService } from './supplier-activation.service';

const makeService = ({ profiles = {}, subscriptions = {} }: any) => {
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
