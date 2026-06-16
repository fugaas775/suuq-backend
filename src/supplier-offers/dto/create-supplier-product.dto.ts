import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { SupplierAvailabilityStatus } from '../entities/supplier-offer.entity';

/**
 * A supplier "product": one product record plus its wholesale offer, created in
 * a single step (the supplier-portal mirror of how a branch adds a product).
 *
 * The product is stored in the shared products table but is B2B-only — it is
 * created with status 'draft' and no consumer VendorStore scope, so it never
 * surfaces in the consumer marketplace; it only exists to back the wholesale
 * offer that buyers see in the supplier catalog.
 */
export class CreateSupplierProductDto {
  @ApiProperty({ example: 'Bottled Water 500ml — Case of 24' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Sealed case, food-grade PET bottles.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '6291041500213' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiPropertyOptional({
    enum: ['physical', 'digital', 'service', 'property'],
    default: 'physical',
  })
  @IsOptional()
  @IsIn(['physical', 'digital', 'service', 'property'])
  productType?: 'physical' | 'digital' | 'service' | 'property';

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  // ---- Wholesale offer ----------------------------------------------------

  @ApiProperty({ example: 42.5, description: 'Unit wholesale price' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitWholesalePrice!: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ enum: SupplierAvailabilityStatus })
  @IsOptional()
  @IsEnum(SupplierAvailabilityStatus)
  availabilityStatus?: SupplierAvailabilityStatus;

  @ApiPropertyOptional({ example: 10, description: 'Minimum order quantity' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  moq?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: ['ET', 'DJ'], type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  fulfillmentRegions?: string[];

  @ApiPropertyOptional({
    default: true,
    description:
      'Publish the offer immediately (requires an active supplier subscription). Defaults to true; falls back to a draft offer when the supplier is not yet active.',
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
