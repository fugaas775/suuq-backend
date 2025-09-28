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
    extractKeyFromUrl: jest.fn((url: string) => {
      try {
        const u = new URL(url);
        return u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
      } catch {
        return null;
      }
    }),
    buildPublicUrl: jest.fn((key: string) => `https://test-bucket.test-region.digitaloceanspaces.com/${key}`),
    getSignedUrl: jest.fn(),
  };

  beforeEach(async () => {
    // Ensure env used by normalization exists
    process.env.DO_SPACES_BUCKET = 'test-bucket';
    process.env.DO_SPACES_REGION = 'test-region';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorService,
        { provide: getRepositoryToken(User), useValue: userRepoMock },
        { provide: getRepositoryToken(Product), useValue: productRepoMock },
        { provide: getRepositoryToken(Order), useValue: orderRepoMock },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepoMock },
        { provide: getRepositoryToken(ProductImage), useValue: productImageRepoMock },
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

    productRepoMock.findOne = jest.fn().mockResolvedValue(mockProduct);

    const result: any = await service.getMyProduct(userId, productId);

    expect(productRepoMock.findOne).toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.attributes).toBeDefined();

    const attrs = result.attributes as Record<string, any>;
    // Alias backfills
    expect(typeof attrs.downloadUrl).toBe('string');
    expect(attrs.downloadUrl).toMatch(/https:\/\/test-bucket\.test-region\.digitaloceanspaces\.com\/ebooks\/awesome-book\.pdf/);
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
            publicUrl: 'https://bucket.region.digitaloceanspaces.com/docs/book.pdf',
            size: 5 * 1024 * 1024,
            contentType: 'application/pdf',
            filename: 'book.pdf',
            licenseRequired: true,
          },
        },
      },
    };
    const normalized = await (service as any).getMyProduct?.call(
      { productRepository: { findOne: async () => product } },
      undefined,
      99,
      {},
    ).catch(() => null);

    expect(normalized).toBeDefined();
    expect(normalized.attributes).toBeDefined();

    const attrs = normalized.attributes as Record<string, any>;
    // New alias backfills
    expect(typeof attrs.downloadUrl).toBe('string');
    expect(attrs.downloadUrl).toMatch(/https:\/\/bucket\.region\.digitaloceanspaces\.com\/docs\/book\.pdf/);
    expect(attrs.downloadKey).toBe('docs/book.pdf');
    expect(attrs.format).toBe('PDF');
    expect(attrs.fileSizeMB).toBeCloseTo(5, 2);
    expect(attrs.licenseRequired).toBe(true);
  });
});
