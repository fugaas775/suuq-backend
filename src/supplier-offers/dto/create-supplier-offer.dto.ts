import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { SupplierAvailabilityStatus } from '../entities/supplier-offer.entity';

export class CreateSupplierOfferDto {
  @ApiProperty({ example: 101 })
  @Type(() => Number)
  @IsInt()
  productId!: number;

  @ApiProperty({ example: 42.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitWholesalePrice!: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ enum: SupplierAvailabilityStatus })
  @IsOptional()
  @IsEnum(SupplierAvailabilityStatus)
  availabilityStatus?: SupplierAvailabilityStatus;

  @ApiPropertyOptional({ example: 10 })
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
}
