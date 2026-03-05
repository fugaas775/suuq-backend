import { Test, TestingModule } from '@nestjs/testing';
import { HomeService } from './home.service';
import { ProductsService } from '../products/products.service';
import { ProductListingService } from '../products/listing/product-listing.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { Favorite } from '../favorites/entities/favorite.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { CurationService } from '../curation/curation.service';
import { ImageSimilarityService } from '../search/image-similarity.service';

describe('HomeService (Explore engine flag)', () => {
  let service: HomeService;
  const productsService = {
    findFiltered: jest.fn().mockResolvedValue({ items: [] }),
  } as any;
  const listingService = {
    list: jest.fn().mockResolvedValue({ items: [], meta: { total: 0 } }),
  } as any;
  const curation = {
    getSection: jest.fn().mockResolvedValue({ items: [] }),
  } as any;
  const imageSimilarity = {
    searchSimilarByProduct: jest.fn().mockResolvedValue({ matches: [] }),
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.HOME_EXPLORE_ENGINE_V2 = '1';
    process.env.HOME_IMMERSIVE_SIMILAR_IMAGES_ENABLED = '0';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeService,
        { provide: ProductsService, useValue: productsService },
        { provide: ProductListingService, useValue: listingService },
        {
          provide: getRepositoryToken(Category),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Favorite),
          useValue: {
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { query: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Order),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        { provide: CurationService, useValue: curation },
        {
          provide: ImageSimilarityService,
          useValue: imageSimilarity,
        },
      ],
    }).compile();

    service = module.get<HomeService>(HomeService);
  });

  it('uses listing engine when flag is on and maps cards internally', async () => {
    listingService.list.mockResolvedValue({
      items: [{ id: 1, name: 'One', currency: 'ETB', price: 10 }],
      total: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
    });

    const resp = await service.getV2HomeFeed({ page: 1, perPage: 1 });

    expect(listingService.list).toHaveBeenCalled();
    // It IS called for Featured Products, but should NOT be called for Explore (so we check args)
    expect(productsService.findFiltered).toHaveBeenCalledWith(
      expect.objectContaining({ featured: true }),
    );
    // Payload shape contains exploreProducts.items array
    expect(Array.isArray(resp.exploreProducts.items)).toBe(true);
  });

  it('propagates geo/rotation params and returns tier metadata', async () => {
    listingService.list
      .mockResolvedValueOnce({
        items: [{ id: 11, name: 'A', currency: 'ETB', price: 10 }],
        total: 1,
        page: 1,
        perPage: 20,
        totalPages: 1,
      })
      .mockResolvedValueOnce({
        items: [{ id: 12, name: 'B', currency: 'ETB', price: 20 }],
        total: 1,
        page: 1,
        perPage: 20,
        totalPages: 1,
      })
      .mockResolvedValueOnce({
        items: [{ id: 13, name: 'C', currency: 'ETB', price: 30 }],
        total: 1,
        page: 1,
        perPage: 20,
        totalPages: 1,
      });

    const resp = await service.getV2HomeFeed({
      page: 1,
      perPage: 3,
      userCountry: 'Ethiopia',
      userRegion: 'Addis Ababa',
      userCity: 'Addis Ababa',
      rotationKey: 'rev-1',
      sessionSalt: 'abc',
      rotationBucket: '2026-02-25T10:00:00.000Z',
      refreshReason: 'revisit',
      requestId: 'req-123',
    });

    expect(listingService.list).toHaveBeenCalled();
    expect(listingService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        userCountry: 'Ethiopia',
        geoCountryStrict: true,
        geoRotationBucket: '2026-02-25T10:00:00.000Z|req-123',
      }),
      expect.objectContaining({ mapCards: false }),
    );
    expect(resp.meta).toEqual(
      expect.objectContaining({
        requestId: 'req-123',
        refreshReason: 'revisit',
        rotationBucket: '2026-02-25T10:00:00.000Z|req-123',
        geoScopeUsed: expect.any(String),
        rankingTierCounts: expect.objectContaining({
          city_country: expect.any(Number),
          region_country: expect.any(Number),
          country_only: expect.any(Number),
          east_africa: expect.any(Number),
          world: expect.any(Number),
        }),
      }),
    );
  });

  it('falls back to ProductsService when flag is off', async () => {
    process.env.HOME_EXPLORE_ENGINE_V2 = '0';
    productsService.findFiltered.mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
    });

    const resp = await service.getV2HomeFeed({ page: 1, perPage: 1 });

    expect(productsService.findFiltered).toHaveBeenCalled();
    expect(Array.isArray(resp.exploreProducts.items)).toBe(true);
  });

  it('keeps explore non-empty when listing tiers fail', async () => {
    listingService.list.mockRejectedValue(new Error('tier query failed'));
    productsService.findFiltered.mockImplementation(async (query: any) => {
      if (query?.featured) return { items: [] };
      return {
        items: [{ id: 999, name: 'Fallback item', currency: 'ETB', price: 42 }],
        total: 1,
        currentPage: 1,
      };
    });

    const resp = await service.getV2HomeFeed({
      page: 1,
      perPage: 1,
      userCountry: 'Ethiopia',
      geoAppend: true,
    });

    expect(resp.exploreProducts.items.length).toBe(1);
    expect(resp.exploreProducts.items[0].id).toBe(999);
    expect(productsService.findFiltered).toHaveBeenCalledWith(
      expect.objectContaining({
        perPage: 1,
        view: 'grid',
      }),
    );
  });

  it('uses requested page and preserves explore total for infinite scroll', async () => {
    listingService.list.mockResolvedValue({
      items: [{ id: 21, name: 'Page Two', currency: 'ETB', price: 15 }],
      total: 120,
      page: 2,
      perPage: 20,
      totalPages: 6,
    });

    const resp = await service.getV2HomeFeed({
      page: 2,
      perPage: 20,
      userCountry: 'Ethiopia',
    });

    expect(listingService.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.objectContaining({ mapCards: false }),
    );
    expect(resp.exploreProducts.page).toBe(2);
    expect(resp.exploreProducts.total).toBeGreaterThan(20);
  });

  it('hydrates immersive similar strip with non-self items and mirrors attributes', async () => {
    process.env.HOME_IMMERSIVE_SIMILAR_IMAGES_ENABLED = '1';
    listingService.list.mockResolvedValue({
      items: [
        {
          id: 625,
          name: 'Focus Product',
          currency: 'ETB',
          price: 123,
          imageUrl: 'https://cdn.example.com/full_focus.jpg',
        },
      ],
      total: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
    });
    imageSimilarity.searchSimilarByProduct.mockResolvedValue({
      matches: [
        {
          productId: 625,
          src: 'https://cdn.example.com/full_focus.jpg',
          thumbnail: 'https://cdn.example.com/full_focus.jpg',
          lowRes: null,
          distance: 1,
        },
        {
          productId: 777,
          src: 'https://cdn.example.com/full_other.jpg',
          thumbnail: 'https://cdn.example.com/thumb_other.jpg',
          lowRes: 'https://cdn.example.com/lowres_other.jpg',
          distance: 3,
        },
      ],
      fallbackImages: [
        {
          productId: 625,
          src: 'https://cdn.example.com/full_focus.jpg',
          thumbnail: 'https://cdn.example.com/full_focus.jpg',
        },
      ],
    });

    const resp = await service.getV2HomeFeed({ page: 1, perPage: 1 });
    const card = resp.exploreProducts.items[0];

    expect(imageSimilarity.searchSimilarByProduct).toHaveBeenCalledWith(
      625,
      expect.any(Object),
    );
    expect(card.similarImageStrip).toEqual(
      expect.arrayContaining([expect.objectContaining({ productId: 777 })]),
    );
    expect(card.similarImageStrip).toHaveLength(1);
    expect(card.attributes.similarImageStrip).toEqual(card.similarImageStrip);
  });
});
