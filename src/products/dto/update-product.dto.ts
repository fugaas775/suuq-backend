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
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class DigitalLicenseDtoU {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() url?: string;
}
class DigitalDownloadDtoU {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Object storage key (no host)',
    example: 'uploads/12345_file.pdf',
  })
  key?: string;
  @IsOptional() @IsString() publicUrl?: string;
  @IsOptional() @Type(() => Number) @IsNumber() size?: number;
  @IsOptional() @IsString() contentType?: string;
  @IsOptional() @IsString() filename?: string;
  @IsOptional() @IsString() checksum?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() licenseRequired?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalLicenseDtoU)
  license?: DigitalLicenseDtoU;
}
class DigitalAttributesDtoU {
  @IsOptional()
  @IsIn(['digital'])
  @ApiPropertyOptional({ enum: ['digital'] })
  type?: 'digital';
  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalDownloadDtoU)
  @ApiPropertyOptional({ description: 'Download metadata object' })
  download?: DigitalDownloadDtoU;
}

class ImageDto {
  @IsString()
  src: string;
  @IsOptional()
  @IsString()
  thumbnailSrc?: string;
  @IsOptional()
  @IsString()
  lowResSrc?: string;
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
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.map((img) =>
      typeof img === 'string'
        ? { src: img, thumbnailSrc: img, lowResSrc: img }
        : img,
    );
  })
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
  salePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @ApiPropertyOptional({ description: 'Legacy support for sale_price' })
  sale_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stockQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stock_quantity?: number;

  @IsOptional()
  @IsBoolean()
  manageStock?: boolean;

  @IsOptional()
  @IsBoolean()
  manage_stock?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @ApiPropertyOptional({ description: 'Minimum Order Quantity', default: 1 })
  moq?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @ApiPropertyOptional({
    description: 'Dispatch time in days (0 = Ready to Ship)',
  })
  dispatchDays?: number;

  @IsOptional()
  @IsIn(['publish', 'draft', 'pending', 'pending_approval', 'rejected'])
  status?: 'publish' | 'draft' | 'pending' | 'pending_approval' | 'rejected';

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

  // Vehicle Attributes
  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  mileage?: number;

  @IsOptional()
  @IsString()
  transmission?: string;

  @IsOptional()
  @IsString()
  fuelType?: string;

  @IsOptional()
  @IsIn(['physical', 'digital', 'service', 'property'])
  @ApiPropertyOptional({ enum: ['physical', 'digital', 'service', 'property'] })
  productType?: 'physical' | 'digital' | 'service' | 'property';

  // Object storage key for digital products (alias to attributes.downloadKey)
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Object storage key for digital products; mirrors attributes.downloadKey',
    example: 'files/books/ebook.pdf',
  })
  downloadKey?: string;

  @IsOptional()
  @ApiPropertyOptional({
    description:
      'Arbitrary attributes bag; may include canonical digital structure under digital',
  })
  attributes?: Record<string, any> & { digital?: DigitalAttributesDtoU };

  @IsOptional()
  @IsString()
  menuSection?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Legacy alias for menuSection' })
  menu_section?: string;

  @IsOptional()
  @IsString()
  availability?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Legacy alias for availability' })
  stock_status?: string;

  @IsOptional()
  @IsString()
  serviceType?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Legacy alias for serviceType' })
  service_type?: string;

  @IsOptional()
  @IsString()
  orderClass?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Legacy alias for orderClass' })
  order_class?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Legacy alias for orderClass' })
  order_type?: string;
}
