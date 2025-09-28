import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class DigitalLicenseDtoU {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() url?: string;
}
class DigitalDownloadDtoU {
  @IsOptional() @IsString() @ApiPropertyOptional({ description: 'Object storage key (no host)', example: 'uploads/12345_file.pdf' }) key?: string;
  @IsOptional() @IsString() publicUrl?: string;
  @IsOptional() @Type(() => Number) @IsNumber() size?: number;
  @IsOptional() @IsString() contentType?: string;
  @IsOptional() @IsString() filename?: string;
  @IsOptional() @IsString() checksum?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() licenseRequired?: boolean;
  @IsOptional() @ValidateNested() @Type(() => DigitalLicenseDtoU) license?: DigitalLicenseDtoU;
}
class DigitalAttributesDtoU {
  @IsOptional() @IsIn(['digital']) @ApiPropertyOptional({ enum: ['digital'] }) type?: 'digital';
  @IsOptional() @Type(() => Boolean) @IsBoolean() @ApiPropertyOptional({ description: 'Flag for free download eligibility' }) isFree?: boolean;
  @IsOptional() @ValidateNested() @Type(() => DigitalDownloadDtoU) @ApiPropertyOptional({ description: 'Download metadata object' }) download?: DigitalDownloadDtoU;
}

class ImageDto {
  @IsString()
  src: string;
  @IsString()
  thumbnailSrc: string;
  @IsString()
  lowResSrc: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number;

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

  // ✨ FINAL FIX: Add the categoryId property with the @Type decorator
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

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

  @IsOptional()
  @IsIn(['physical', 'digital', 'service', 'property'])
  @ApiPropertyOptional({ enum: ['physical', 'digital', 'service', 'property'] })
  productType?: 'physical' | 'digital' | 'service' | 'property';

  @IsOptional()
  @ApiPropertyOptional({ description: 'Arbitrary attributes bag; may include canonical digital structure under digital' })
  attributes?: Record<string, any> & { digital?: DigitalAttributesDtoU };
}
