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
import { DoSpacesService } from '../media/do-spaces.service';
import { AuditService } from '../audit/audit.service';
import { Review } from '../reviews/entities/review.entity';
import { GeoResolverService } from '../common/services/geo-resolver.service';
import { FavoritesService } from '../favorites/favorites.service';
import { CurrencyService } from '../common/services/currency.service';
import { EmailService } from '../email/email.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let productRepo: any;

  beforeEach(async () => {
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
          useValue: { convert: jest.fn(), getRate: jest.fn().mockReturnValue(1) },
        },
        { provide: EmailService, useValue: { send: jest.fn() } },
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
          isFree: true,
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
});
