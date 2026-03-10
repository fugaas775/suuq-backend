import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { Tag } from '../tags/tag.entity';
import { Category } from '../categories/entities/category.entity';
import { ProductImpression } from './entities/product-impression.entity';
import { SearchKeyword } from './entities/search-keyword.entity';
import { MediaCleanupTask } from '../media/entities/media-cleanup-task.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { DoSpacesService } from '../media/do-spaces.service';
import { AuditService } from '../audit/audit.service';
import { Review } from '../reviews/entities/review.entity';
import { GeoResolverService } from '../common/services/geo-resolver.service';
import { FavoritesService } from '../favorites/favorites.service';
import { CurrencyService } from '../common/services/currency.service';
import { EmailService } from '../email/email.service';
import { BadRequestException } from '@nestjs/common';
import { ImageSimilarityService } from '../search/image-similarity.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let productRepo: any;
  let imageSimilarity: any;

  beforeEach(async () => {
    imageSimilarity = {
      searchSimilarByProduct: jest.fn().mockResolvedValue({
        matches: [],
        fallbackImages: [],
      }),
    };

    productRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductImage), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Order), useValue: {} },
        { provide: getRepositoryToken(Tag), useValue: {} },
        { provide: getRepositoryToken(Category), useValue: {} },
        { provide: getRepositoryToken(ProductImpression), useValue: {} },
        { provide: getRepositoryToken(SearchKeyword), useValue: {} },
        { provide: getRepositoryToken(Review), useValue: {} },
        { provide: getRepositoryToken(MediaCleanupTask), useValue: {} },
        { provide: NotificationsService, useValue: { sendToUser: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: GeoResolverService,
          useValue: { resolveCountryFromCity: jest.fn() },
        },
        { provide: FavoritesService, useValue: {} },
        { provide: CurrencyService, useValue: { convert: jest.fn() } },
        { provide: EmailService, useValue: { send: jest.fn() } },
        {
          provide: DoSpacesService,
          useValue: {
            urlToKeyIfInBucket: jest.fn((url: string) => {
              try {
                const u = new URL(url);
                return u.pathname.replace(/^\//, '');
              } catch {
                return null;
              }
            }),
            buildPublicUrl: jest.fn(
              (key: string) =>
                `https://bucket.region.digitaloceanspaces.com/${key}`,
            ),
            getDownloadSignedUrl: jest.fn(),
            deleteObject: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
            countForTargetSince: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: GeoResolverService,
          useValue: { resolveCountryFromCity: jest.fn() },
        },
        {
          provide: FavoritesService,
          useValue: { removeProductEverywhere: jest.fn() },
        },
        {
          provide: CurrencyService,
          useValue: {
            convert: jest.fn(),
            getRate: jest.fn().mockReturnValue(1),
          },
        },
        { provide: EmailService, useValue: { send: jest.fn() } },
        { provide: ImageSimilarityService, useValue: imageSimilarity },
      ],
    }).compile();

    // Ensure environment used by normalization is present
    process.env.DO_SPACES_BUCKET = 'bucket';
    process.env.DO_SPACES_REGION = 'region';

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findOne backfills digital alias fields for public reads', async () => {
    const productId = 42;
    const key = 'books/guide.pdf';
    const size = 10 * 1024 * 1024; // 10 MB
    const publicUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com/${key}`;

    const entity: Product = Object.assign(new Product(), {
      id: productId,
      name: 'Digital Guide',
      price: 0,
      currency: 'USD',
      description: 'A useful guide',
      imageUrl: null,
      attributes: {
        digital: {
          type: 'digital',
          download: {
            key,
            size,
            licenseRequired: true,
          },
        },
      },
      productType: 'digital',
      viewCount: 0,
      createdAt: new Date(),
      vendor: undefined,
    });

    productRepo.findOne.mockResolvedValue(entity);

    const out = await service.findOne(productId);
    expect(out).toBeTruthy();
    expect(out.attributes).toBeTruthy();

    // Aliases
    expect(out.attributes.downloadKey).toBe(key);
    expect(out.attributes.downloadUrl).toBe(publicUrl);
    expect(out.attributes.format).toBe('PDF');

    // fileSizeMB is rounded to 2 decimals
    const expectedMb = Math.round((size / (1024 * 1024)) * 100) / 100;
    expect(out.attributes.fileSizeMB).toBe(expectedMb);

    // licenseRequired bubbled to alias
    expect(out.attributes.licenseRequired).toBe(true);

    // Ensure top-level stays normalized too
    expect(out.productType).toBe('digital');

    // New file/files aliases for UI prefill
    expect(out.attributes.file).toBeTruthy();
    expect(out.attributes.file.url).toBe(publicUrl);
    expect(out.attributes.file.key).toBe(key);
    expect(out.attributes.files).toBeTruthy();
    expect(Array.isArray(out.attributes.files)).toBe(true);
    expect(out.attributes.files[0].url).toBe(publicUrl);
  });

  it('findOne does not emit self-only similarImageStrip entries', async () => {
    const productId = 625;
    const imageUrl = 'https://cdn.example.com/full_625.jpg';
    const entity: Product = Object.assign(new Product(), {
      id: productId,
      name: 'Focus Product',
      price: 100,
      currency: 'ETB',
      description: 'desc',
      imageUrl,
      attributes: {},
      createdAt: new Date(),
      vendor: undefined,
    });

    productRepo.findOne.mockResolvedValue(entity);
    imageSimilarity.searchSimilarByProduct.mockResolvedValue({
      matches: [
        {
          productId,
          src: imageUrl,
          thumbnail: imageUrl,
          lowRes: null,
          distance: 1,
        },
      ],
      fallbackImages: [
        {
          productId,
          src: imageUrl,
          thumbnail: imageUrl,
          lowRes: null,
        },
      ],
    });

    const out = await service.findOne(productId);

    expect(imageSimilarity.searchSimilarByProduct).toHaveBeenCalledWith(
      productId,
      expect.any(Object),
    );
    expect(Array.isArray((out as any).similarImageStrip)).toBe(false);
    expect(Array.isArray((out as any).attributes?.similarImageStrip)).toBe(
      false,
    );
  });

  it('findOne falls back to related products when similarity has no useful matches', async () => {
    const productId = 614;
    const entity: Product = Object.assign(new Product(), {
      id: productId,
      name: 'Focus Product',
      price: 200,
      currency: 'ETB',
      description: 'desc',
      imageUrl: 'https://cdn.example.com/full_614.jpg',
      attributes: {},
      createdAt: new Date(),
      vendor: undefined,
      status: 'publish',
      isBlocked: false,
      category: { id: 10 } as any,
    });

    productRepo.findOne.mockResolvedValue(entity);
    imageSimilarity.searchSimilarByProduct.mockResolvedValue({
      matches: [
        {
          productId,
          src: 'https://cdn.example.com/full_614.jpg',
          thumbnail: 'https://cdn.example.com/full_614.jpg',
          lowRes: null,
          distance: 1,
        },
      ],
      fallbackImages: [],
    });

    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 999,
          imageUrl: 'https://cdn.example.com/full_999.jpg',
          images: [],
          currency: 'ETB',
          price: 10,
          name: 'Other Product',
          createdAt: new Date().toISOString(),
        },
      ]),
    };
    productRepo.createQueryBuilder.mockReturnValue(qb);

    const out = await service.findOne(productId);

    expect((out as any).similarImageStrip).toEqual(
      expect.arrayContaining([expect.objectContaining({ productId: 999 })]),
    );
    expect((out as any).attributes?.similarImageStrip).toEqual(
      (out as any).similarImageStrip,
    );
  });

  it('normalizes restaurant attributes into canonical keys and values', () => {
    const attrs = {
      menuSection: 'breakfast',
      availability: 'available',
      serviceType: 'delivery',
      orderClass: 'special order',
    };
    const category = {
      slug: 'restaurant-specials',
      name: 'Restaurant Specials',
    };

    const out = (service as any).sanitizeAttributesForCategory(
      attrs,
      category,
      {
        requireRestaurantMenuSection: true,
      },
    );

    expect(out.menuSection).toBe('Breakfast');
    expect(out.availability).toBe('Available');
    expect(out.serviceType).toBe('Delivery');
    expect(out.orderClass).toBe('Special Order');
    expect(out.menu_section).toBeUndefined();
    expect(out.stock_status).toBeUndefined();
    expect(out.service_type).toBeUndefined();
    expect(out.order_type).toBeUndefined();
  });

  it('accepts snake_case restaurant enum values from client payloads', () => {
    const attrs = {
      menuSection: 'main_dishes',
      availability: 'out_of_stock',
      serviceType: 'dine_in',
      orderClass: 'special_order',
    };
    const category = {
      slug: 'restaurant-specials',
      name: 'Restaurant Specials',
    };

    const out = (service as any).sanitizeAttributesForCategory(
      attrs,
      category,
      {
        requireRestaurantMenuSection: true,
      },
    );

    expect(out.menuSection).toBe('Main Dishes');
    expect(out.availability).toBe('Out of stock');
    expect(out.serviceType).toBe('Dine-in');
    expect(out.orderClass).toBe('Special Order');
  });

  it('accepts camelCase restaurant enum values from client payloads', () => {
    const attrs = {
      menuSection: 'fastFoodsSnacks',
      availability: 'outOfStock',
      serviceType: 'dineIn',
      orderClass: 'specialOrder',
    };
    const category = {
      slug: 'restaurant-specials',
      name: 'Restaurant Specials',
    };

    const out = (service as any).sanitizeAttributesForCategory(
      attrs,
      category,
      {
        requireRestaurantMenuSection: true,
      },
    );

    expect(out.menuSection).toBe('Fast Foods & Snacks');
    expect(out.availability).toBe('Out of stock');
    expect(out.serviceType).toBe('Dine-in');
    expect(out.orderClass).toBe('Special Order');
  });

  it('does not require menuSection for Food & Beverages > Restaurant & Catering Deals', () => {
    const category = {
      slug: 'restaurant-catering-deals',
      name: 'Food & Beverages > Restaurant & Catering Deals',
    };

    const out = (service as any).sanitizeAttributesForCategory(
      { availability: 'Available' },
      category,
      {
        requireRestaurantMenuSection: true,
      },
    );

    expect(out).toEqual({ availability: 'Available' });
  });

  it('throws when menuSection is missing for restaurant categories that still use variations', () => {
    const category = {
      slug: 'restaurant-specials',
      name: 'Restaurant Specials',
    };

    expect(() =>
      (service as any).sanitizeAttributesForCategory(
        { availability: 'Available' },
        category,
        {
          requireRestaurantMenuSection: true,
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects non-canonical legacy restaurant attribute aliases', () => {
    const category = {
      slug: 'restaurant-specials',
      name: 'Restaurant Specials',
    };

    expect(() =>
      (service as any).sanitizeAttributesForCategory(
        {
          section: 'Breakfast',
          stockStatus: 'Available',
          service: 'Delivery',
          orderType: 'Regular',
        },
        category,
        { requireRestaurantMenuSection: true },
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts snake_case restaurant attribute keys and canonicalizes', () => {
    const category = {
      slug: 'restaurant-specials',
      name: 'Restaurant Specials',
    };

    const out = (service as any).sanitizeAttributesForCategory(
      {
        menu_section: 'Breakfast',
        stock_status: 'Available',
        service_type: 'Delivery',
        order_class: 'Regular',
      },
      category,
      { requireRestaurantMenuSection: true },
    );

    expect(out.menuSection).toBe('Breakfast');
    expect(out.availability).toBe('Available');
    expect(out.serviceType).toBe('Delivery');
    expect(out.orderClass).toBe('Regular');
    expect(out.menu_section).toBeUndefined();
    expect(out.stock_status).toBeUndefined();
    expect(out.service_type).toBeUndefined();
    expect(out.order_class).toBeUndefined();
  });

  it('rejects priceUnit for non-property categories', () => {
    expect(() =>
      (service as any).sanitizeAttributesForCategory(
        { priceUnit: 'm2' },
        { slug: 'health-beauty-products', name: 'Health & Beauty Products' },
      ),
    ).toThrow(BadRequestException);
  });

  it('normalizes property area unit from price_unit alias', () => {
    const out = (service as any).sanitizeAttributesForCategory(
      { price_unit: '/m2' },
      { slug: 'property-for-rent', name: 'Property for rent' },
    );

    expect(out.priceUnit).toBe('m2');
    expect(out.price_unit).toBeUndefined();
  });

  it('rejects personal-care content posted under property category', () => {
    expect(() =>
      (service as any).assertPropertyCategoryContentConsistency(
        {
          name: 'Rexona Men Deodorant',
          description: 'Fragrance & Perfumes',
          attributes: { brand: 'Rexona' },
        },
        { slug: 'property-for-sale', name: 'Property for sale' },
      ),
    ).toThrow(BadRequestException);
  });

  it('strips priceUnit from non-property payloads on read sanitization', () => {
    const target: any = {
      category: { slug: 'fragrances-perfumes', name: 'Fragrances & Perfumes' },
      productType: 'physical',
      attributes: { priceUnit: 'm2', keep: true },
    };

    const out = (service as any).sanitizeReadPayloadForCategory(target);
    expect(out.attributes.keep).toBe(true);
    expect(out.attributes.priceUnit).toBeUndefined();
  });

  it('keeps priceUnit for property payloads on read sanitization', () => {
    const target: any = {
      category: { slug: 'property-for-rent', name: 'Property for rent' },
      productType: 'property',
      attributes: { priceUnit: 'm2' },
    };

    const out = (service as any).sanitizeReadPayloadForCategory(target);
    expect(out.attributes.priceUnit).toBe('m2');
  });

  it('strips /m2-like suffix from non-property price text fields on read', () => {
    const target: any = {
      category: { slug: 'fragrances-perfumes', name: 'Fragrances & Perfumes' },
      productType: 'physical',
      priceText: '800 ETB / m2',
      attributes: {
        price_text: '800 ETB per sqm',
        unitPriceText: '1200 birr / sqft',
      },
    };

    const out = (service as any).sanitizeReadPayloadForCategory(target);
    expect(out.priceText).toBe('800 ETB');
    expect(out.attributes.price_text).toBe('800 ETB');
    expect(out.attributes.unitPriceText).toBe('1200 birr');
  });

  it('merges top-level restaurant aliases into canonical attribute keys', () => {
    const out = (service as any).extractRestaurantTopLevelAliases({
      menu_section: 'beverages',
      stock_status: 'on_request',
      service_type: 'takeaway',
      order_type: 'regular',
    });

    expect(out).toEqual({
      menuSection: 'beverages',
      availability: 'on_request',
      serviceType: 'takeaway',
      orderClass: 'regular',
    });
  });

  it('prefers attributes values over top-level alias fallback when both exist', () => {
    const topLevel = (service as any).extractRestaurantTopLevelAliases({
      menuSection: 'beverages',
      serviceType: 'delivery',
    });

    const merged = {
      ...topLevel,
      menuSection: 'mainDishes',
      serviceType: 'dineIn',
      availability: 'available',
      orderClass: 'regular',
    };

    const out = (service as any).sanitizeAttributesForCategory(
      merged,
      { slug: 'restaurant-specials', name: 'Restaurant Deals' },
      { requireRestaurantMenuSection: true },
    );

    expect(out.menuSection).toBe('Main Dishes');
    expect(out.serviceType).toBe('Dine-in');
  });

  it('findFeaturedActive excludes soft-deleted products', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    } as any;
    productRepo.createQueryBuilder.mockReturnValueOnce(qb);

    await service.findFeaturedActive(5);

    expect(qb.andWhere).toHaveBeenCalledWith('product.deleted_at IS NULL');
  });

  it('findRelatedProducts excludes soft-deleted products', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    } as any;

    productRepo.findOne.mockResolvedValue({
      id: 101,
      category: { id: 7 },
      vendor: { id: 55 },
      tags: [],
    });
    productRepo.createQueryBuilder.mockReturnValueOnce(qb);

    await service.findRelatedProducts(101, { limit: 12, currency: 'ETB' });

    expect(qb.andWhere).toHaveBeenCalledWith('product.deleted_at IS NULL');
  });

  it('findRelatedProducts adds strict vehicle signal guard for vehicle category', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    } as any;

    productRepo.findOne.mockResolvedValue({
      id: 202,
      category: { id: 11, slug: 'vehicles' },
      vendor: { id: 77 },
      tags: [],
    });
    productRepo.createQueryBuilder.mockReturnValueOnce(qb);

    await service.findRelatedProducts(202, { limit: 12, currency: 'ETB' });

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("product.attributes->>'make'"),
    );
  });
});
