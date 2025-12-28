import {
  IsOptional,
  IsString,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type, Expose, Transform } from 'class-transformer';
// Local lightweight transform helpers (avoid adding new shared deps during refactor)
function toInteger(
  value: any,
  opts: { default?: number; min?: number; max?: number } = {},
): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return opts.default;
  let v = Math.trunc(n);
  if (typeof opts.min === 'number') v = Math.max(opts.min, v);
  if (typeof opts.max === 'number') v = Math.min(opts.max, v);
  return v;
}
function toFloat(value: any): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
function toBoolean(value: any): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return undefined;
}
function parseCsv(
  value: any,
  opts: { type: 'number' | 'string' },
): any[] | undefined {
  const coerce = (v: any) => (opts.type === 'number' ? Number(v) : String(v));
  if (Array.isArray(value)) {
    const arr = value
      .map(coerce)
      .filter((v) =>
        opts.type === 'number'
          ? Number.isFinite(v as any)
          : String(v).length > 0,
      );
    return arr.length ? arr : undefined;
  }
  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(coerce)
      .filter((v) =>
        opts.type === 'number'
          ? Number.isFinite(v as any)
          : String(v).length > 0,
      );
    return parts.length ? parts : undefined;
  }
  if (
    typeof value === 'number' &&
    opts.type === 'number' &&
    Number.isFinite(value)
  )
    return [Math.trunc(value)];
  return undefined;
}

export class ProductListingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) => toInteger(value, { default: 1, min: 1, max: 1000 }))
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @Expose({ name: 'per_page' })
  @Transform(({ value }) => toInteger(value, { default: 20, min: 1, max: 100 }))
  perPage?: number = 20;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim().slice(0, 256))
  search?: string;

  @IsOptional()
  @Transform(({ value }) => parseCsv(value, { type: 'number' }))
  @Expose({ name: 'category' })
  categoryId?: number[];

  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  featured?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseCsv(value, { type: 'string' }))
  tags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => toFloat(value))
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => toFloat(value))
  priceMax?: number;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  view?: 'grid' | 'full' = 'grid';

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  includeDescendants?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  categoryFirst?: boolean;

  // When true, if a category scope is provided and categoryFirst is enabled, results will be strictly limited
  // to the in-scope category IDs with no fallback to other categories and no geoAppend top-up.
  // Snake_case alias supported for query compatibility: strict_category=1
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @Expose({ name: 'strict_category' })
  strictCategory?: boolean;

  // Optional server-side fallback: if strict returned zero, re-run with a parent category.
  // Provide the parent category id and whether to include descendants for fallback scope.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Expose({ name: 'strict_empty_fallback_parent_id' })
  strictEmptyFallbackParentId?: number;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @Expose({ name: 'fallback_descendants' })
  fallbackDescendants?: boolean;

  // Debug: when true, service can include debug/meta and controller may emit headers
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @Expose({ name: 'debug_listing' })
  debugListing?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendorId?: number;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  geoPriority?: boolean;

  @IsOptional()
  @IsString()
  userCountry?: string;

  @IsOptional()
  @IsString()
  userRegion?: string;

  @IsOptional()
  @IsString()
  userCity?: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  geoAppend?: boolean;

  @IsOptional()
  @IsString()
  listingType?: 'sale' | 'rent';

  @IsOptional()
  @IsString()
  listingTypeMode?: 'filter' | 'priority';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bedroomsMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bedroomsMax?: number;

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
  radiusKm?: number;
}
