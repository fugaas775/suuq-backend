
import { IsOptional, IsString, IsNumber, IsBoolean, IsInt, Min } from 'class-validator';
import { Type, Expose, Transform } from 'class-transformer';

export class ProductFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
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
  page?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  // Accept frontend alias ?category= as categoryId
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Expose({ name: 'category' })
  categoryAlias?: number;

  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
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
  @IsString()
  @Expose({ name: 'tag' })
  tags?: string;

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

  // Optional comma-separated whitelist of countries for the region scope (defaults to ET,SO,KE,DJ)
  @IsOptional()
  @IsString()
  eastAfrica?: string;

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
}