import { PropertyRentalInventoryService } from './property-rental-inventory.service';
import {
  PropertyUnit,
  PropertyUnitStatus,
  PropertyUnitType,
} from './entities/property-unit.entity';

type RepoMock = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

describe('PropertyRentalInventoryService — setUnitMaintenance', () => {
  let service: PropertyRentalInventoryService;
  let unitRepo: RepoMock;

  beforeEach(() => {
    unitRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => ({
        id: value.id ?? 77,
        createdAt: value.createdAt ?? new Date('2026-06-22T08:00:00.000Z'),
        updatedAt: value.updatedAt ?? new Date('2026-06-22T08:00:00.000Z'),
        ...value,
      })),
    };
    service = new PropertyRentalInventoryService(
      unitRepo as unknown as never,
      {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as unknown as never,
      {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as unknown as never,
    );
  });

  it('upserts a brand-new registry row when the unit does not exist yet', async () => {
    unitRepo.findOne.mockResolvedValue(null);
    const res = await service.setUnitMaintenance({
      branchId: 4,
      propertyCode: 'APT-3B',
      status: 'MAINTENANCE',
      reason: 'Plumbing repair',
    });
    expect(unitRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 4,
        propertyCode: 'APT-3B',
        name: 'APT-3B',
        unitType: PropertyUnitType.OTHER,
        status: PropertyUnitStatus.MAINTENANCE,
      }),
    );
    expect(res.status).toBe(PropertyUnitStatus.MAINTENANCE);
    expect(res.metadata).toEqual({ maintenanceReason: 'Plumbing repair' });
  });

  it('flips an existing unit out of service and stores the reason', async () => {
    const existing: Partial<PropertyUnit> = {
      id: 12,
      branchId: 4,
      propertyCode: 'APT-3B',
      name: 'Apartment 3B',
      unitType: PropertyUnitType.TWO_BED,
      status: PropertyUnitStatus.ACTIVE,
      metadata: null,
    };
    unitRepo.findOne.mockResolvedValue(existing);
    const res = await service.setUnitMaintenance({
      branchId: 4,
      propertyCode: 'APT-3B',
      status: 'MAINTENANCE',
      reason: 'Repainting',
    });
    expect(unitRepo.create).not.toHaveBeenCalled();
    expect(res.status).toBe(PropertyUnitStatus.MAINTENANCE);
    expect(res.metadata).toEqual({ maintenanceReason: 'Repainting' });
  });

  it('returns a unit to service and clears the maintenance reason', async () => {
    const existing: Partial<PropertyUnit> = {
      id: 12,
      branchId: 4,
      propertyCode: 'APT-3B',
      name: 'Apartment 3B',
      unitType: PropertyUnitType.TWO_BED,
      status: PropertyUnitStatus.MAINTENANCE,
      metadata: { maintenanceReason: 'Repainting' },
    };
    unitRepo.findOne.mockResolvedValue(existing);
    const res = await service.setUnitMaintenance({
      branchId: 4,
      propertyCode: 'APT-3B',
      status: 'ACTIVE',
    });
    expect(res.status).toBe(PropertyUnitStatus.ACTIVE);
    expect(res.metadata).toBeNull();
  });
});
