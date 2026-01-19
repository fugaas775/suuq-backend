import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Header,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CategoriesService } from '../categories/categories.service';
import { HomeService } from '../home/home.service';
import { UpdateProductDto } from './dto/update-product.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
// import { plainToInstance } from 'class-transformer';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { CreateProductDto } from './dto/create-product.dto';
import { UserRole } from '../auth/roles.enum';
import { ProductFilterDto } from './dto/ProductFilterDto';
import { TieredProductsDto } from './dto/tiered-products.dto';
import { UseInterceptors, ParseBoolPipe } from '@nestjs/common';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';
import { SkipThrottle } from '@nestjs/throttler';
import { RecordImpressionsDto } from './dto/record-impressions.dto';
import { normalizeProductMedia } from '../common/utils/media-url.util';
import { AuthenticatedRequest } from '../auth/auth.types';
import { FavoritesService } from '../favorites/favorites.service';
import { Response } from 'express';
import { createHash } from 'crypto';
import { toProductCard } from './utils/product-card.util';
import { Public } from '../common/decorators/public.decorator';

import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@UseInterceptors(ClassSerializerInterceptor)
@Controller('products')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(
    private readonly productsService: ProductsService,
    private readonly homeService: HomeService,
    private readonly favoritesService: FavoritesService,
    private readonly categoriesService: CategoriesService,
  ) {}

  // Public: return a short-lived signed attachment URL for free digital products
  @Get(':id/free-download')
  @Header('Cache-Control', 'private, no-store')
  async freeDownload(
    @Param('id', ParseIntPipe) id: number,
    @Query('ttl') ttl?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const ttlNum = Math.max(
      60,
      Math.min(parseInt(String(ttl || '600'), 10) || 600, 1800),
    );
    const actorId = (req?.user as any)?.id ?? null;
    return this.productsService.getFreeDownload(id, { ttl: ttlNum, actorId });
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR, UserRole.CUSTOMER, UserRole.GUEST)
  create(
    @Body() createProductDto: CreateProductDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (process.env.NODE_ENV !== 'production') {
      const bodyString = JSON.stringify(req.body ?? {});
      console.log('Raw request body:', bodyString);
      console.log('Parsed DTO:', JSON.stringify(createProductDto));
    }
    const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
    const isCustomerOrGuest =
      roles.includes(UserRole.CUSTOMER) || roles.includes(UserRole.GUEST);
    const enforcedStatus = isCustomerOrGuest
      ? 'pending_approval'
      : createProductDto.status;

    return this.productsService.create({
      ...createProductDto,
      status: enforcedStatus,
      vendorId: req.user.id,
    });
  }
  // Batched impressions for list views (idempotent per session/window)
  @Post('impressions')
  async recordImpressions(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RecordImpressionsDto,
  ) {
    // If authenticated vendor, ignore to prevent inflating their own stats
    const role = (req.user as any)?.role || req.user?.roles?.[0];
    if (role && String(role).toUpperCase().includes('VENDOR')) {
      return { recorded: 0, ignored: dto.productIds.length };
    }
    const ip = String(
      req.headers['x-real-ip'] ||
        req.headers['x-forwarded-for'] ||
        req.ip ||
        '',
    );
    const ua = String(req.headers['user-agent'] || '');
    const city = String(req.headers['x-user-city'] || '');
    const country = String(req.headers['x-user-country'] || '');

    const sessionId = dto.sessionId || '';
    const windowSeconds = Math.max(60, Number(dto.windowSeconds || 300));
    const sessionKey = this.productsService.deriveImpressionSessionKey(
      ip,
      ua,
      sessionId,
    );
    const { recorded, ignored } = await this.productsService.recordImpressions(
      dto.productIds,
      sessionKey,
      windowSeconds,
      { ip, country, city },
    );
    return { recorded, ignored, windowSeconds };
  }

  // --- UPDATED: This method now uses the ProductFilterDto ---
  @Get()
  @SkipThrottle()
  @UseInterceptors(
    new RateLimitInterceptor({
      maxRps: 10,
      burst: 20,
      keyBy: 'userOrIp',
      scope: 'route',
      headers: true,
    }),
    CacheInterceptor,
  )
  @CacheTTL(30) // 30s cache for primary listing
  async findAll(
    @Query() filters: ProductFilterDto,
    @Query('currency') currency?: string,
    @Req() req?: AuthenticatedRequest,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      // Normalize/guard against placeholder queries coming from image/camera search on mobile
      const rawSearch =
        typeof filters.search === 'string' ? filters.search.trim() : '';
      const isImageSearchPlaceholder =
        /^(search\s+by\s+image:|search\s+by\s+camera:|image\s+search:)/i.test(
          rawSearch,
        );
      if (isImageSearchPlaceholder) {
        // Drop placeholder to avoid meaningless text search and noisy analytics
        (filters as any).search = undefined as any;
        if (res) res.setHeader('X-Image-Search-Placeholder', '1');
      }

      // Smart Category Detection: If query matches a category name, switch to category mode
      if (
        !isImageSearchPlaceholder &&
        rawSearch.length >= 2 &&
        (!filters.categoryId || filters.categoryId.length === 0)
      ) {
        try {
          const matchedCategory =
            await this.categoriesService.findByName(rawSearch);
          if (matchedCategory) {
            // Found a match! Switch from text search to category filter
            (filters as any).search = undefined; // clear text search
            filters.categoryId = [matchedCategory.id];

            if (res) {
              res.setHeader(
                'X-Smart-Category-Detected',
                String(matchedCategory.id),
              );
              res.setHeader(
                'X-Smart-Category-Name',
                encodeURIComponent(matchedCategory.name),
              );
            }
          }
        } catch {
          // non-blocking
        }
      }

      // Role (if present)
      const role =
        (req?.user as { role?: string; roles?: string[] } | undefined)?.role ||
        req?.user?.roles?.[0];
      this.logger.log(
        `findAll filters: ${JSON.stringify(filters)}, currency: ${currency}, role: ${String(role || '')}`,
      );

      // Support both limit and perPage for pagination
      if (filters.limit && !filters.perPage) {
        filters.perPage = filters.limit;
      }

      // Map alias -> categoryId if categoryId not provided (DTO already normalizes to number[])
      if (
        !Array.isArray(filters.categoryId) ||
        filters.categoryId.length === 0
      ) {
        const anyFilters = filters as unknown as Record<string, unknown> & {
          categoryAlias?: number[];
        };
        const aliasArr = anyFilters.categoryAlias;
        if (Array.isArray(aliasArr) && aliasArr.length > 0) {
          filters.categoryId = aliasArr.filter(
            (n) => Number.isFinite(n) && (n as unknown as number) > 0,
          ) as unknown as any;
        }
      }

      // Derive user geo from headers if not explicitly provided
      const cityHeader = String(
        (req?.headers?.['x-user-city'] as string | undefined) ||
          (req?.headers?.['x-city'] as string | undefined) ||
          '',
      );
      const countryHeader = String(
        (req?.headers?.['x-user-country'] as string | undefined) ||
          (req?.headers?.['x-country'] as string | undefined) ||
          (req?.headers?.['cf-ipcountry'] as string | undefined) ||
          (req?.headers?.['x-vercel-ip-country'] as string | undefined) ||
          (req?.headers?.['x-country-code'] as string | undefined) ||
          '',
      );
      if (!filters.userCity && cityHeader)
        (filters as any).userCity = cityHeader;
      if (!filters.userCountry && countryHeader)
        (filters as any).userCountry = countryHeader;

      // Legacy default: when no explicit sort provided, use recency so freshly created items (like test seeds) appear
      if (!filters.sort) {
        (filters as any).sort = 'created_desc';
        // Do not force geoPriority globally here; keep behavior stable for legacy /products
      }
      // Make geo ranking the default for category browsing
      const hasCategoryContext =
        (Array.isArray(filters.categoryId) && filters.categoryId.length > 0) ||
        !!filters.categorySlug;
      if (hasCategoryContext) {
        if (typeof filters.geoPriority === 'undefined')
          (filters as any).geoPriority = true;
        // Prefer pulling the whole subtree and prioritizing it first, then top up
        if (typeof filters.includeDescendants === 'undefined')
          (filters as any).includeDescendants = true;
        if (typeof filters.categoryFirst === 'undefined')
          (filters as any).categoryFirst = true;
        if (typeof (filters as any).geoAppend === 'undefined')
          (filters as any).geoAppend = true;
        // Unless client chose a specific sort, default to best_match
        const s = (filters as any).sort;
        if (!s || s === '' || s === 'created_desc')
          (filters as any).sort = 'best_match';
        // Default East Africa scope
        if (!(filters as any).eastAfrica)
          (filters as any).eastAfrica = 'ET,SO,KE,DJ';
      }

      (filters as any).currency = currency;

      const result = await this.productsService.findFiltered(filters);

      // Derive vendorHits (distribution of vendors in the current result set)
      let vendorHits:
        | Array<{ name: string; id?: number; country?: string; count: number }>
        | undefined;
      try {
        const counts = new Map<
          string,
          { name: string; id?: number; country?: string; count: number }
        >();
        for (const it of result.items || []) {
          const vendor = (it as unknown as { vendor?: any }).vendor as
            | {
                id?: number;
                storeName?: string;
                displayName?: string;
                name?: string;
                registrationCountry?: string;
                country?: string;
              }
            | undefined;
          if (!vendor) continue;
          const vid = vendor.id;
          const vname = String(
            vendor.storeName || vendor.displayName || vendor.name || '',
          );
          const vcountry = String(
            vendor.registrationCountry || vendor.country || '',
          ).toUpperCase();
          const key = `${vid || ''}|${vname}`;
          if (!counts.has(key))
            counts.set(key, {
              name: vname,
              id: vid,
              country: vcountry || undefined,
              count: 0,
            });
          const cur = counts.get(key);
          if (cur) cur.count += 1;
        }
        vendorHits = Array.from(counts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 50);
      } catch {
        vendorHits = undefined;
      }

      // Record submitted searches (typed then submitted)
      if (
        !isImageSearchPlaceholder &&
        filters.search &&
        typeof filters.search === 'string'
      ) {
        const ip = String(
          (req?.headers?.['x-real-ip'] as string | undefined) ||
            (req?.headers?.['x-forwarded-for'] as string | undefined) ||
            req?.ip ||
            '',
        );
        const ua = String(req?.headers?.['user-agent'] || '');
        let vendorName = String(
          (
            req?.user as
              | { storeName?: string; displayName?: string; name?: string }
              | undefined
          )?.storeName ||
            req?.user?.displayName ||
            (req?.user as { name?: string } | undefined)?.name ||
            '',
        );
        // If the request is filtering for a vendor, derive a display name even if the request is anonymous
        const vendorIdFilter =
          (filters as unknown as any).vendorId ||
          (filters as unknown as any).vendor_id;
        if (!vendorName && vendorIdFilter) {
          const vn = await this.productsService.getVendorDisplayName(
            Number(vendorIdFilter),
          );
          vendorName = vn || '';
        }
        const cityHeader = String(
          (req?.headers?.['x-user-city'] as string | undefined) ||
            (req?.headers?.['x-city'] as string | undefined) ||
            '',
        );
        const countryHeader = String(
          (req?.headers?.['x-user-country'] as string | undefined) ||
            (req?.headers?.['x-country'] as string | undefined) ||
            (req?.headers?.['cf-ipcountry'] as string | undefined) ||
            (req?.headers?.['x-vercel-ip-country'] as string | undefined) ||
            (req?.headers?.['x-country-code'] as string | undefined) ||
            '',
        );
        // Accept-Language fallback: e.g., en-US -> US
        let alCountry = '';
        const al1 = String(req?.headers?.['accept-language'] || '');
        if (al1) {
          const m = String(al1).match(/^[a-z]{2,3}-([A-Z]{2})/);
          if (m && m[1]) alCountry = m[1];
        }
        // Authenticated user country fallback
        const userCountry = String(
          (
            req?.user as
              | { registrationCountry?: string; country?: string }
              | undefined
          )?.registrationCountry ||
            (
              req?.user as
                | { registrationCountry?: string; country?: string }
                | undefined
            )?.country ||
            '',
        );
        const city =
          ((filters as unknown as Record<string, unknown>).user_city as
            | string
            | undefined) ||
          ((filters as unknown as Record<string, unknown>).userCity as
            | string
            | undefined) ||
          ((filters as unknown as Record<string, unknown>).city as
            | string
            | undefined) ||
          cityHeader ||
          '';
        const country = (
          ((filters as unknown as Record<string, unknown>).user_country as
            | string
            | undefined) ||
          ((filters as unknown as Record<string, unknown>).userCountry as
            | string
            | undefined) ||
          ((filters as unknown as Record<string, unknown>).country as
            | string
            | undefined) ||
          countryHeader ||
          userCountry ||
          alCountry ||
          ''
        ).toString();
        this.productsService
          .recordSearchKeyword(filters.search, 'submit', {
            results: Array.isArray(result.items)
              ? result.items.length
              : undefined,
            ip,
            ua,
            vendorName: vendorName || undefined,
            city: city || undefined,
            country: country || undefined,
            vendorHits,
          })
          .catch(() => {});
      }

      if (!result || !Array.isArray(result.items)) {
        this.logger.error('findAll: result or result.items missing', result);
        throw new BadRequestException('Product list could not be loaded');
      }

      // If client provided ETag, compare and return 304 when unchanged
      try {
        const ids = Array.isArray(result.items)
          ? result.items.map((it: any) => it?.id || 0)
          : [];
        const ts = Array.isArray(result.items)
          ? result.items.map((it: any) =>
              it?.updatedAt
                ? new Date(it.updatedAt).getTime()
                : it?.createdAt
                  ? new Date(it.createdAt).getTime()
                  : 0,
            )
          : [];
        const base = JSON.stringify({ f: { ...filters, currency }, ids, ts });
        const etag = `W/"${createHash('sha1').update(base).digest('hex')}"`;
        if (res) {
          res.setHeader('ETag', etag);
          res.setHeader(
            'Cache-Control',
            'public, max-age=10, stale-while-revalidate=30',
          );
          if (filters.view === 'grid') res.setHeader('X-Items-View', 'grid');
          const inm = req?.headers?.['if-none-match'] || '';
          if (inm && inm === etag) {
            res.status(304);
            return;
          }
        }
      } catch (err) {
        this.logger.debug(
          'Failed to compute ETag for product listing',
          err as Error,
        );
      }

      // No manual conversion or DTO mapping; return result.items directly
      return {
        ...result,
        items: (result.items || []).map(normalizeProductMedia),
      };
    } catch (err) {
      this.logger.error('findAll error:', err);
      throw err;
    }
  }

  // Lightweight cards endpoint mirroring filters but returning ProductCard DTOs
  @Get('cards')
  @SkipThrottle()
  @UseInterceptors(
    new RateLimitInterceptor({
      maxRps: 10,
      burst: 20,
      keyBy: 'userOrIp',
      scope: 'route',
      headers: true,
    }),
    CacheInterceptor,
  )
  @CacheTTL(45) // 45s cache for cards
  async listCards(
    @Query() filters: ProductFilterDto,
    @Req() req?: AuthenticatedRequest,
    @Res({ passthrough: true }) res?: Response,
  ) {
    // Force grid view for lean projection
    (filters as any).view = 'grid';
    if (filters.limit && !filters.perPage) filters.perPage = filters.limit;
    // Normalize aliases to categoryId if needed (DTO already does most)
    if (!Array.isArray(filters.categoryId) || filters.categoryId.length === 0) {
      const aliasArr =
        (filters as any).categoryAlias || (filters as any).categoriesCsv;
      if (Array.isArray(aliasArr) && aliasArr.length > 0) {
        (filters as any).categoryId = aliasArr as any;
      }
    }

    // Global default Best Match when sort not provided
    if (!(filters as any).sort) {
      (filters as any).sort = 'best_match';
      if (typeof (filters as any).geoPriority === 'undefined')
        (filters as any).geoPriority = true;
      if ((filters as any).geoPriority && !(filters as any).eastAfrica)
        (filters as any).eastAfrica = 'ET,SO,KE,DJ';
    }

    const result = await this.productsService.findFiltered(filters);
    const items = (result.items || []).map(toProductCard);

    // Compute and set ETag/Cache-Control and honor If-None-Match
    try {
      const base = JSON.stringify({
        f: { ...filters },
        ids: items.map((i) => i.id),
        ts: items.map((i) => i.createdAt),
      });
      const etag = `W/"${createHash('sha1').update(base).digest('hex')}"`;
      if (res) {
        res.setHeader('ETag', etag);
        res.setHeader(
          'Cache-Control',
          'public, max-age=15, stale-while-revalidate=60',
        );
        res.setHeader('X-Items-View', 'grid-cards');
        const inm = req?.headers?.['if-none-match'] || '';
        if (inm && inm === etag) {
          res.status(304);
          return;
        }
      }
    } catch (err) {
      this.logger.debug(
        'Failed to compute ETag for product cards',
        err as Error,
      );
    }

    return {
      items,
      total: result.total,
      perPage: result.perPage,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
    };
  }

  @Get('suggest')
  @Header('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  async suggest(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    const lim = Math.min(Math.max(Number(limit) || 8, 1), 10);
    // Fire-and-forget capture of suggest keyword
    const ip = (
      req?.headers?.['x-real-ip'] ||
      req?.headers?.['x-forwarded-for'] ||
      req?.ip ||
      ''
    ).toString();
    const ua = (req?.headers?.['user-agent'] || '').toString();
    const cityHeader = (
      req?.headers?.['x-user-city'] ||
      req?.headers?.['x-city'] ||
      ''
    ).toString();
    const countryHeader = (
      req?.headers?.['x-user-country'] ||
      req?.headers?.['x-country'] ||
      req?.headers?.['cf-ipcountry'] ||
      req?.headers?.['x-vercel-ip-country'] ||
      req?.headers?.['x-country-code'] ||
      ''
    ).toString();
    let alCountry = '';
    const al = (req?.headers?.['accept-language'] || '').toString();
    if (al) {
      const m = String(al).match(/^[a-z]{2,3}-([A-Z]{2})/);
      if (m && m[1]) alCountry = m[1];
    }
    const city = (
      req?.query?.user_city ||
      req?.query?.userCity ||
      req?.query?.city ||
      cityHeader ||
      ''
    ).toString();
    const country = (
      req?.query?.user_country ||
      req?.query?.userCountry ||
      req?.query?.country ||
      countryHeader ||
      alCountry ||
      ''
    ).toString();
    this.productsService
      .recordSearchKeyword(q, 'suggest', {
        ip,
        ua,
        city: city || undefined,
        country: country || undefined,
      })
      .catch(() => {});
    return this.productsService.suggestNames(q, lim);
  }

  // Aggregated home feed: avoid collision with ':id' by defining here
  @Get('home')
  @UseGuards(OptionalJwtAuthGuard)
  @Header('Cache-Control', 'public, max-age=60')
  @Header('Deprecation', 'true')
  @Header('Sunset', 'Wed, 31 Dec 2025 23:59:59 GMT')
  async homeFeed(
    @Query() q: any,
    @Req() req: Request & { user?: any },
    @Res({ passthrough: true }) res: Response,
  ) {
    const perSection = Math.min(Number(q.limit || q.per_page) || 10, 20);
    const v =
      typeof q.view === 'string' && (q.view === 'grid' || q.view === 'full')
        ? (q.view as 'grid' | 'full')
        : 'grid';
    const city = q.user_city || q.userCity || q.city;
    const region = q.user_region || q.userRegion || q.region;
    const country = q.user_country || q.userCountry || q.country;
    
    // Extract User ID if available via Optional Auth
    const userId = req.user?.id ? Number(req.user.id) : undefined;

    const data = await this.homeService.getHomeFeed({
      perSection,
      userCity: city,
      userRegion: region,
      userCountry: country,
      view: v,
      userId,
    });

    // Compute and set a lightweight ETag based on list IDs + timestamps
    try {
      const dig = (arr: any[] | undefined) =>
        Array.isArray(arr)
          ? arr.map(
              (it) =>
                `${it?.id || ''}:${new Date(it?.updatedAt || it?.createdAt || 0).getTime()}`,
            )
          : [];
      const base = JSON.stringify({
        k: 'home',
        v,
        perSection,
        geo: { city: city || '', region: region || '', country: country || '' },
        best: dig((data as any).bestSellers),
        top: dig((data as any).topRated),
        geoAll: dig((data as any).geoAll),
        newArrivals: dig((data as any).newArrivals),
        curatedNew: dig((data as any).curatedNew),
        curatedBest: dig((data as any).curatedBest),
      });
      const etag = `W/"${createHash('sha1').update(base).digest('hex')}"`;
      res.setHeader('ETag', etag);
      const inm = (req.headers['if-none-match'] as string | undefined) || '';
      if (inm && inm === etag) {
        res.status(304);
        return;
      }
    } catch (err) {
      this.logger.debug('Failed to compute ETag for home feed', err as Error);
    }

    // Build aliases to help flexible clients
    const payload = {
      // canonical keys
      bestSellers: data.bestSellers,
      topRated: data.topRated,
      geoAll: data.geoAll,
      newArrivals: (data as any).newArrivals ?? [],
      curatedNew: (data as any).curatedNew ?? [],
      curatedBest: (data as any).curatedBest ?? [],
      // common aliases
      best_sellers: data.bestSellers,
      bestsellers: data.bestSellers,
      top_sales: data.bestSellers,
      top_rated: data.topRated,
      ratingTop: data.topRated,
      top: data.topRated,
      new_arrivals: (data as any).newArrivals ?? [],
      latest: (data as any).newArrivals ?? [],
      recent: (data as any).newArrivals ?? [],
      homeNew: (data as any).curatedNew ?? (data as any).newArrivals ?? [],
      homeBest: (data as any).curatedBest ?? data.bestSellers,
      // meta for debugging/analytics
      meta: {
        perSection,
        view: v,
        geo: {
          city: city || null,
          region: region || null,
          country: country || null,
        },
        seeAll: {
          newArrivals:
            ((data as any).curatedNew?.length ?? 0) > 0
              ? { tag: 'home-new', kind: 'curated' }
              : { tag: 'home-new' },
          bestSellers:
            ((data as any).curatedBest?.length ?? 0) > 0
              ? { tag: 'home-best', kind: 'curated' }
              : { sort: 'sales_desc' },
          // aliases expected by some clients
          curatedNew:
            ((data as any).curatedNew?.length ?? 0) > 0
              ? { tag: 'home-new', kind: 'curated' }
              : { tag: 'home-new' },
          homeNew:
            ((data as any).curatedNew?.length ?? 0) > 0
              ? { tag: 'home-new', kind: 'curated' }
              : { tag: 'home-new' },
          curatedBest:
            ((data as any).curatedBest?.length ?? 0) > 0
              ? { tag: 'home-best', kind: 'curated' }
              : { sort: 'sales_desc' },
          homeBest:
            ((data as any).curatedBest?.length ?? 0) > 0
              ? { tag: 'home-best', kind: 'curated' }
              : { sort: 'sales_desc' },
        },
      },
    } as any;

    // Also provide common envelopes expected by some clients
    return { data: payload, result: payload, payload };
  }

  // East Africa batch: returns items grouped by country codes in one call
  @Get('east-africa')
  async eastAfricaBatch(
    @Query() q: any,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
    @Query('currency') currency?: string,
  ) {
    const countries = String(q.countries || 'ET,SO,KE,DJ')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const per = Math.min(Number(q.per_country || q.per || q.limit) || 10, 30);
    const sort = typeof q.sort === 'string' ? q.sort : 'rating_desc';
    const view =
      typeof q.view === 'string' && (q.view === 'grid' || q.view === 'full')
        ? (q.view as 'grid' | 'full')
        : 'grid';

    const results = await Promise.all(
      countries.map((code) =>
        this.productsService
          .findFiltered({
            perPage: per,
            sort,
            country: code,
            view,
            currency,
          } as any)
          .then((res) => ({ code, items: res.items })),
      ),
    );
    // ETag for the grouped response
    try {
      const base = JSON.stringify({
        k: 'ea-batch',
        countries,
        per,
        sort,
        view,
        currency: currency || null,
        ids: results.flatMap((r) =>
          (r.items || []).map(
            (i: any) => `${r.code}:${i.id}:${i.updatedAt || i.createdAt || ''}`,
          ),
        ),
      });
      const etag = `W/"${createHash('sha1').update(base).digest('hex')}"`;
      res.setHeader('ETag', etag);
      const inm = (req.headers['if-none-match'] as string | undefined) || '';
      if (inm && inm === etag) {
        res.status(304);
        return;
      }
    } catch (err) {
      this.logger.debug(
        'Failed to compute ETag for east-africa batch',
        err as Error,
      );
    }
    return { countries: results };
  }

  // Tiered buckets for client-side merge/scoring (base -> siblings -> parent -> global)
  // Example: GET /products/tiers?categoryId=12&per_page=12&geo_priority=1&geo_append=1&userCountry=ET&userRegion=AA&userCity=Addis
  @Get('tiers')
  @Header('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30')
  async tiered(
    @Query() q: TieredProductsDto,
    @Query('currency') currency?: string,
  ) {
    (q as any).currency = currency;
    // If merge flag is on, return a single merged list using server-side scoring
    if ((q as any).merge) {
      const { items, meta } = await this.productsService.findTieredMerged(q);
      return { items: (items || []).map(normalizeProductMedia), meta } as any;
    }
    const { base, siblings, parent, global, meta } =
      await this.productsService.findTieredBuckets(q);
    // Normalize media for lean payloads
    const norm = (arr: any[]) => (arr || []).map(normalizeProductMedia);
    return {
      base: norm(base),
      siblings: Object.fromEntries(
        Object.entries(siblings || {}).map(([k, v]) => [k, norm(v as any)]),
      ),
      parent: norm(parent),
      global: norm(global),
      meta,
    } as any;
  }

  @Get('/tags/suggest')
  suggestTags(@Query('q') q: string) {
    // TODO: Replace with actual tag suggestion service if available
    return this.productsService.suggestNames(q);
  }

  // Personalized recommendations for the current user (place before ':id')
  @UseGuards(AuthGuard('jwt'))
  @Get('recommended')
  async recommended(
    @Req() req: any,
    @Query('page') page = 1,
    @Query('per_page') perPage = 20,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('Unauthorized');
    return this.productsService.recommendedForUser(
      Number(userId),
      Number(page) || 1,
      Number(perPage) || 20,
    );
  }

  // Likes count endpoint(s) for compatibility with mobile client
  // Bulk likes: GET /products/likes?ids=1,2,3
  // Place BEFORE the parameterized route to avoid shadowing
  @Get('likes')
  @Header('Cache-Control', 'public, max-age=10')
  async getLikesCountBulk(@Query('ids') ids: string) {
    const parts = String(ids || '')
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
      throw new BadRequestException(
        'ids must be a comma-separated list of positive integers',
      );
    }
    const map = await this.favoritesService.countLikesBulk(list);
    return map;
  }

  @Get(':id/likes')
  @Header('Cache-Control', 'public, max-age=15')
  async getLikesCount(@Param('id', ParseIntPipe) id: number) {
    const likes = await this.favoritesService.countLikes(id);
    return { likes };
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('currency') currency?: string,
  ) {
    return this.productsService.findOne(id, currency);
  }

  // Experimental: Contextual feed with Focus, Ads, and Related products
  @Public()
  @Get(':id/contextual-feed')
  @Header('Cache-Control', 'public, max-age=15')
  async getContextualFeed(
    @Param('id', ParseIntPipe) id: number,
    @Query('currency') currency?: string,
  ) {
    return this.productsService.getContextualFeed(id, currency);
  }

  // Related products for a given product id
  // Accepts optional city filter and limit; returns a lean list suitable for grid cards
  @Get(':id/related')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  async related(
    @Param('id', ParseIntPipe) id: number,
    @Query('city') city?: string,
    @Query('limit') limit?: string,
    @Query('currency') currency?: string,
    @Req() req?: AuthenticatedRequest,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const lim = Math.min(
      Math.max(parseInt(String(limit || '24'), 10) || 24, 1),
      50,
    );
    const items = await this.productsService.findRelatedProducts(id, {
      limit: lim,
      city,
      currency,
    });

    // ETag based on ids + createdAt timestamps to enable client-side caching
    try {
      const base = JSON.stringify({
        k: 'related',
        id,
        city: city || '',
        ids: items.map((i: any) => i.id),
        ts: items.map((i: any) => i.createdAt || i.updatedAt),
      });
      const etag = `W/"${createHash('sha1').update(base).digest('hex')}"`;
      if (res && req) {
        res.setHeader('ETag', etag);
        const inm = req.headers?.['if-none-match'] || '';
        if (inm && inm === etag) {
          res.status(304);
          return;
        }
      }
    } catch (err) {
      this.logger.debug(
        'Failed to compute ETag for related products',
        err as Error,
      );
    }

    return { items };
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR)
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
    @Req() req: any,
  ) {
    return this.productsService.updateProduct(id, updateProductDto, req.user);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  deleteProduct(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.productsService.deleteProduct(id, req.user);
  }

  @Patch(':id/block')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) // Allow Super Admin
  async toggleBlockProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body('isBlocked', ParseBoolPipe) isBlocked: boolean, // Use correct pipe
  ) {
    return this.productsService.toggleBlockStatus(id, isBlocked);
  }

  @Patch(':id/feature')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) // Allow Super Admin
  async toggleFeatureProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body('featured', ParseBoolPipe) featured: boolean, // Use correct pipe
  ) {
    return this.productsService.toggleFeatureStatus(id, featured);
  }
}
