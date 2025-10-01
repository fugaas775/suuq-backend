import { Test, TestingModule } from '@nestjs/testing';
import { HomeService } from './home.service';
import { ProductsService } from '../products/products.service';
import { ProductListingService } from '../products/listing/product-listing.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { User } from '../users/entities/user.entity';
import { CurationService } from '../curation/curation.service';

describe('HomeService (Explore engine flag)', () => {
  let service: HomeService;
  const productsService = { findFiltered: jest.fn() } as any;
  const listingService = { list: jest.fn() } as any;
  const curation = { getSection: jest.fn().mockResolvedValue({ items: [] }) } as any;

  beforeEach(async () => {
    process.env.HOME_EXPLORE_ENGINE_V2 = '1';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeService,
        { provide: ProductsService, useValue: productsService },
        { provide: ProductListingService, useValue: listingService },
        { provide: getRepositoryToken(Category), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(User), useValue: { query: jest.fn().mockResolvedValue([]) } },
        { provide: CurationService, useValue: curation },
      ],
    }).compile();

    service = module.get<HomeService>(HomeService);
  });

  it('uses listing engine when flag is on and maps cards internally', async () => {
    listingService.list.mockResolvedValue({ items: [{ id: 1 }], total: 1, page: 1, perPage: 20, totalPages: 1 });

    const resp = await service.getV2HomeFeed({ page: 1, perPage: 1 });

    expect(listingService.list).toHaveBeenCalled();
    expect(productsService.findFiltered).not.toHaveBeenCalled();
    // Payload shape contains exploreProducts.items array
    expect(Array.isArray(resp.exploreProducts.items)).toBe(true);
  });

  it('falls back to ProductsService when flag is off', async () => {
    process.env.HOME_EXPLORE_ENGINE_V2 = '0';
    productsService.findFiltered.mockResolvedValue({ items: [], total: 0, currentPage: 1 });

    const resp = await service.getV2HomeFeed({ page: 1, perPage: 1 });

    expect(productsService.findFiltered).toHaveBeenCalled();
    expect(Array.isArray(resp.exploreProducts.items)).toBe(true);
  });
});
