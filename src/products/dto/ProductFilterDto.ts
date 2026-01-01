import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';
import { Type, Expose, Transform } from 'class-transformer';

export class ProductFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(({ value }) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    // Cap per-page to 100
    return Math.max(1, Math.min(n, 100));
  })
  @Expose({ name: 'per_page' })
  perPage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Expose({ name: 'limit' })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(({ value }) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    // Defensive cap to avoid deep pages thrashing database
    return Math.max(1, Math.min(n, 1000));
  })
  page?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return undefined;
    const t = value.trim().replace(/\s+/g, ' ');
    return t.slice(0, 256);
  })
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const toPosInts = (arr: unknown[]): number[] =>
      arr
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n >= 1 && Number.isInteger(n));
    if (typeof value === 'string') {
      const parts = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const nums = toPosInts(parts);
      return nums.length ? nums : undefined;
    }
    if (Array.isArray(value)) {
      const nums = toPosInts(value);
      return nums.length ? nums : undefined;
    }
    if (typeof value === 'number') {
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 ? [n] : undefined;
    }
    return undefined;
  })
  categoryId?: number[];

  // Accept frontend alias ?category= as categoryId
  @IsOptional()
  @Transform(({ value }) => {
    const toPosInts = (arr: unknown[]): number[] =>
      arr
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n >= 1 && Number.isInteger(n));
    if (typeof value === 'string') {
      const parts = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const nums = toPosInts(parts);
      return nums.length ? nums : undefined;
    }
    if (Array.isArray(value)) {
      const nums = toPosInts(value);
      return nums.length ? nums : undefined;
    }
    if (typeof value === 'number') {
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 ? [n] : undefined;
    }
    return undefined;
  })
  @Expose({ name: 'category' })
  categoryAlias?: number[];

  // Accept frontend alias ?categories= as categoryId list (CSV)
  @IsOptional()
  @Transform(({ value }) => {
    const toPosInts = (arr: unknown[]): number[] =>
      arr
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n >= 1 && Number.isInteger(n));
    if (typeof value === 'string') {
      const parts = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const nums = toPosInts(parts);
      return nums.length ? nums : undefined;
    }
    if (Array.isArray(value)) {
      const nums = toPosInts(value);
      return nums.length ? nums : undefined;
    }
    if (typeof value === 'number') {
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 ? [n] : undefined;
    }
    return undefined;
  })
  @Expose({ name: 'categories' })
  categoriesCsv?: number[];

  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return undefined;
    const v = value.trim().toLowerCase();
    // Normalize synonyms to canonical values
    const alias: Record<string, string> = {
      best: 'best_match',
      'best-match': 'best_match',
      'best match': 'best_match',
      relevant: 'best_match',
      relevance: 'best_match',
      popular: 'sales_desc',
      newest: 'created_desc',
      'newest-first': 'created_desc',
      'newest first': 'created_desc',
      'price:low-to-high': 'price_asc',
      'price low to high': 'price_asc',
      'price-low-to-high': 'price_asc',
      'price:high-to-low': 'price_desc',
      'price high to low': 'price_desc',
      'price-high-to-low': 'price_desc',
      'top-rated': 'rating_desc',
      'top rated': 'rating_desc',
      distance: 'distance_asc',
      nearest: 'distance_asc',
      nearby: 'distance_asc',
      proximity: 'distance_asc',
      farthest: 'distance_desc',
    };
    const norm = alias[v] || v;
    const allowed = new Set([
      'best_match',
      'sales_desc',
      'rating_desc',
      'views_desc',
      'price_asc',
      'price_desc',
      'created_desc',
      'created_asc',
      'distance_asc',
      'distance_desc',
    ]);
    return allowed.has(norm) ? norm : undefined;
  })
  sort?: string;

  // Optional lean projection for grids
  @IsOptional()
  @IsString()
  view?: 'grid' | 'full';

  // Include products from descendant subcategories when filtering by a parent category
  @IsOptional()
  @Type(() => Boolean)
  @Expose({ name: 'include_descendants' })
  includeDescendants?: boolean;

  // Do not filter by category; instead, prioritize category and its descendants first, then others
  @IsOptional()
  @Type(() => Boolean)
  @Expose({ name: 'category_first' })
  categoryFirst?: boolean;

  // Optional vendor filter for batch vendor products
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendorId?: number;

  @IsOptional()
  @Expose({ name: 'tag' })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map((v) => String(v));
    if (typeof value === 'string') return value;
    return undefined;
  })
  tags?: string | string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMax?: number;
  @IsOptional()
  @IsString()
  currency?: string;

  // Geo/location filters based on vendor profile fields
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  city?: string;

  // Geo ranking (do not hard filter; just prioritize by these)
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @Expose({ name: 'geo_priority' })
  geoPriority?: boolean;

  @IsOptional()
  @IsString()
  @Expose({ name: 'user_country' })
  userCountry?: string;

  @IsOptional()
  @IsString()
  @Expose({ name: 'user_region' })
  userRegion?: string;

  @IsOptional()
  @IsString()
  @Expose({ name: 'user_city' })
  userCity?: string;

  // Optional comma-separated whitelist of countries for the region scope (defaults to ET,SO,KE,DJ)
  @IsOptional()
  @IsString()
  @Expose({ name: 'east_africa' })
  eastAfrica?: string;

  // Optional: when category_first is true, top up page with geo-ranked items from outside the union (do not change total)
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @Expose({ name: 'geo_append' })
  geoAppend?: boolean;

  // Property: bedrooms exact or ranges
  // Property listing type filter (?listingType=sale or ?listing_type=rent)
  @IsOptional()
  @IsString()
  listingType?: string;

  // listingTypeMode: 'filter' (default) => restrict to that listingType; 'priority' => bring that listingType first but include others
  @IsOptional()
  @IsString()
  @Expose({ name: 'listing_type_mode' })
  listingTypeMode?: string;

  @IsOptional()
  @IsString()
  @Expose({ name: 'listing_type' })
  listing_type?: string;

  // Property: bedrooms exact or ranges
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Expose({ name: 'bedrooms' })
  bedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Expose({ name: 'bedrooms_min' })
  bedroomsMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Expose({ name: 'bedrooms_max' })
  bedroomsMax?: number;

  // Coordinates accepted for forward-compatibility (not used server-side yet)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  distanceKm?: number;

  // Optional radius (in kilometers) for nearby filtering; accepts aliases: radius, radius_km, nearbyRadius, radiusKm
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Transform(({ value, obj }) => {
    const raw =
      value ??
      obj?.radius ??
      obj?.radius_km ??
      obj?.nearbyRadius ??
      obj?.radiusKm;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  })
  radiusKm?: number;
}
