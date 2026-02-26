import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  ValidateNested,
  IsInt,
  IsObject,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class DigitalLicenseDto {
  @IsOptional()
  @IsString()
  id?: string;
  @IsOptional()
  @IsString()
  name?: string;
  @IsOptional()
  @IsString()
  url?: string;
}

class DigitalDownloadDto {
  @IsString()
  @ApiPropertyOptional({
    description: 'Object storage key (no host)',
    example: 'uploads/12345_file.pdf',
  })
  key: string; // object key only
  @IsOptional()
  @IsString()
  publicUrl?: string; // optional; server can derive
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  size?: number;
  @IsOptional()
  @IsString()
  contentType?: string;
  @IsOptional()
  @IsString()
  filename?: string;
  @IsOptional()
  @IsString()
  checksum?: string;
  @IsOptional()
  @IsObject()
  original_creator_contact?: Record<string, any>;
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  licenseRequired?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalLicenseDto)
  license?: DigitalLicenseDto;
}

class DigitalAttributesDto {
  @IsIn(['digital'])
  @ApiPropertyOptional({ enum: ['digital'] })
  type: 'digital';
  @ValidateNested()
  @Type(() => DigitalDownloadDto)
  @ApiPropertyOptional({ description: 'Download metadata object' })
  download: DigitalDownloadDto;
}

class ImageDto {
  @IsString()
  src: string;
  // Allow clients to omit derived variants; fallback to src in service
  @IsOptional()
  @IsString()
  thumbnailSrc?: string;

  @IsOptional()
  @IsString()
  lowResSrc?: string;
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
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.map((img) =>
      typeof img === 'string'
        ? { src: img, thumbnailSrc: img, lowResSrc: img }
        : img,
    );
  })
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
  @ApiPropertyOptional({ description: 'Legacy support for stock_quantity' })
  stock_quantity?: number;

  @IsOptional()
  @IsBoolean()
  manageStock?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Legacy support for manage_stock' })
  manage_stock?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @ApiPropertyOptional({ description: 'Minimum Order Quantity', default: 1 })
  moq?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @ApiPropertyOptional({ description: 'Dispatch time in days (0 = Ready to Ship)' })
  dispatchDays?: number;

  @IsOptional()
  @IsIn(['publish', 'draft', 'pending', 'pending_approval', 'rejected'])
  status?: 'publish' | 'draft' | 'pending' | 'pending_approval' | 'rejected';

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

  // Optional explicit productType (else inferred)
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

  // Free-form attributes bag for extensibility (e.g., videoUrl)
  @IsOptional()
  // Note: kept untyped here for flexibility; validate specific keys server-side if needed
  @ApiPropertyOptional({
    description:
      'Arbitrary attributes bag; may contain canonical digital structure under digital',
    example: {
      digital: {
        type: 'digital',
        download: { key: 'files/book.pdf' },
      },
    },
  })
  attributes?: Record<string, any> & { digital?: DigitalAttributesDto };

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
