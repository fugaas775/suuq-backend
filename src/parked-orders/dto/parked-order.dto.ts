import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ParkedOrderSource } from '../entities/parked-order.entity';

export class CreateParkedOrderDto {
  @IsInt()
  @IsPositive()
  productId!: number;

  // Optional: the server resolves the vendor from the product; provided only as a hint/fallback.
  @IsOptional()
  @IsInt()
  @IsPositive()
  vendorId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  source?: ParkedOrderSource;
}

export class UpdateParkedOrderStatusDto {
  @IsString()
  status!: string;
}

export class ParkedOrderListQueryDto {
  @IsOptional()
  @IsInt()
  page?: number;

  @IsOptional()
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  branchId?: number;
}
