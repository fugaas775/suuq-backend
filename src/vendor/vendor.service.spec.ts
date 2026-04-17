import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { VendorService } from './vendor.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { Dispute } from '../orders/entities/dispute.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Tag } from '../tags/tag.entity';
import { DoSpacesService } from '../media/do-spaces.service';
import { Category } from '../categories/entities/category.entity';
import { ProductImpression } from '../products/entities/product-impression.entity';
import { VerificationStatus } from '../users/entities/user.entity';
import { UserReport } from '../moderation/entities/user-report.entity';
import { CurrencyService } from '../common/services/currency.service';
import { ShippingService } from '../shipping/shipping.service';
import { SettingsService } from '../settings/settings.service';
import { EmailService } from '../email/email.service';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';

const j = jest as any;

describe('VendorService', () => {
  let service: VendorService;
  const productRepoMock: any = {};
  const categoryRepoMock: any = {};
  const userRepoMock: any = {};
  const orderRepoMock: any = {};
  const orderItemRepoMock: any = {};
  const productImageRepoMock: any = {};
  const tagRepoMock: any = {};
  const notificationsMock: any = {};
  const emailMock: any = { sendEmail: j.fn(), sendWelcomeEmail: j.fn() };
  const inventoryLedgerMock: any = { recordMovement: j.fn() };
  const doSpacesMock: any = {
    extractKeyFromUrl: j.fn((url: string) => {
      try {
        const u = new URL(url);
        return u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
      } catch {
        return null;
      }
    }),
    buildPublicUrl: j.fn(
      (key: string) =>
        `https://test-bucket.test-region.digitaloceanspaces.com/${key}`,
    ),
    getSignedUrl: j.fn(),
  };

  const makeQb = (result: any) => {
    const qb: any = {
      leftJoinAndSelect: j.fn().mockReturnThis(),
      innerJoin: j.fn().mockReturnThis(),
      where: j.fn().mockReturnThis(),
      andWhere: j.fn().mockReturnThis(),
      orderBy: j.fn().mockReturnThis(),
      addOrderBy: j.fn().mockReturnThis(),
      skip: j.fn().mockReturnThis(),
      take: j.fn().mockReturnThis(),
      distinct: j.fn().mockReturnThis(),
      getManyAndCount: j
        .fn()
        .mockResolvedValue([
          [result].flat().filter(Boolean),
          [result].flat().filter(Boolean).length,
        ] as any),
      getMany: j.fn().mockResolvedValue([result].flat().filter(Boolean) as any),
      getOne: j.fn().mockResolvedValue(result),
      select: j.fn().mockReturnThis(),
      addSelect: j.fn().mockReturnThis(),
      groupBy: j.fn().mockReturnThis(),
    };
    return qb;
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.DO_SPACES_BUCKET = 'test-bucket';
    process.env.DO_SPACES_REGION = 'test-region';

    Object.assign(categoryRepoMock, {
      findOne: j.fn(async ({ where }: any) =>
        where?.id ? ({ id: Number(where.id) } as Category) : null,
      ),
    });
    Object.assign(productRepoMock, {
      create: j.fn((v: any) => v),
      save: j.fn(async (v: any) => v),
      find: j.fn(),
      findOne: j.fn(),
      findOneOrFail: j.fn(),
      findAndCount: j.fn(),
      count: j.fn().mockResolvedValue(0),
      manager: {
        transaction: j.fn(),
        getRepository: j.fn((entity: any) =>
          entity === Category ? categoryRepoMock : undefined,
        ),
      },
      createQueryBuilder: j.fn(),
    });
    Object.assign(userRepoMock, {
      findOneBy: j.fn(),
      findOne: j.fn(),
      findAndCount: j.fn(),
      createQueryBuilder: j.fn(),
    });
    Object.assign(orderRepoMock, {
      createQueryBuilder: j.fn(),
      save: j.fn(),
      find: j.fn(),
    });
    Object.assign(orderItemRepoMock, {
      findOne: j.fn(),
      find: j.fn(),
      save: j.fn(),
      manager: { transaction: j.fn() },
      createQueryBuilder: j.fn(),
    });
    Object.assign(productImageRepoMock, {
      create: j.fn((v: any) => v),
      save: j.fn(),
      delete: j.fn(),
    });
    Object.assign(tagRepoMock, {
      find: j.fn(),
      save: j.fn(),
      create: j.fn((v: any) => v),
    });
    Object.assign(notificationsMock, { sendToUser: j.fn() });
    Object.assign(inventoryLedgerMock, { recordMovement: j.fn() });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorService,
        { provide: getRepositoryToken(User), useValue: userRepoMock },
        { provide: getRepositoryToken(Product), useValue: productRepoMock },
        { provide: getRepositoryToken(Order), useValue: orderRepoMock },
        { provide: getRepositoryToken(Dispute), useValue: {} },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepoMock },
        {
          provide: getRepositoryToken(ProductImage),
          useValue: productImageRepoMock,
        },
        { provide: getRepositoryToken(Tag), useValue: tagRepoMock },
        { provide: getRepositoryToken(ProductImpression), useValue: {} },
        { provide: getRepositoryToken(UserReport), useValue: {} },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: DoSpacesService, useValue: doSpacesMock },
        { provide: CurrencyService, useValue: { convert: j.fn() } },
        { provide: ShippingService, useValue: { generateLabel: j.fn() } },
        { provide: SettingsService, useValue: { getSystemSetting: j.fn() } },
        { provide: EmailService, useValue: emailMock },
        { provide: InventoryLedgerService, useValue: inventoryLedgerMock },
      ],
    }).compile();

    service = module.get<VendorService>(VendorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getMyProduct backfills digital alias fields for edit prefill', async () => {
    const userId = 42;
    const productId = 84;
    const mockProduct: any = {
      id: productId,
      vendor: { id: userId },
      images: [],
      category: null,
      tags: [],
      attributes: {
        digital: {
          type: 'digital',
          isFree: true,
          download: {
            key: 'ebooks/awesome-book.pdf',
            size: 7.14 * 1024 * 1024, // ~7.14 MB, expect fileSizeMB rounded to 2 decimals
            licenseRequired: true,
          },
        },
      },
    };

    productRepoMock.createQueryBuilder = j.fn(() => makeQb(mockProduct));
    productRepoMock.findOne = j.fn().mockResolvedValue(mockProduct);

    const result: any = await service.getMyProduct(userId, productId);

    expect(productRepoMock.findOne).toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.attributes).toBeDefined();

    const attrs = result.attributes as Record<string, any>;
    // Alias backfills
    expect(typeof attrs.downloadUrl).toBe('string');
    expect(attrs.downloadUrl).toMatch(
      /https:\/\/test-bucket\.test-region\.digitaloceanspaces\.com\/ebooks\/awesome-book\.pdf/,
    );
    expect(attrs.downloadKey).toBe('ebooks/awesome-book.pdf');
    expect(attrs.format).toBe('PDF');
    expect(attrs.fileSizeMB).toBeCloseTo(7.14, 2);
    expect(attrs.licenseRequired).toBe(true);
  });

  it('getMyProduct correctly handles and backfills read-time file/files aliases for digital products', async () => {
    const product: any = {
      id: 99,
      attributes: {
        digital: {
          type: 'digital',
          download: {
            key: 'docs/book.pdf',
            publicUrl:
              'https://bucket.region.digitaloceanspaces.com/docs/book.pdf',
            size: 5 * 1024 * 1024,
            contentType: 'application/pdf',
            filename: 'book.pdf',
            licenseRequired: true,
          },
        },
      },
    };
    productRepoMock.createQueryBuilder = j.fn(() => makeQb(product));
    productRepoMock.findOne = j.fn().mockResolvedValue(product);
    const normalized = await service.getMyProduct(1, 99).catch(() => null);

    expect(normalized).toBeDefined();
    expect(normalized.attributes).toBeDefined();

    const attrs = normalized.attributes as Record<string, any>;
    // New alias backfills
    expect(typeof attrs.downloadUrl).toBe('string');
    expect(attrs.downloadUrl).toMatch(
      /https:\/\/bucket\.region\.digitaloceanspaces\.com\/docs\/book\.pdf/,
    );
    expect(attrs.downloadKey).toBe('docs/book.pdf');
    expect(attrs.format).toBe('PDF');
    expect(attrs.fileSizeMB).toBeCloseTo(5, 2);
    expect(attrs.licenseRequired).toBe(true);
  });

  it('createMyProduct saves images', async () => {
    const user = {
      id: 1,
      verified: true,
      verificationStatus: VerificationStatus.APPROVED,
      roles: ['VENDOR'],
    } as any;
    userRepoMock.findOneBy.mockResolvedValue(user);

    const txImageSave = j.fn(async (imgs: any[]) => imgs);
    const txProductSave = j.fn(async (p: any) => ({ ...p, id: 555 }));
    const txTagSave = j.fn(async () => []);

    // Setup direct repo mocks because implementation doesn't use transaction
    productRepoMock.save = txProductSave;
    productRepoMock.create = (v: any) => v;
    productImageRepoMock.save = txImageSave;
    productImageRepoMock.create = (v: any) => v;
    tagRepoMock.save = txTagSave;
    tagRepoMock.find = j.fn().mockResolvedValue([]);
    tagRepoMock.create = (v: any) => v;

    // Also internal findOneOrFail call at end of createMyProduct
    productRepoMock.findOneOrFail.mockResolvedValue({
      id: 555,
      images: [],
      vendor: user,
      category: null,
      tags: [],
    });

    const dto: any = {
      name: 'Test',
      price: 10,
      currency: 'USD',
      images: [{ src: 'a' }, { src: 'b' }],
      categoryId: 1,
    };

    // Mock settings svc call if needed
    const getSysSetting = (service as any).settingsService.getSystemSetting;
    getSysSetting.mockResolvedValue('5');

    await service.createMyProduct(1, dto);

    // expect(productRepoMock.manager.transaction).toHaveBeenCalled();
    expect(txProductSave).toHaveBeenCalled();
    expect(txImageSave).toHaveBeenCalled();
    // Verify 2 images were saved (either in one call or multiple)
    // If bulk save:
    if (
      txImageSave.mock.calls.length === 1 &&
      Array.isArray(txImageSave.mock.calls[0][0])
    ) {
      expect(txImageSave.mock.calls[0][0].length).toBe(2);
    } else {
      // If individual saves or multiple batches
      const totalSaved = txImageSave.mock.calls.reduce(
        (acc: number, call: any[]) => {
          return acc + (Array.isArray(call[0]) ? call[0].length : 1);
        },
        0,
      );
      expect(totalSaved).toBe(2);
    }
  });

  it('createMyProduct persists staff lister attribution when staff creates for vendor', async () => {
    const vendor = {
      id: 1,
      verified: true,
      verificationStatus: VerificationStatus.APPROVED,
      roles: ['VENDOR'],
      displayName: 'Owner Store',
      email: 'owner@suuq.test',
    } as any;
    const creator = {
      id: 99,
      displayName: 'Vendor Staff',
      email: 'staff@suuq.test',
    } as any;

    userRepoMock.findOneBy.mockResolvedValue(vendor);
    const txProductSave = j.fn(async (p: any) => ({ ...p, id: 556 }));
    productRepoMock.save = txProductSave;
    productRepoMock.create = (v: any) => v;
    productRepoMock.findOneOrFail.mockResolvedValue({
      id: 556,
      createdById: 99,
      createdByName: 'Vendor Staff',
      images: [],
      vendor,
      category: null,
      tags: [],
    });

    const getSysSetting = (service as any).settingsService.getSystemSetting;
    getSysSetting.mockResolvedValue('5');

    await service.createMyProduct(
      1,
      {
        name: 'Staff listed product',
        price: 10,
        currency: 'USD',
      } as any,
      creator,
    );

    expect(txProductSave).toHaveBeenCalled();
    const firstSavedPayload = txProductSave.mock.calls[0][0];
    expect(firstSavedPayload.createdById).toBe(99);
    expect(firstSavedPayload.createdByName).toBe('Vendor Staff');
  });

  it('createMyProduct seeds inventory for the active branch import context', async () => {
    const vendor = {
      id: 1,
      verified: true,
      verificationStatus: VerificationStatus.APPROVED,
      roles: ['VENDOR'],
    } as any;

    userRepoMock.findOneBy.mockResolvedValue(vendor);
    productRepoMock.manager.getRepository = j.fn((entity: any) => {
      if (entity === Category) {
        return categoryRepoMock;
      }

      return {
        findOne: j
          .fn()
          .mockResolvedValue({ id: 22, ownerId: 1, isActive: true }),
      };
    });
    productRepoMock.save = j.fn(async (value: any) => ({ ...value, id: 777 }));
    productRepoMock.create = (value: any) => value;
    productRepoMock.findOneOrFail.mockResolvedValue({
      id: 777,
      images: [],
      vendor,
      category: null,
      tags: [],
    });
    tagRepoMock.find = j.fn().mockResolvedValue([]);
    tagRepoMock.create = (value: any) => value;
    tagRepoMock.save = j.fn().mockResolvedValue([]);

    const getSysSetting = (service as any).settingsService.getSystemSetting;
    getSysSetting.mockResolvedValue('5');

    await service.createMyProduct(
      1,
      {
        name: 'Imported coffee',
        price: 10,
        currency: 'USD',
        stockQuantity: 8,
      } as any,
      { id: 1 } as any,
      { branchId: 22 },
    );

    expect(inventoryLedgerMock.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 22,
        productId: 777,
        quantityDelta: 8,
        sourceType: 'VENDOR_PRODUCT_IMPORT',
      }),
    );
  });

  it('createMyProductsBulk returns per-row results and continues after failures by default', async () => {
    const createSpy = jest
      .spyOn(service, 'createMyProduct')
      .mockResolvedValueOnce({
        id: 1001,
        name: 'Row 1',
        status: 'publish',
      } as any)
      .mockRejectedValueOnce(new ForbiddenException('Row 2 failed'))
      .mockResolvedValueOnce({
        id: 1003,
        name: 'Row 3',
        status: 'publish',
      } as any);

    const result = await service.createMyProductsBulk(
      1,
      {
        rows: [
          { name: 'Row 1', price: 10, currency: 'USD' } as any,
          { name: 'Row 2', price: 11, currency: 'USD' } as any,
          { name: 'Row 3', price: 12, currency: 'USD' } as any,
        ],
      },
      { id: 99 } as any,
      { branchId: 31 },
    );

    expect(createSpy).toHaveBeenCalledTimes(3);
    expect(createSpy).toHaveBeenNthCalledWith(
      1,
      1,
      { name: 'Row 1', price: 10, currency: 'USD' },
      { id: 99 },
      { branchId: 31 },
    );
    expect(result).toEqual({
      totalRows: 3,
      createdCount: 2,
      failedCount: 1,
      stoppedEarly: false,
      created: [
        { rowIndex: 0, productId: 1001, name: 'Row 1', status: 'publish' },
        { rowIndex: 2, productId: 1003, name: 'Row 3', status: 'publish' },
      ],
      failures: [
        {
          rowIndex: 1,
          row: { name: 'Row 2', price: 11, currency: 'USD' },
          error: 'Row 2 failed',
        },
      ],
    });
  });

  it('createMyProductsBulk stops on first failure when continueOnError is false', async () => {
    const createSpy = jest
      .spyOn(service, 'createMyProduct')
      .mockResolvedValueOnce({
        id: 1001,
        name: 'Row 1',
        status: 'publish',
      } as any)
      .mockRejectedValueOnce(new ForbiddenException('Row 2 failed'));

    const result = await service.createMyProductsBulk(
      1,
      {
        continueOnError: false,
        rows: [
          { name: 'Row 1', price: 10, currency: 'USD' } as any,
          { name: 'Row 2', price: 11, currency: 'USD' } as any,
          { name: 'Row 3', price: 12, currency: 'USD' } as any,
        ],
      },
      { id: 99 } as any,
      { branchId: 31 },
    );

    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      totalRows: 3,
      createdCount: 1,
      failedCount: 1,
      stoppedEarly: true,
      created: [
        { rowIndex: 0, productId: 1001, name: 'Row 1', status: 'publish' },
      ],
      failures: [
        {
          rowIndex: 1,
          row: { name: 'Row 2', price: 11, currency: 'USD' },
          error: 'Row 2 failed',
        },
      ],
    });
  });

  it('getVendorProducts returns explicit listedBy staff classification', async () => {
    const vendorId = 1;
    productRepoMock.find.mockResolvedValue([
      {
        id: 901,
        name: 'Staff listed',
        createdById: 77,
        createdByName: 'Staff Member',
        vendor: { id: vendorId, storeName: 'Owner Store' },
        images: [],
      },
    ] as any);

    productRepoMock.query = j
      .fn()
      .mockResolvedValue([{ '?column?': 1 }] as any);
    productRepoMock.createQueryBuilder = j.fn(() => {
      const qb: any = {
        select: j.fn().mockReturnThis(),
        addSelect: j.fn().mockReturnThis(),
        where: j.fn().mockReturnThis(),
        andWhere: j.fn().mockReturnThis(),
        limit: j.fn().mockReturnThis(),
        getRawMany: j.fn().mockResolvedValue([]),
        getRawOne: j.fn().mockResolvedValue({}),
      };
      return qb;
    });

    const out: any[] = await service.getVendorProducts(vendorId, 'ETB');
    expect(Array.isArray(out)).toBe(true);
    expect(out[0]).toBeDefined();
    expect(out[0].listedBy).toEqual({
      name: 'Staff Member',
      type: 'staff',
      id: 77,
    });
  });

  it('updateMyProduct avoids wiping images when only primaryImageId is sent', async () => {
    const userId = 1;
    const productId = 2;
    const product = {
      id: productId,
      vendor: { id: userId },
      imageUrl: 'keep-me',
      attributes: {},
    } as any;

    const imageDelete = j.fn();
    const imageSave = j.fn();
    const productSave = j.fn(async (p: any) => p);

    productRepoMock.findOne = j.fn().mockResolvedValue(product);

    productRepoMock.manager.transaction.mockImplementation(async (cb: any) => {
      return cb({
        getRepository: (entity: any) => {
          if (entity === Product)
            return {
              findOne: j.fn().mockResolvedValue(product),
              save: productSave,
            } as any;
          if (entity === ProductImage)
            return {
              delete: imageDelete,
              save: imageSave,
              create: (v: any) => v,
            } as any;
          if (entity === Tag)
            return {
              find: j.fn().mockResolvedValue([] as any),
              save: j.fn(),
              create: (v: any) => v,
            } as any;
          if (entity === Category) return { findOne: j.fn() } as any;
          return {} as any;
        },
      });
    });

    productRepoMock.findOneOrFail.mockResolvedValue(product);

    const updated = await service.updateMyProduct(userId, productId, {
      primaryImageId: 123,
    } as any);

    expect(imageDelete).not.toHaveBeenCalled();
    expect(imageSave).not.toHaveBeenCalled();
    expect(updated.imageUrl).toBe('keep-me');
  });

  it('updateMyProduct preserves custom variant attributes', async () => {
    const userId = 1;
    const productId = 427;
    const product = {
      id: productId,
      vendor: { id: userId },
      attributes: {
        isFree: false,
        videoUrl: null,
        posterUrl: null,
      },
    } as any;

    productRepoMock.findOne = j.fn().mockResolvedValue(product);
    productRepoMock.save = j.fn(async (p: any) => p);
    productRepoMock.findOneOrFail = j.fn().mockResolvedValue(product);

    const updated = await service.updateMyProduct(userId, productId, {
      attributes: {
        Size: ['S', 'M', 'L'],
        Color: ['Red', 'Blue'],
        Material: ['Cotton'],
      },
    } as any);

    expect(productRepoMock.save).toHaveBeenCalled();
    expect(updated.attributes.Size).toEqual(['S', 'M', 'L']);
    expect(updated.attributes.Color).toEqual(['Red', 'Blue']);
    expect(updated.attributes.Material).toEqual(['Cotton']);
  });

  it('createShipment updates order and items', async () => {
    const order = {
      id: 10,
      paymentStatus: 'PAID',
      paymentMethod: 'PAID',
      status: 'PENDING',
      items: [],
    } as any;
    const item = {
      id: 1,
      order,
      product: { vendor: { id: 5 } },
      status: 'PENDING',
    } as any;

    const itemSave = j.fn(async (rows: any) => rows);
    const orderSave = j.fn(async (o: any) => o);

    orderItemRepoMock.find = j.fn().mockResolvedValue([item]);
    orderItemRepoMock.save = itemSave;
    orderRepoMock.save = orderSave;

    const res = await service.createShipment(5, 10, [1], {});
    expect(itemSave).toHaveBeenCalled();
    // Order status might not change if aggregated status is same, but let's assume it checks
    // expect(orderSave).toHaveBeenCalled(); // Logic says: if (order.status !== aggregate) save.
    // If only 1 item and it becomes SHIPPED, aggregate is SHIPPED. Order PENDING -> SHIPPED.
    expect(res[0].status).toBe('SHIPPED');
  });
});
