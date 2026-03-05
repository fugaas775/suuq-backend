import { Controller, Get, Header, Query } from '@nestjs/common';
import { HomeService } from './home.service';
import { Res } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { PrometheusService } from '../metrics/prometheus.service';

// Routes here are mounted under global prefix '/api'
@Controller('v2/home')
export class HomeV2Controller {
  constructor(
    private readonly home: HomeService,
    private readonly prometheus: PrometheusService,
  ) {}

  // New unified home feed endpoint
  @Get('feed')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  async v2Feed(@Query() q: any, @Res({ passthrough: true }) res: Response) {
    const startedAt = Date.now();
    let stage = 'unknown';
    let statusCode = 200;
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
    const hydrationModeRaw = toText(
      q.hydration_mode ?? q.hydrationMode ?? q.mode,
    );
    const hydrationMode =
      hydrationModeRaw === 'initial' ||
      hydrationModeRaw === 'deferred' ||
      hydrationModeRaw === 'full'
        ? hydrationModeRaw
        : toBool(q.minimal)
          ? 'initial'
          : toBool(q.hydrate)
            ? 'deferred'
            : undefined;
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

    try {
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
        hydrationMode,
      });
      stage = String(data?.meta?.hydrationStage || 'unknown');

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
      if (data?.meta?.hydrationStage) {
        res.setHeader(
          'X-Home-Hydration-Stage',
          String(data.meta.hydrationStage),
        );
      }

      const stripTelemetry = data?.meta?.immersiveStripTelemetry;
      if (stripTelemetry?.enabled) {
        const attempted = Number(stripTelemetry.attempted || 0);
        const hydrated = Number(stripTelemetry.hydrated || 0);
        const fallbackUsed = Number(stripTelemetry.fallbackUsed || 0);
        const noMatch = Number(stripTelemetry.noMatch || 0);
        const noMatchRate =
          attempted > 0 ? Math.round((noMatch / attempted) * 1000) / 1000 : 0;
        res.setHeader(
          'X-Home-Immersive-Strip',
          `attempted=${attempted};hydrated=${hydrated};fallback=${fallbackUsed};no_match=${noMatch};no_match_rate=${noMatchRate}`,
        );
        this.prometheus.observeHomeFeedImmersiveStrip(stage, statusCode, {
          attempted,
          hydrated,
          fallbackUsed,
          noMatch,
        });
      }
      return data;
    } catch (error) {
      stage = 'error';
      if (error instanceof HttpException) {
        statusCode = error.getStatus();
      } else {
        statusCode = 500;
      }
      throw error;
    } finally {
      const seconds = (Date.now() - startedAt) / 1000;
      this.prometheus.observeHomeFeedHydration(stage, statusCode, seconds);
    }
  }
}
