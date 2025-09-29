import { Injectable } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { CurationService } from '../curation/curation.service';
// Avoid VendorModule import to prevent circular deps; query vendors directly via User repo
import { toProductCard } from '../products/utils/product-card.util';
import { User } from '../users/entities/user.entity';

@Injectable()
export class HomeService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly curation: CurationService,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * DEPRECATED: v1 home feed (multiple parallel queries). Use getV2HomeFeed instead.
   */
  async getHomeFeed(opts: {
    perSection: number;
    userCity?: string;
    userRegion?: string;
    userCountry?: string;
    view?: 'grid' | 'full';
  }) {
    const { perSection, userCity, userRegion, userCountry, view } = opts;

    // Build base filters per section
    const base: Pick<
      import('../products/dto/ProductFilterDto').ProductFilterDto,
      'perPage'
    > & {
      perPage: number;
    } = { perPage: perSection };

    const curatedNewTags = 'home-new,home_new,new_arrival,curated-new';
    const curatedBestTags = 'home-best,home_best,best_seller,curated-best';

    const combined = (await Promise.all([
      this.productsService.findFiltered({
        ...base,
        sort: 'sales_desc',
        view,
      }),
      this.productsService.findFiltered({
        ...base,
        sort: 'rating_desc',
        view,
      }),
      this.productsService.findFiltered({
        ...base,
        sort: 'rating_desc',
        geoPriority: true,
        userCity,
        userRegion,
        userCountry,
        view,
      }),
      // New arrivals: prefer most recent, lightly geo-prioritized
      this.productsService.findFiltered({
        ...base,
        sort: 'created_desc',
        geoPriority: true,
        userCity,
        userRegion,
        userCountry,
        view,
      }),
      // Curated by tags
      this.productsService.findFiltered({
        ...base,
        sort: 'created_desc',
        tags: curatedNewTags,
        view,
      }),
      this.productsService.findFiltered({
        ...base,
        sort: 'sales_desc',
        tags: curatedBestTags,
        view,
      }),
    ])) as unknown;
    const [
      bestSellers,
      topRated,
      geoAll,
      newArrivals,
      curatedNew,
      curatedBest,
    ] = combined as Array<{ items: unknown[] }>;

    return {
      bestSellers: bestSellers.items,
      topRated: topRated.items,
      geoAll: geoAll.items,
      newArrivals: newArrivals.items,
      curatedNew: curatedNew.items,
      curatedBest: curatedBest.items,
    };
  }

  /**
   * New single-source-of-truth for Home screen.
   * Fetches curated sections via CurationService, featured categories from config,
   * explore grid from ProductsService in one query, and featured vendors via VendorService.
   */
  async getV2HomeFeed(opts: {
    page?: number;
    perPage?: number;
    userCity?: string;
    userRegion?: string;
    userCountry?: string;
  }) {
    const page = Math.max(1, Number(opts.page) || 1);
    const perPage = Math.min(Math.max(Number(opts.perPage) || 20, 1), 50);

    // Collect non-fatal errors per section
    const errors: Array<{ section: string; message: string }> = [];

    // 1) Featured categories (reuse existing config helper)
    const configPromise = this.getHomeConfig().catch((e) => {
      errors.push({ section: 'featuredCategories', message: e?.message || 'config failed' });
      return { featuredCategories: [], eastAfricaCountries: [], defaultSorts: { homeAll: 'rating_desc', bestSellers: 'sales_desc', topRated: 'rating_desc' } } as any;
    });

    // 2) Curated sections (parallel via tags home-new/home-best)
    const curatedPromise = Promise.all([
      this.curation
        .getSection('home-new', { limit: 10, cursor: null, view: 'grid' })
        .catch((e) => {
          errors.push({ section: 'curatedNew', message: e?.message || 'curatedNew failed' });
          return { items: [] } as any;
        }),
      this.curation
        .getSection('home-best', { limit: 10, cursor: null, view: 'grid' })
        .catch((e) => {
          errors.push({ section: 'curatedBest', message: e?.message || 'curatedBest failed' });
          return { items: [] } as any;
        }),
    ]);

    // 3) Explore products: one main filtered query with geo priority
    const explorePromise = this.productsService
      .findFiltered({
        page,
        perPage,
        sort: 'rating_desc' as any,
        geoPriority: true,
        userCity: opts.userCity,
        userRegion: opts.userRegion,
        userCountry: opts.userCountry,
        view: 'grid',
      } as any)
      .catch((e) => {
        errors.push({ section: 'exploreProducts', message: e?.message || 'explore failed' });
        return { items: [], total: 0, currentPage: page } as any;
      });

    // 4) Featured vendors: leverage public listing with thresholds
    // Use raw SQL to completely avoid accidental enum casts (e.g., verificationStatus enum)
    const vendorsPromise = (async () => {
      const uc = (opts.userCountry || '').trim();
      const ur = (opts.userRegion || '').trim();
      const ci = (opts.userCity || '').trim();
      // Build ORDER BY geo-preference fragments conditionally
      const geoOrders: string[] = [];
      const params: any[] = [];
      let p = 1;
      // roles filter value as text[]
      const rolesParamIndex = p++;
      params.push(['VENDOR']);
      // booleans
      const isActiveIndex = p++;
      params.push(true);
      const verifiedIndex = p++;
      params.push(true);
      if (uc) {
        const idx = p++;
        geoOrders.push(`CASE WHEN UPPER(COALESCE("registrationCountry", '')) = UPPER($${idx}) THEN 1 ELSE 0 END DESC`);
        params.push(uc);
      }
      if (ur) {
        const idx = p++;
        geoOrders.push(`CASE WHEN LOWER(COALESCE("registrationRegion", '')) = LOWER($${idx}) THEN 1 ELSE 0 END DESC`);
        params.push(ur);
      }
      if (ci) {
        const idx = p++;
        geoOrders.push(`CASE WHEN LOWER(COALESCE("registrationCity", '')) = LOWER($${idx}) THEN 1 ELSE 0 END DESC`);
        params.push(ci);
      }

      const orderBy = [
        ...geoOrders,
        '"numberOfSales" DESC NULLS LAST',
        'rating DESC NULLS LAST',
      ].join(', ');

      const sql = `
        SELECT id,
               "displayName",
               "storeName",
               "vendorAvatarUrl",
               "avatarUrl",
               rating,
               "numberOfSales",
               "registrationCountry",
               "registrationRegion",
               "registrationCity"
        FROM "user"
        WHERE roles @> ($${rolesParamIndex})::text[]
          AND "isActive" = $${isActiveIndex}
          AND verified = $${verifiedIndex}
        ORDER BY ${orderBy}
        LIMIT 12
      `;

      try {
        const rows = (await this.userRepo.query(sql, params)) as Array<Pick<User,
          'id' | 'displayName' | 'storeName' | 'vendorAvatarUrl' | 'avatarUrl' | 'rating' | 'numberOfSales' | 'registrationCountry' | 'registrationRegion' | 'registrationCity'
        >>;
        return { items: rows as any[] };
      } catch (e: any) {
        errors.push({ section: 'featuredVendors', message: e?.message || 'vendors failed' });
        return { items: [] };
      }
    })();

    const [config, curated, explore, vendorList] = await Promise.all([
      configPromise,
      curatedPromise,
      explorePromise,
      vendorsPromise,
    ]);

    const [curatedNew, curatedBest] = curated;

    const payload: any = {
      featuredCategories: config.featuredCategories,
      curatedNew: {
        key: 'home-new',
        title: 'New Arrivals',
        items: (curatedNew.items || []).map((p: any) => toProductCard(p)),
        seeAllFilters: { tag: 'home-new' },
      },
      curatedBest: {
        key: 'home-best',
        title: 'Best Sellers',
        items: (curatedBest.items || []).map((p: any) => toProductCard(p)),
        seeAllFilters: { tag: 'home-best' },
      },
      featuredVendors: (vendorList.items || []).map((u: User) => ({
        id: u.id,
        displayName: u.displayName ?? null,
        storeName: u.storeName ?? null,
        avatarUrl: u.vendorAvatarUrl || u.avatarUrl || null,
        rating: u.rating ?? 0,
        numberOfSales: u.numberOfSales ?? 0,
        location: {
          country: u.registrationCountry ?? null,
          region: u.registrationRegion ?? null,
          city: u.registrationCity ?? null,
        },
      })),
      exploreProducts: {
        items: explore.items,
        total: explore.total,
        page: (explore as any).currentPage || page,
      },
    };

    if (errors.length) (payload.errors = errors);
    return payload;
  }

  async getHomeConfig(): Promise<{
    featuredCategories: Array<{
      id: number;
      name: string;
      slug: string;
      iconUrl: string | null;
      order: number | null;
    }>;
    eastAfricaCountries: string[];
    defaultSorts: { homeAll: string; bestSellers: string; topRated: string };
  }> {
    // Featured categories ordered; include minimal fields for client chips/cards
    const categories = await this.categoryRepo.find({
      where: {},
      // TypeORM typing quirk: cast to any for name order only

      order: { sortOrder: 'ASC', name: 'ASC' as const },
      take: 20,
    });
    return {
      featuredCategories: categories.map((c: Category) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        iconUrl: c.iconUrl,
        order: c.sortOrder,
      })),
      eastAfricaCountries: ['ET', 'SO', 'KE', 'DJ'],
      defaultSorts: {
        homeAll: 'rating_desc',
        bestSellers: 'sales_desc',
        topRated: 'rating_desc',
      },
    };
  }
}
