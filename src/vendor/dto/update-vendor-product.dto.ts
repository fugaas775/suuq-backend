import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsInt,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

// Re-using the ImageDto definition for consistency
class ImageDto {
  @IsString()
  src: string;
  @IsString()
  thumbnailSrc: string;
  @IsString()
  lowResSrc: string;
}

class AttributesDto {
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  posterUrl?: string;

  @IsOptional()
  @IsString()
  downloadKey?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFree?: boolean;
}

export class UpdateVendorProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stock_quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  status?: 'publish' | 'draft' | 'pending';

  // ✅ FIX: Add images property to handle updates
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageDto)
  images?: ImageDto[];

  // Tags as array of names
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // Optional top-level video URL convenience (alternative to attributes.videoUrl)
  @IsOptional()
  @IsString()
  videoUrl?: string;

  // Optional top-level poster URL convenience
  @IsOptional()
  @IsString()
  posterUrl?: string;

  // Optional top-level convenience to set attributes.downloadKey
  @IsOptional()
  @IsString()
  downloadKey?: string;

  // Optional top-level convenience for free digital products
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFree?: boolean;

  // --- Property & Real Estate optional fields ---
  @IsOptional()
  @IsIn(['sale', 'rent'])
  listingType?: 'sale' | 'rent';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  listingTypeMulti?: string[];

  @IsOptional()
  @IsString()
  listingCity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sizeSqm?: number;

  @IsOptional()
  @IsBoolean()
  furnished?: boolean;

  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  rentPeriod?: 'day' | 'week' | 'month' | 'year';

  @IsOptional()
  @ValidateNested()
  @Type(() => AttributesDto)
  attributes?: AttributesDto;
}
