import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

describe('SupplierStaffService.createManualAccount', () => {
  const managerProfile = {
    id: 55,
    userId: 7,
    companyName: 'Rift Valley',
    activationStatus: 'ACTIVE',
    onboardingStatus: 'DRAFT',
  };

  const managerContext = () => ({
    findOne: jest.fn().mockResolvedValue({
      userId: 7,
      role: SupplierStaffRole.MANAGER,
      permissions: [],
      supplierProfile: managerProfile,
    }),
  });

  it('creates a manual login (username/password) and returns a clean member row', async () => {
    const assignments = {
      ...managerContext(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 101, createdAt: new Date() })),
      delete: jest.fn(),
    };
    const users = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 202 })),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const profiles = { findOne: jest.fn().mockResolvedValue(managerProfile) };
    const svc = makeService({ profiles, assignments, users });

    const member = await svc.createManualAccount(
      { id: 7 },
      {
        username: 'Amina',
        password: 'secret-password',
        displayName: 'Amina Y',
        role: SupplierStaffRole.OPERATOR,
      },
    );

    expect(member).toMatchObject({
      id: 101,
      role: SupplierStaffRole.OPERATOR,
      isActive: true,
      user: { username: 'amina', displayName: 'Amina Y', authMode: 'MANUAL' },
    });
    // No password hash / internal email leaks into the roster row.
    expect(member.user).not.toHaveProperty('password');
    expect(member.user).not.toHaveProperty('email');
    // The user is stored MANUAL with a hashed (not plaintext) password.
    const created = users.create.mock.calls[0][0];
    expect(created).toMatchObject({ posUsername: 'amina', authMode: 'MANUAL' });
    expect(created.password).not.toBe('secret-password');
    // grantSupplierRole adds the platform supplier role.
    expect(users.update).toHaveBeenCalled();
  });

  it('rejects a username already taken by a live account', async () => {
    const assignments = { ...managerContext() };
    const users = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 9, authMode: 'STANDARD', isActive: true }),
    };
    const profiles = { findOne: jest.fn().mockResolvedValue(managerProfile) };
    const svc = makeService({ profiles, assignments, users });

    await expect(
      svc.createManualAccount(
        { id: 7 },
        { username: 'taken', password: 'secret-password' },
      ),
    ).rejects.toBeDefined();
  });

  it('changeStaffPassword refuses a non-manual login', async () => {
    const assignments = {
      ...managerContext(),
    };
    assignments.findOne = jest
      .fn()
      .mockResolvedValueOnce({
        userId: 7,
        role: SupplierStaffRole.MANAGER,
        permissions: [],
        supplierProfile: managerProfile,
      })
      .mockResolvedValueOnce({
        id: 5,
        supplierProfileId: 55,
        user: { id: 9, authMode: 'STANDARD' },
      });
    const profiles = { findOne: jest.fn().mockResolvedValue(managerProfile) };
    const users = { update: jest.fn() };
    const svc = makeService({ profiles, assignments, users });

    await expect(
      svc.changeStaffPassword({ id: 7 }, 5, 'new-password-123'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.update).not.toHaveBeenCalled();
  });
});
