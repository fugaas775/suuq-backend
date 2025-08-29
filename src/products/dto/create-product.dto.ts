import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, IsIn, IsNotEmpty, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

class ImageDto {
  @IsString()
  src: string;
  @IsString()
  thumbnailSrc: string;
  @IsString()
  lowResSrc: string;
}

export class CreateProductDto {
  @IsString()
  name: string;

  @Type(() => Number)
  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageDto)
  images?: ImageDto[];

  // ✨ FINAL FIX: Add the @Type decorator here
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsNotEmpty()
  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stock_quantity?: number;

  @IsOptional()
  @IsBoolean()
  manage_stock?: boolean;

  @IsOptional()
  @IsIn(['publish', 'draft', 'pending'])
  status?: 'publish' | 'draft' | 'pending';

  // Property vertical: 'sale' | 'rent'
  @IsOptional()
  @IsIn(['sale', 'rent'])
  listingType?: 'sale' | 'rent';

  // Property attributes
  @IsOptional()
  @Type(() => Number)
  bedrooms?: number;

  @IsOptional()
  @IsString()
  listingCity?: string;

  @IsOptional()
  @Type(() => Number)
  bathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  sizeSqm?: number;

  @IsOptional()
  @Type(() => Boolean)
  furnished?: boolean;

  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  rentPeriod?: 'day' | 'week' | 'month' | 'year';

  // Free-form attributes bag for extensibility (e.g., videoUrl)
  @IsOptional()
  // Note: kept untyped here for flexibility; validate specific keys server-side if needed
  attributes?: Record<string, any>;
}