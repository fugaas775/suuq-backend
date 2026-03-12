import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import {
  SupplierAvailabilityStatus,
  SupplierOfferStatus,
} from '../entities/supplier-offer.entity';

export class CreateSupplierOfferDto {
  @Type(() => Number)
  @IsNumber()
  supplierProfileId!: number;

  @Type(() => Number)
  @IsNumber()
  productId!: number;

  @IsOptional()
  @IsEnum(SupplierOfferStatus)
  status?: SupplierOfferStatus;

  @IsOptional()
  @IsEnum(SupplierAvailabilityStatus)
  availabilityStatus?: SupplierAvailabilityStatus;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitWholesalePrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  moq?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fulfillmentRegions?: string[];
}
