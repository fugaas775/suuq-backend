import { Injectable } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../categories/entities/category.entity';

@Injectable()
export class HomeService {
  constructor(
    private readonly productsService: ProductsService,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
  ) {}

  async getHomeFeed(opts: { perSection: number; userCity?: string; userRegion?: string; userCountry?: string; view?: 'grid' | 'full' }) {
    const { perSection, userCity, userRegion, userCountry, view } = opts;

    // Build base filters per section
    const base = { perPage: perSection } as any;

    const curatedNewTags = 'home-new,home_new,new_arrival,curated-new';
    const curatedBestTags = 'home-best,home_best,best_seller,curated-best';

    const [bestSellers, topRated, geoAll, newArrivals, curatedNew, curatedBest] = await Promise.all([
      this.productsService.findFiltered({ ...base, sort: 'sales_desc', view } as any),
      this.productsService.findFiltered({ ...base, sort: 'rating_desc', view } as any),
      this.productsService.findFiltered({ ...base, sort: 'rating_desc', geoPriority: true, userCity, userRegion, userCountry, view } as any),
      // New arrivals: prefer most recent, lightly geo-prioritized
      this.productsService.findFiltered({ ...base, sort: 'created_desc', geoPriority: true, userCity, userRegion, userCountry, view } as any),
      // Curated by tags
      this.productsService.findFiltered({ ...base, sort: 'created_desc', tags: curatedNewTags, view } as any),
      this.productsService.findFiltered({ ...base, sort: 'sales_desc', tags: curatedBestTags, view } as any),
    ]);

    return {
      bestSellers: bestSellers.items,
      topRated: topRated.items,
      geoAll: geoAll.items,
      newArrivals: newArrivals.items,
      curatedNew: curatedNew.items,
      curatedBest: curatedBest.items,
    };
  }

  async getHomeConfig() {
    // Featured categories ordered; include minimal fields for client chips/cards
    const categories = await this.categoryRepo.find({
      where: {},
      order: { sortOrder: 'ASC', name: 'ASC' as any },
      take: 20,
    });
    return {
      featuredCategories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, iconUrl: c.iconUrl, order: c.sortOrder })),
      eastAfricaCountries: ['ET', 'SO', 'KE', 'DJ'],
      defaultSorts: {
        homeAll: 'rating_desc',
        bestSellers: 'sales_desc',
        topRated: 'rating_desc',
      },
    };
  }
}
