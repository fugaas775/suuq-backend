import { Controller, Get, Header, Query } from '@nestjs/common';
import { HomeService } from './home.service';

// Routes here are mounted under global prefix '/api'
@Controller('v2/home')
export class HomeV2Controller {
  constructor(private readonly home: HomeService) {}

  // New unified home feed endpoint
  @Get('feed')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  async v2Feed(@Query() q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const perPage = Math.min(
      Math.max(Number(q.limit || q.per_page) || 20, 1),
      50,
    );
    const city = q.userCity || q.city || undefined;
    const region = q.userRegion || q.region || undefined;
    const country = q.userCountry || q.country || undefined;

    // Category filters (accept id(s) or slug)
    const parseIds = (val: unknown): number[] | undefined => {
      if (val === undefined || val === null || val === '') return undefined;
      if (Array.isArray(val)) {
        const nums = (val as unknown[])
          .map((v) => Number(v))
          .filter((n) => Number.isInteger(n) && n >= 1);
        return nums.length ? nums : undefined;
      }
      if (typeof val === 'string') {
        const parts = val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => Number(s))
          .filter((n) => Number.isInteger(n) && n >= 1);
        return parts.length ? parts : undefined;
      }
      if (typeof val === 'number' && Number.isInteger(val) && val >= 1) {
        return [val as number];
      }
      return undefined;
    };
    const categoryId =
      parseIds(q.categoryId) || parseIds(q.category) || parseIds(q.categories);
    const categorySlug =
      typeof q.categorySlug === 'string' && q.categorySlug.trim()
        ? String(q.categorySlug).trim()
        : undefined;

    // Ordering flags
    const toBool = (v: any, d = undefined as boolean | undefined) => {
      if (v === undefined) return d;
      const s = String(v).toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(s)) return true;
      if (['0', 'false', 'no', 'off'].includes(s)) return false;
      return d;
    };
    const categoryFirst = toBool(q.category_first ?? q.categoryFirst);
    // If a category is provided and no explicit flag, default include_descendants to true
    const includeDescendants = toBool(
      q.include_descendants ?? q.includeDescendants,
      categoryId || categorySlug ? true : undefined,
    );
    const geoAppend = toBool(q.geo_append ?? q.geoAppend);
    const sort = typeof q.sort === 'string' ? q.sort : undefined;

    // Property filters passthrough (optional)
    const listingType = q.listing_type || q.listingType;
    const listingTypeMode = q.listing_type_mode || q.listingTypeMode;

    const data = await this.home.getV2HomeFeed({
      page,
      perPage,
      userCity: city,
      userRegion: region,
      userCountry: country,
      categoryId,
      categorySlug,
      categoryFirst,
      includeDescendants,
      geoAppend,
      sort,
      listingType,
      listingTypeMode,
    });
    return data;
  }
}
