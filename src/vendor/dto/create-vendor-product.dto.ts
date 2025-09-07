import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsInt,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

// A new class to define the structure of each image object
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

  // Key in Spaces for digital product download (e.g., PDFs). Prefer object key, not full URL.
  @IsOptional()
  @IsString()
  downloadKey?: string;

  // Mark this product as free to download (when downloadKey is set)
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFree?: boolean;
}

export class CreateVendorProductDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  price!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stock_quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsNotEmpty()
  @IsString()
  currency!: string;

  // ✅ FIX: This now accepts an array of ImageDto objects
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageDto)
  images?: ImageDto[];

  // Tags as array of names (e.g., selected subcategory labels)
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
  listingTypeMulti?: string[]; // client sometimes sends ["sale"] or ["rent"]

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
