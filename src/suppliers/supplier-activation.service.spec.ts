import { SupplierActivationService } from './supplier-activation.service';

const makeService = ({ profiles = {}, subscriptions = {} }: any) =>
  new SupplierActivationService(
    {} as any, // ebirrService
    {} as any, // supplierStaffService
    profiles,
    subscriptions,
  );

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
