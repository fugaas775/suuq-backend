import { SupplierOutletService } from './supplier-outlet.service';
import { Branch } from '../branches/entities/branch.entity';
import { SupplierProfile } from './entities/supplier-profile.entity';

function makeService({
  profile = null as any,
  existingBranch = null as any,
  qbBranches = [] as any[],
} = {}) {
  let nextId = 1000;
  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(async (entity: any) => {
      if (entity === SupplierProfile) return profile;
      if (entity === Branch) return existingBranch;
      return null; // assignments etc.
    }),
    find: jest.fn().mockResolvedValue([]), // no published offers to mirror
    create: jest.fn((_entity: any, data: any) => ({ ...data })),
    save: jest.fn(async (obj: any) =>
      obj.id ? obj : { ...obj, id: (nextId += 1) },
    ),
  };
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(qbBranches),
  };
  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb(manager)),
    getRepository: jest.fn(() => ({
      findOne: jest.fn().mockResolvedValue(existingBranch),
      createQueryBuilder: jest.fn(() => qb),
    })),
  };
  return {
    svc: new SupplierOutletService(dataSource as any),
    manager,
  };
}

describe('SupplierOutletService.ensureOutletForSupplier', () => {
  it('returns null when the supplier is not ACTIVE', async () => {
    const { svc, manager } = makeService({
      profile: {
        id: 55,
        userId: 7,
        companyName: 'Acme',
        activationStatus: 'PENDING_PAYMENT',
        isActive: true,
      },
    });
    expect(await svc.ensureOutletForSupplier(55)).toBeNull();
    // No workspace rows created for a non-active supplier.
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('provisions a RETAIL outlet branch for an ACTIVE supplier with no existing outlet', async () => {
    const { svc, manager } = makeService({
      profile: {
        id: 55,
        userId: 7,
        companyName: 'Acme',
        activationStatus: 'ACTIVE',
        isActive: true,
      },
      existingBranch: null,
    });

    const branch = await svc.ensureOutletForSupplier(55);

    expect(branch).toBeTruthy();
    expect(branch).toMatchObject({
      serviceFormat: 'RETAIL',
      ownerId: 7,
      supplierOutletProfileId: 55,
      isActive: true,
    });
    // Tenant + entitlements + branch + subscription + owner assignment all saved.
    const savedBranch = manager.save.mock.calls
      .map((c) => c[0])
      .find((v: any) => v?.supplierOutletProfileId === 55);
    expect(savedBranch).toBeTruthy();
    const savedAssignment = manager.save.mock.calls
      .map((c) => c[0])
      .find((v: any) => v?.posExperienceProfileCode === 'WHOLESALE_COUNTER');
    expect(savedAssignment).toBeTruthy();
    expect(savedAssignment.role).toBe('MANAGER');
  });

  it('does not re-provision when an outlet already exists', async () => {
    const { svc, manager } = makeService({
      profile: {
        id: 55,
        userId: 7,
        companyName: 'Acme',
        activationStatus: 'ACTIVE',
        isActive: true,
      },
      existingBranch: {
        id: 900,
        name: 'Acme Counter',
        supplierOutletProfileId: 55,
        isActive: true,
      },
    });

    const branch = await svc.ensureOutletForSupplier(55);
    expect(branch).toMatchObject({ id: 900 });
    // No new branch row created (no save of an object carrying the outlet flag
    // as a fresh insert) — the existing branch is reused.
    const freshBranchInsert = manager.save.mock.calls
      .map((c) => c[0])
      .find((v: any) => v?.supplierOutletProfileId === 55 && !v?.id);
    expect(freshBranchInsert).toBeUndefined();
  });
});

describe('SupplierOutletService.getOutletBranchesForProfiles', () => {
  it('maps active outlet branches by supplier profile id', async () => {
    const { svc } = makeService({
      qbBranches: [
        { id: 900, name: 'Acme Counter', supplierOutletProfileId: 55 },
        { id: 901, name: 'Rift Counter', supplierOutletProfileId: 56 },
      ],
    });
    const map = await svc.getOutletBranchesForProfiles([55, 56, 99]);
    expect(map.get(55)?.id).toBe(900);
    expect(map.get(56)?.id).toBe(901);
    expect(map.get(99)).toBeUndefined();
  });

  it('returns an empty map for no ids', async () => {
    const { svc } = makeService({});
    const map = await svc.getOutletBranchesForProfiles([]);
    expect(map.size).toBe(0);
  });
});
