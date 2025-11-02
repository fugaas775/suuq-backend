import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
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
import { FavoritesService } from '../favorites/favorites.service';

describe('ProductsService.deleteProduct media cleanup', () => {
  let service: ProductsService;

  const productRepo = {
    findOne: jest.fn(),
    delete: jest.fn(),
  };
  const productImageRepo = {};
  const userRepo = {};
  const orderRepo = { count: jest.fn() };
  const tagRepo = {};
  const categoryRepo = {};
  const impressionRepo = {};
  const searchKeywordRepo = {};
  const reviewRepo = { delete: jest.fn() };
  const favorites = { removeProductEverywhere: jest.fn().mockResolvedValue(0) } as unknown as FavoritesService;

  const doSpaces = {
    urlToKeyIfInBucket: jest.fn((url: string) => {
      try {
        const u = new URL(url);
        // return the path under host as key
        return u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
      } catch {
        return null;
      }
    }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getDownloadSignedUrl: jest.fn(),
  } as unknown as DoSpacesService;

  const audit = { log: jest.fn(), countForTargetSince: jest.fn() } as unknown as AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductImage), useValue: productImageRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(Tag), useValue: tagRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(ProductImpression), useValue: impressionRepo },
        { provide: getRepositoryToken(SearchKeyword), useValue: searchKeywordRepo },
        { provide: getRepositoryToken(Review), useValue: reviewRepo },
        { provide: DoSpacesService, useValue: doSpaces },
        { provide: AuditService, useValue: audit },
        { provide: FavoritesService, useValue: favorites },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  it('attempts to delete associated media keys and URLs', async () => {
    const product: any = {
      id: 42,
      vendor: { id: 123 },
      imageUrl: 'https://bucket.region.digitaloceanspaces.com/images/main.jpg',
      images: [
        {
          src: 'https://bucket.region.digitaloceanspaces.com/images/img1.jpg',
          thumbnailSrc: 'https://bucket.region.digitaloceanspaces.com/images/img1-thumb.jpg',
          lowResSrc: 'https://bucket.region.digitaloceanspaces.com/images/img1-low.jpg',
        },
      ],
      attributes: {
        digital: { download: { key: 'downloads/file1.zip', publicUrl: 'https://bucket.region.digitaloceanspaces.com/downloads/file1.zip' } },
        videoUrl: 'https://bucket.region.digitaloceanspaces.com/videos/v1.mp4',
        posterUrl: 'https://bucket.region.digitaloceanspaces.com/videos/v1.jpg',
      },
    };
    productRepo.findOne.mockResolvedValue(product);
    orderRepo.count.mockResolvedValue(0);
    productRepo.delete.mockResolvedValue({});

    const res = await service.deleteProduct(42, { id: 123 } as any);
    expect(res).toEqual({ deleted: true });

    // Ensure order check and final delete were called
    expect(orderRepo.count).toHaveBeenCalled();
    expect(productRepo.delete).toHaveBeenCalledWith(42);

    // Validate deleteObject was called for deduped set of keys
    const deletedKeys = (doSpaces.deleteObject as any).mock.calls.map((c: any[]) => c[0]);
    const expectKeys = [
      'images/main.jpg',
      'images/img1.jpg',
      'images/img1-thumb.jpg',
      'images/img1-low.jpg',
      'downloads/file1.zip', // from urlToKey
      'downloads/file1.zip', // from explicit key in attributes (may be deduped by Set in impl)
      'videos/v1.mp4',
      'videos/v1.jpg',
    ];
    // Ensure at least each unique key was attempted once
    const uniqueExpected = Array.from(new Set(expectKeys));
    for (const k of uniqueExpected) {
      expect(deletedKeys).toContain(k);
    }
  });
});
