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
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { HomeService } from '../home/home.service';
import { UpdateProductDto } from './dto/update-product.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { plainToInstance } from 'class-transformer';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UserRole } from '../auth/roles.enum';
import { ProductFilterDto } from './dto/ProductFilterDto';
import { UseInterceptors, ParseBoolPipe } from '@nestjs/common';
import { RecordImpressionsDto } from './dto/record-impressions.dto';
import { normalizeProductMedia } from '../common/utils/media-url.util';

@UseInterceptors(ClassSerializerInterceptor)
@Controller('products')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(
    private readonly productsService: ProductsService,
    private readonly homeService: HomeService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR)
  create(@Body() createProductDto: CreateProductDto, @Req() req: any) {
    console.log('Raw request body:', JSON.stringify(req.body));
    console.log('Parsed DTO:', JSON.stringify(createProductDto));
    return this.productsService.create({
      ...createProductDto,
      vendorId: req.user.id,
    });
  }
  // Batched impressions for list views (idempotent per session/window)
  @Post('impressions')
  async recordImpressions(@Req() req: any, @Body() dto: RecordImpressionsDto) {
    // If authenticated vendor, ignore to prevent inflating their own stats
    const role = req.user?.role || req.user?.roles?.[0];
    if (role && String(role).toUpperCase().includes('VENDOR')) {
      return { recorded: 0, ignored: dto.productIds.length };
    }
    const ip = (req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip || '').toString();
    const ua = (req.headers['user-agent'] || '').toString();
    const sessionId = dto.sessionId || '';
    const windowSeconds = Math.max(60, Number(dto.windowSeconds || 300));
    const sessionKey = await this.productsService.deriveImpressionSessionKey(ip, ua, sessionId);
    const { recorded, ignored } = await this.productsService.recordImpressions(dto.productIds, sessionKey, windowSeconds);
    return { recorded, ignored, windowSeconds };
  }

  // --- UPDATED: This method now uses the ProductFilterDto ---
  @Get()
  async findAll(@Query() filters: ProductFilterDto, @Query('currency') currency?: string, @Req() req?: any) {
    try {
      this.logger.debug(`findAll filters: ${JSON.stringify(filters)}, currency: ${currency}`);

      // Support both limit and perPage for pagination
      if (filters.limit && !filters.perPage) {
        filters.perPage = filters.limit;
      }

      // Map category alias to categoryId for frontend query param compatibility
      if (!filters.categoryId && (filters as any).categoryAlias) {
        filters.categoryId = (filters as any).categoryAlias as any;
      }

      const result = await this.productsService.findFiltered(filters);

      // Derive vendorHits (distribution of vendors in the current result set)
      let vendorHits: Array<{ name: string; id?: number; country?: string; count: number }> | undefined;
      try {
        const counts = new Map<string, { name: string; id?: number; country?: string; count: number }>();
        for (const it of result.items || []) {
          const vendor: any = (it as any).vendor;
          if (!vendor) continue;
          const vid = vendor.id as number | undefined;
          const vname = (vendor.storeName || vendor.displayName || vendor.name || '').toString();
          const vcountry = (vendor.registrationCountry || vendor.country || '').toString().toUpperCase();
          const key = `${vid || ''}|${vname}`;
          if (!counts.has(key)) counts.set(key, { name: vname, id: vid, country: vcountry || undefined, count: 0 });
          counts.get(key)!.count += 1;
        }
        vendorHits = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 50);
      } catch {
        vendorHits = undefined;
      }

      // Record submitted searches (typed then submitted)
      if (filters.search && typeof filters.search === 'string') {
        const ip = (req?.headers?.['x-real-ip'] || req?.headers?.['x-forwarded-for'] || req?.ip || '').toString();
        const ua = (req?.headers?.['user-agent'] || '').toString();
        let vendorName = (req?.user?.storeName || req?.user?.displayName || req?.user?.name || '').toString();
        // If the request is filtering for a vendor, derive a display name even if the request is anonymous
        const vendorIdFilter = (filters as any).vendorId || (filters as any).vendor_id;
        if (!vendorName && vendorIdFilter) {
          const vn = await this.productsService.getVendorDisplayName(Number(vendorIdFilter));
          vendorName = vn || '';
        }
        const cityHeader = (req?.headers?.['x-user-city'] || req?.headers?.['x-city'] || '').toString();
        const countryHeader = (req?.headers?.['x-user-country'] || req?.headers?.['x-country'] || req?.headers?.['cf-ipcountry'] || req?.headers?.['x-vercel-ip-country'] || req?.headers?.['x-country-code'] || '').toString();
        // Accept-Language fallback: e.g., en-US -> US
        let alCountry = '';
        const al = (req?.headers?.['accept-language'] || '').toString();
        if (al) {
          const m = String(al).match(/^[a-z]{2,3}-([A-Z]{2})/);
          if (m && m[1]) alCountry = m[1];
        }
        // Authenticated user country fallback
        const userCountry = (req?.user?.registrationCountry || req?.user?.country || '').toString();
        const city = (filters as any).userCity || (filters as any).city || cityHeader || '';
        const country = ((filters as any).userCountry || (filters as any).country || countryHeader || userCountry || alCountry || '').toString();
        this.productsService
          .recordSearchKeyword(
            filters.search,
            'submit',
            {
              results: Array.isArray(result.items) ? result.items.length : undefined,
              ip,
              ua,
              vendorName: vendorName || undefined,
              city: city || undefined,
      country: country || undefined,
              vendorHits,
            },
          )
          .catch(() => {});
      }

      if (!result || !Array.isArray(result.items)) {
        this.logger.error('findAll: result or result.items missing', result);
        throw new BadRequestException('Product list could not be loaded');
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

  @Get('suggest')
  @Header('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  async suggest(@Query('q') q: string, @Query('limit') limit?: string, @Req() req?: any) {
    const lim = Math.min(Math.max(Number(limit) || 8, 1), 10);
  // Fire-and-forget capture of suggest keyword
  const ip = (req?.headers?.['x-real-ip'] || req?.headers?.['x-forwarded-for'] || req?.ip || '').toString();
  const ua = (req?.headers?.['user-agent'] || '').toString();
  const cityHeader = (req?.headers?.['x-user-city'] || req?.headers?.['x-city'] || '').toString();
  const countryHeader = (req?.headers?.['x-user-country'] || req?.headers?.['x-country'] || req?.headers?.['cf-ipcountry'] || req?.headers?.['x-vercel-ip-country'] || req?.headers?.['x-country-code'] || '').toString();
  let alCountry = '';
  const al = (req?.headers?.['accept-language'] || '').toString();
  if (al) {
    const m = String(al).match(/^[a-z]{2,3}-([A-Z]{2})/);
    if (m && m[1]) alCountry = m[1];
  }
  const city = ((req as any)?.query?.userCity || (req as any)?.query?.city || cityHeader || '').toString();
  const country = (((req as any)?.query?.userCountry) || ((req as any)?.query?.country) || countryHeader || alCountry || '').toString();
  this.productsService.recordSearchKeyword(q, 'suggest', { ip, ua, city: city || undefined, country: country || undefined }).catch(() => {});
  return this.productsService.suggestNames(q, lim);
  }

  // Aggregated home feed: avoid collision with ':id' by defining here
  @Get('home')
  @Header('Cache-Control', 'public, max-age=60')
  async homeFeed(@Query() q: any) {
    const perSection = Math.min(Number(q.limit || q.per_page) || 10, 20);
    const v = typeof q.view === 'string' && (q.view === 'grid' || q.view === 'full') ? (q.view as 'grid' | 'full') : 'grid';
    const city = q.userCity || q.city;
    const region = q.userRegion || q.region;
    const country = q.userCountry || q.country;
  const data = await this.homeService.getHomeFeed({
      perSection,
      userCity: city,
      userRegion: region,
      userCountry: country,
      view: v,
    });

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
        geo: { city: city || null, region: region || null, country: country || null },
        seeAll: {
          newArrivals: ((data as any).curatedNew?.length ?? 0) > 0 ? { tag: 'home-new', kind: 'curated' } : { tag: 'home-new' },
          bestSellers: ((data as any).curatedBest?.length ?? 0) > 0 ? { tag: 'home-best', kind: 'curated' } : { sort: 'sales_desc' },
          // aliases expected by some clients
          curatedNew: ((data as any).curatedNew?.length ?? 0) > 0 ? { tag: 'home-new', kind: 'curated' } : { tag: 'home-new' },
          homeNew: ((data as any).curatedNew?.length ?? 0) > 0 ? { tag: 'home-new', kind: 'curated' } : { tag: 'home-new' },
          curatedBest: ((data as any).curatedBest?.length ?? 0) > 0 ? { tag: 'home-best', kind: 'curated' } : { sort: 'sales_desc' },
          homeBest: ((data as any).curatedBest?.length ?? 0) > 0 ? { tag: 'home-best', kind: 'curated' } : { sort: 'sales_desc' },
        },
      },
    } as any;

    // Also provide common envelopes expected by some clients
    return { data: payload, result: payload, payload };
  }

  // East Africa batch: returns items grouped by country codes in one call
  @Get('east-africa')
  async eastAfricaBatch(@Query() q: any) {
    const countries = String(q.countries || 'ET,SO,KE,DJ')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const per = Math.min(Number(q.per_country || q.per || q.limit) || 10, 30);
    const sort = typeof q.sort === 'string' ? q.sort : 'rating_desc';
    const view = typeof q.view === 'string' && (q.view === 'grid' || q.view === 'full') ? (q.view as 'grid' | 'full') : 'grid';

    const results = await Promise.all(
      countries.map((code) =>
        this.productsService.findFiltered({ perPage: per, sort, country: code, view } as any)
          .then((res) => ({ code, items: res.items }))
      ),
    );
    return { countries: results };
  }

  @Get('/tags/suggest')
  suggestTags(@Query('q') q: string) {
    // TODO: Replace with actual tag suggestion service if available
    return this.productsService.suggestNames(q);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  // Personalized recommendations for the current user
  @UseGuards(AuthGuard('jwt'))
  @Get('recommended')
  async recommended(
    @Req() req: any,
    @Query('page') page = 1,
    @Query('per_page') perPage = 20,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('Unauthorized');
    return this.productsService.recommendedForUser(Number(userId), Number(page) || 1, Number(perPage) || 20);
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
  @Roles(UserRole.VENDOR)
  deleteProduct(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
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