import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ProductsService } from './products.service';
import { ProductFilterDto } from './dto/ProductFilterDto';
import { toProductCard } from './utils/product-card.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { FavoritesService } from '../favorites/favorites.service';
import { ReviewsService } from '../reviews/reviews.service';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ProductListingService } from './listing/product-listing.service';
import { ProductListingDto } from './listing/dto/product-listing.dto';

@ApiTags('v1/products')
// Limit bursts on the hot listing endpoint. Roughly 10 rps with burst 20 per subject per route.
@UseInterceptors(new RateLimitInterceptor({ maxRps: 10, burst: 20, keyBy: 'userOrIp', scope: 'route', headers: true }))
@SkipThrottle()
@Controller('v1/products')
export class ProductsV1Controller {
  constructor(
    private readonly productsService: ProductsService,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    private readonly favoritesService: FavoritesService,
    private readonly reviewsService: ReviewsService,
    private readonly listingService: ProductListingService,
  ) {}

  // Lightweight per-process cache for the hot listing endpoint
  // Keyed by a normalized serialization of the query filters
  private static readonly LIST_TTL_MS = 60_000; // 60s
  private static readonly LIST_CACHE_MAX = 200; // cap entries
  private static readonly LIST_CACHE: Map<string, { data: any; lastModified?: string; expiresAt: number }> =
    new Map();

  private makeCacheKey(filters: ProductFilterDto): string {
    // Always include view=grid because we force it below
    const entries: Array<[string, unknown]> = Object.entries(filters || {}) as any;
    entries.push(['view', 'grid']);
    const pairs: string[] = [];
    for (const [k, v] of entries) {
      if (v === undefined || v === null || v === '') continue;
      let val: string;
      if (Array.isArray(v)) val = v.map((x) => String(x)).sort().join(',');
      else if (typeof v === 'object') val = JSON.stringify(v);
      else val = String(v);
      pairs.push(`${k}=${val}`);
    }
    pairs.sort();
    return pairs.join('&');
  }

