
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