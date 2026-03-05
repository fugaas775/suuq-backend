import { Test, TestingModule } from '@nestjs/testing';
import { VendorController } from './vendor.controller';
import { VendorService } from './vendor.service';
import { VendorStaffService } from './vendor-staff.service';

describe('VendorController', () => {
  let controller: VendorController;
  const vendorServiceMock = {
    getVendorProducts: jest.fn(),
    getVendorProductsManage: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorController],
      providers: [
        { provide: VendorService, useValue: vendorServiceMock },
        { provide: VendorStaffService, useValue: {} },
      ],
    }).compile();

    controller = module.get<VendorController>(VendorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns consistent listedBy fields from getVendorProducts', async () => {
    vendorServiceMock.getVendorProducts.mockResolvedValue([
      {
        id: 1001,
        name: 'Staff Product',
        listedBy: {
          name: 'Vendor Staff',
          type: 'staff',
          id: 44,
        },
      },
      {
        id: 1002,
        name: 'Owner Product',
        listedBy: {
          name: 'Owner Store',
          type: 'store',
          id: 12,
        },
      },
    ]);

    const out = await controller.getVendorProducts(
      { user: { id: 12 } } as any,
      'ETB',
      'test',
    );

    expect(Array.isArray(out)).toBe(true);
    for (const item of out) {
      expect(item).toHaveProperty('listedBy');
      expect(item.listedBy).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          type: expect.any(String),
        }),
      );
      expect(['staff', 'store', 'owner', 'guest']).toContain(
        item.listedBy.type,
      );
      if (
        item.listedBy.id !== null &&
        typeof item.listedBy.id !== 'undefined'
      ) {
        expect(typeof item.listedBy.id).toBe('number');
      }
    }
  });

  it('returns consistent listedBy fields from getVendorProductsManage', async () => {
    vendorServiceMock.getVendorProductsManage.mockResolvedValue({
      items: [
        {
          id: 2001,
          name: 'Managed Staff Product',
          listedBy: {
            name: 'Vendor Staff',
            type: 'staff',
            id: 44,
          },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const out = await controller.getVendorProductsManage(
      { id: 12 } as any,
      { page: 1, limit: 20 } as any,
    );

    expect(out).toHaveProperty('items');
    expect(Array.isArray(out.items)).toBe(true);
    for (const item of out.items as any[]) {
      expect(item).toHaveProperty('listedBy');
      expect(item.listedBy).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          type: expect.any(String),
        }),
      );
      expect(['staff', 'store', 'owner', 'guest']).toContain(
        item.listedBy.type,
      );
      if (
        item.listedBy.id !== null &&
        typeof item.listedBy.id !== 'undefined'
      ) {
        expect(typeof item.listedBy.id).toBe('number');
      }
    }
  });
});