  // Lean product cards list
  @Get()
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  @ApiOkResponse({ description: 'Lean product cards list with pagination.' })
  async list(
    @Query() filters: ProductFilterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const now = Date.now();
    // Guard against mobile image/camera search placeholders like "Search by image: <filename>"
    const rawSearch = typeof (filters as any).search === 'string' ? String((filters as any).search).trim() : '';
    const isImageSearchPlaceholder = /^(search\s+by\s+image:|search\s+by\s+camera:|image\s+search:)/i.test(rawSearch);
    if (isImageSearchPlaceholder) {
      // Drop placeholder to avoid meaningless text search and improve relevance; signal via header for observability
      (filters as any).search = undefined as any;
      res.setHeader('X-Image-Search-Placeholder', '1');
    }
    // Normalize category filters for stable behavior and cache keys:
    // Accept category, categories, or categoryId from DTO; coalesce into categoryId only
    const norm: ProductFilterDto = { ...(filters as any) } as any;
    const ids: number[] = [];
    if (Array.isArray((filters as any).categoryId)) ids.push(...((filters as any).categoryId as number[]));
    if (Array.isArray((filters as any).categoryAlias)) ids.push(...((filters as any).categoryAlias as number[]));
    if (Array.isArray((filters as any).categoriesCsv)) ids.push(...((filters as any).categoriesCsv as number[]));
    const uniqIds = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n >= 1)));
    if (uniqIds.length) {
      (norm as any).categoryId = uniqIds;
      delete (norm as any).categoryAlias;
      delete (norm as any).categoriesCsv;
    }
    // Force lean grid projection
    (norm as any).view = 'grid';

  const cacheKey = this.makeCacheKey(norm as any);
    const cached = ProductsV1Controller.LIST_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      if (cached.lastModified) res.setHeader('Last-Modified', cached.lastModified);
      return cached.data;
    }

    let result: any;
    const useV2 = String(process.env.LISTING_ENGINE_V2 || '').toLowerCase() === '1';
    if (useV2 && (norm as any).view === 'grid') {
      const dto: ProductListingDto = (norm as unknown) as ProductListingDto;
      result = await this.listingService.list(dto, { mapCards: true });
      // Adapt result shape to legacy naming
      result = {
        items: result.items,
        total: result.total,
        perPage: result.perPage,
        currentPage: result.page,
        totalPages: result.totalPages,
        ...(dto.debugListing ? { debug: result.debug } : {}),
      };
    } else {
      result = await this.productsService.findFiltered(norm as any);
    }

    const items = useV2 && (norm as any).view === 'grid' ? (result.items || []) : (result.items || []).map(toProductCard);
    // Last-Modified derived from newest createdAt among items
    const latest = items
      .map((i) => new Date(i.createdAt).getTime())
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)[0];
    const lastModified = latest ? new Date(latest).toUTCString() : undefined;
    if (lastModified) res.setHeader('Last-Modified', lastModified);

    // If debug requested, emit a few lightweight headers for QA
    if ((norm as any).debug_listing === '1' || (norm as any).debugListing === '1' || (norm as any).debugListing === true) {
      try {
        const dbg = (result as any)?.debug?.meta || {};
        if (typeof dbg.usedOthers !== 'undefined') res.setHeader('X-Listing-Used-Others', String(dbg.usedOthers));
        if (typeof dbg.geoFilled !== 'undefined') res.setHeader('X-Listing-Geo-Filled', String(dbg.geoFilled));
        if (typeof dbg.fallbackToParent !== 'undefined') res.setHeader('X-Listing-Fallback-Parent', String(dbg.fallbackToParent));
      } catch {}
    }

    // Return a plain object so Nest interceptors (serializer, ETag) can operate
    // while still allowing us to set headers via passthrough response.
    const payload = {
      items,
      total: result.total,
      perPage: result.perPage,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      ...(result.debug ? { debug: result.debug } : {}),
    };

    // Cache the response for a short window to absorb bursts
    // Simple size cap eviction (approx. LRU by reinserting on set)
    if (ProductsV1Controller.LIST_CACHE.size >= ProductsV1Controller.LIST_CACHE_MAX) {
      const firstKey = ProductsV1Controller.LIST_CACHE.keys().next().value as string | undefined;
      if (firstKey) ProductsV1Controller.LIST_CACHE.delete(firstKey);
    }
    ProductsV1Controller.LIST_CACHE.set(cacheKey, {
      data: payload,
      lastModified,
      expiresAt: now + ProductsV1Controller.LIST_TTL_MS,
    });

    return payload;
  }

  // Grouped by categories: ?categories=1,2,slug-three&per=8&include_descendants=true
  @Get('category-groups')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  @ApiQuery({ name: 'categories', required: true, description: 'Comma-separated ids or slugs' })
  @ApiQuery({ name: 'per', required: false })
  @ApiQuery({ name: 'include_descendants', required: false })
  @ApiQuery({ name: 'dedupe', required: false, description: 'If true, avoid duplicates across groups' })
  async categoryGroups(
    @Query('categories') categories: string,
    @Query('per') per?: string,
    @Query('include_descendants') includeDescendants?: string,
    @Query('dedupe') dedupe?: string,
  ) {
    const parts = String(categories || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const perPage = Math.min(Math.max(parseInt(String(per || '8'), 10) || 8, 1), 30);
    const include = String(includeDescendants || 'true').toLowerCase() !== 'false';
    const doDedupe = String(dedupe || 'false').toLowerCase() === 'true';

    const resolved: Array<{ key: string; id?: number; slug?: string }> = [];
    for (const token of parts) {
      const id = Number(token);
      if (Number.isInteger(id)) {
        resolved.push({ key: String(id), id });
      } else {
        const cat = await this.categoryRepo.findOne({ where: { slug: token } });
        if (cat) resolved.push({ key: token, id: cat.id, slug: token });
      }
    }

    const seen = new Set<number>();
    const groups = [] as Array<{ key: string; items: ReturnType<typeof toProductCard>[] }>; // id or slug as key
    for (const r of resolved) {
      const result = await this.productsService.findFiltered({
        perPage,
        view: 'grid',
        includeDescendants: include,
        categoryId: r.id ? [r.id] : undefined,
        categorySlug: r.slug,
        sort: 'rating_desc',
      } as any);
      let items = result.items.map(toProductCard);
      if (doDedupe) {
        items = items.filter((it) => {
          if (seen.has(it.id)) return false;
          seen.add(it.id);
          return true;
        });
      }
      groups.push({ key: r.key, items });
    }

    return { groups };
  }

  // Batch likes for product ids: GET /v1/products/likes?ids=1,2,3
  @Get('likes')
  @Header('Cache-Control', 'public, s-maxage=15')
  async likes(@Query('ids') idsParam: string) {
    const parts = String(idsParam || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const list = Array.from(
      new Set(
        parts
          .map((s) => Number(s))
          .filter((n) => Number.isInteger(n) && n >= 1),
      ),
    );
    if (!list.length) {
      throw new BadRequestException('ids must be a comma-separated list of positive integers');
    }
    return this.favoritesService.countLikesBulk(list);
  }

  // Batch review summary: GET /v1/products/reviews/summary?ids=1,2
  @Get('reviews/summary')
  @Header('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  async reviewSummary(@Query('ids') idsParam: string) {
    const list = String(idsParam || '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    if (!list.length) return {};
    return this.reviewsService.summaryBulk(list);
  }
}
