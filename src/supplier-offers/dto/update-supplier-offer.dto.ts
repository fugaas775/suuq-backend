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
import { SupplierAvailabilityStatus } from '../entities/supplier-offer.entity';

// Field-level edit DTO. Status changes go through PATCH :id/status, not here.
export class UpdateSupplierOfferDto {
  @IsOptional()
  @IsEnum(SupplierAvailabilityStatus)
  availabilityStatus?: SupplierAvailabilityStatus;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitWholesalePrice?: number;

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
