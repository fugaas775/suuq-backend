import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { VendorService } from './vendor.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Tag } from '../tags/tag.entity';
import { DoSpacesService } from '../media/do-spaces.service';
import { Category } from '../categories/entities/category.entity';
import { VerificationStatus } from '../users/entities/user.entity';

const j = jest as any;

describe('VendorService', () => {
  let service: VendorService;
  const productRepoMock: any = {};
  const userRepoMock: any = {};
  const orderRepoMock: any = {};
  const orderItemRepoMock: any = {};
  const productImageRepoMock: any = {};
  const tagRepoMock: any = {};
  const notificationsMock: any = {};
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

    Object.assign(productRepoMock, {
      create: j.fn((v: any) => v),
      save: j.fn(async (v: any) => v),
      findOne: j.fn(),
      findOneOrFail: j.fn(),
      findAndCount: j.fn(),
      manager: { transaction: j.fn() },
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorService,
        { provide: getRepositoryToken(User), useValue: userRepoMock },
        { provide: getRepositoryToken(Product), useValue: productRepoMock },
        { provide: getRepositoryToken(Order), useValue: orderRepoMock },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepoMock },
        {
          provide: getRepositoryToken(ProductImage),
          useValue: productImageRepoMock,
        },
        { provide: getRepositoryToken(Tag), useValue: tagRepoMock },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: DoSpacesService, useValue: doSpacesMock },
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

    const result: any = await service.getMyProduct(userId, productId);

    expect(productRepoMock.createQueryBuilder).toHaveBeenCalled();
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

  it('createMyProduct saves images inside a transaction', async () => {
    const user = {
      id: 1,
      verified: true,
      verificationStatus: VerificationStatus.APPROVED,
    } as any;
    userRepoMock.findOneBy.mockResolvedValue(user);

    const txImageSave = j.fn(async (imgs: any[]) => imgs);
    const txProductSave = j.fn(async (p: any) => ({ ...p, id: 555 }));
    const txTagSave = j.fn(async () => []);

    productRepoMock.manager.transaction.mockImplementation(async (cb: any) => {
      return cb({
        getRepository: (entity: any) => {
          if (entity === Product)
            return {
              save: txProductSave,
              create: (v: any) => v,
            } as any;
          if (entity === ProductImage)
            return {
              create: (v: any) => v,
              save: txImageSave,
            } as any;
          if (entity === Tag)
            return {
              find: j.fn().mockResolvedValue([] as any),
              save: txTagSave,
              create: (v: any) => v,
            } as any;
          if (entity === Category) return { findOne: j.fn() } as any;
          return {} as any;
        },
      });
    });

    productRepoMock.findOneOrFail.mockResolvedValue({
      id: 555,
      images: [],
      vendor: user,
      category: null,
      tags: [],
    });

    await service.createMyProduct(1, {
      name: 'Test',
      price: 10,
      currency: 'USD',
      images: [{ src: 'a' }, { src: 'b' }],
    } as any);

    expect(productRepoMock.manager.transaction).toHaveBeenCalled();
    expect(txImageSave).toHaveBeenCalledTimes(1);
    expect((txImageSave.mock.calls[0][0] as any[]).length).toBe(2);
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

  it('createShipment runs in a transaction and updates order and items', async () => {
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

    orderItemRepoMock.manager.transaction.mockImplementation(
      async (cb: any) => {
        return cb({
          getRepository: (entity: any) => {
            if (entity === OrderItem)
              return {
                find: j.fn().mockResolvedValue([item] as any),
                save: itemSave,
              } as any;
            if (entity === Order)
              return {
                save: orderSave,
              } as any;
            return {} as any;
          },
        });
      },
    );

    const res = await service.createShipment(5, 10, [1], {});
    expect(orderItemRepoMock.manager.transaction).toHaveBeenCalled();
    expect(itemSave).toHaveBeenCalled();
    expect(orderSave).toHaveBeenCalled();
    expect(res[0].status).toBe('SHIPPED');
  });
});
