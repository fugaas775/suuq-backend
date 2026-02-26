/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Controller, Get, Header, Query } from '@nestjs/common';
import { HomeService } from './home.service';
import { Res } from '@nestjs/common';
import type { Response } from 'express';

// Routes here are mounted under global prefix '/api'
@Controller('v2/home')
export class HomeV2Controller {
  constructor(private readonly home: HomeService) {}

  // New unified home feed endpoint
  @Get('feed')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  async v2Feed(@Query() q: any, @Res({ passthrough: true }) res: Response) {
    const page = Math.max(1, Number(q.page) || 1);
    const perPage = Math.min(
      Math.max(Number(q.limit || q.per_page) || 20, 1),
      50,
    );
    const toText = (v: unknown): string | undefined => {
      if (typeof v !== 'string') return undefined;
      const trimmed = v.trim();
      return trimmed ? trimmed : undefined;
    };
    const city = toText(q.user_city || q.userCity || q.city);
    const region = toText(q.user_region || q.userRegion || q.region);
    const country = toText(q.user_country || q.userCountry || q.country);
    const currency = q.currency;

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
        return [val];
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
    const geoAppend = toBool(q.geo_append ?? q.geoAppend, true);
    const sort = typeof q.sort === 'string' ? q.sort : undefined;
    const rotationKey = toText(q.rotation_key ?? q.rotationKey ?? q.seed);
    const sessionSalt = toText(q.session_salt ?? q.sessionSalt);
    const rotationBucket = toText(q.time_bucket ?? q.timeBucket);
    const refreshReason = toText(q.refresh_reason ?? q.refreshReason);
    const requestId = toText(q.request_id ?? q.requestId);
    const geoCountryStrict = toBool(
      q.geo_country_strict ?? q.geoCountryStrict,
      true,
    );

    // Property filters passthrough (optional)
    const listingType = q.listing_type || q.listingType;
    const listingTypeMode = q.listing_type_mode || q.listingTypeMode;

    const data = await this.home.getV2HomeFeed({
      page,
      perPage,
      userCity: city,
      userRegion: region,
      userCountry: country,
      currency,
      categoryId,
      categorySlug,
      categoryFirst,
      includeDescendants,
      geoAppend,
      sort,
      listingType,
      listingTypeMode,
      rotationKey,
      sessionSalt,
      rotationBucket,
      refreshReason,
      requestId,
      geoCountryStrict,
    });
    const source =
      data?.meta?.exploreSource === 'fallback' ? 'fallback' : 'tiered';
    res.setHeader('X-Home-Explore-Source', source);
    res.setHeader(
      'X-Home-Explore-Count',
      String(Number(data?.meta?.exploreCount || 0)),
    );
    if (data?.meta?.requestId) {
      res.setHeader('X-Home-Request-Id', String(data.meta.requestId));
    }
    if (data?.meta?.requestKind) {
      res.setHeader('X-Home-Request-Kind', String(data.meta.requestKind));
    }
    if (data?.meta?.applyPriority !== undefined) {
      res.setHeader(
        'X-Home-Apply-Priority',
        String(Number(data.meta.applyPriority || 0)),
      );
    }
    return data;
  }
}
