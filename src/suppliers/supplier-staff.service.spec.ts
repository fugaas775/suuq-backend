import { ForbiddenException } from '@nestjs/common';
import { SupplierStaffService } from './supplier-staff.service';
import { SupplierStaffRole } from './entities/supplier-staff-assignment.entity';

const makeService = ({ profiles = {}, assignments = {}, users = {} }: any) =>
  new SupplierStaffService(profiles, assignments, users);

describe('SupplierStaffService.getSupplierContextForUser', () => {
  it('returns null for a user with no supplier identity', async () => {
    const svc = makeService({
      assignments: { findOne: jest.fn().mockResolvedValue(null) },
      profiles: { findOne: jest.fn().mockResolvedValue(null) },
    });
    expect(await svc.getSupplierContextForUser({ id: 7 })).toBeNull();
  });

  it('resolves context from an active staff assignment (manager, active → can publish)', async () => {
    const assignments = {
      findOne: jest.fn().mockResolvedValue({
        userId: 7,
        role: SupplierStaffRole.MANAGER,
        permissions: [],
        supplierProfile: {
          id: 55,
          userId: 7,
          companyName: 'Rift Valley',
          activationStatus: 'ACTIVE',
          onboardingStatus: 'DRAFT',
        },
      }),
    };
    const svc = makeService({ assignments });
    const ctx = await svc.getSupplierContextForUser({ id: 7 });
    expect(ctx).toMatchObject({
      supplierProfileId: 55,
      role: SupplierStaffRole.MANAGER,
      isOwner: true,
      canPublishOffers: true,
    });
  });

  it('an operator cannot publish even when the account is active', async () => {
    const assignments = {
      findOne: jest.fn().mockResolvedValue({
        userId: 8,
        role: SupplierStaffRole.OPERATOR,
        permissions: [],
        supplierProfile: {
          id: 55,
          userId: 7,
          companyName: 'Rift Valley',
          activationStatus: 'ACTIVE',
          onboardingStatus: 'DRAFT',
        },
      }),
    };
    const svc = makeService({ assignments });
    const ctx = await svc.getSupplierContextForUser({ id: 8 });
    expect(ctx).toMatchObject({
      role: SupplierStaffRole.OPERATOR,
      isOwner: false,
      canPublishOffers: false,
    });
  });

  it('falls back to a directly-owned profile when there is no assignment (legacy)', async () => {
    const svc = makeService({
      assignments: { findOne: jest.fn().mockResolvedValue(null) },
      profiles: {
        findOne: jest.fn().mockResolvedValue({
          id: 77,
          userId: 9,
          companyName: 'Legacy Co',
          activationStatus: 'PENDING_PAYMENT',
          onboardingStatus: 'APPROVED',
        }),
      },
    });
    const ctx = await svc.getSupplierContextForUser({ id: 9 });
    expect(ctx).toMatchObject({
      supplierProfileId: 77,
      role: SupplierStaffRole.MANAGER,
      isOwner: true,
      canPublishOffers: false, // not yet paid
    });
  });
});

describe('SupplierStaffService.requireManagedSupplierProfile', () => {
  it('throws for a user with no supplier account', async () => {
    const svc = makeService({
      assignments: { findOne: jest.fn().mockResolvedValue(null) },
      profiles: { findOne: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.requireManagedSupplierProfile({ id: 7 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws for an operator (not manager-level)', async () => {
    const svc = makeService({
      assignments: {
        findOne: jest.fn().mockResolvedValue({
          userId: 8,
          role: SupplierStaffRole.OPERATOR,
          permissions: [],
          supplierProfile: {
            id: 55,
            userId: 7,
            companyName: 'X',
            activationStatus: 'ACTIVE',
            onboardingStatus: 'DRAFT',
          },
        }),
      },
    });
    await expect(
      svc.requireManagedSupplierProfile({ id: 8 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
