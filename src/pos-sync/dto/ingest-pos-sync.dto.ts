import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ArrayMinSize,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { StockMovementType } from '../../branches/entities/stock-movement.entity';
import { ProductAliasType } from '../../product-aliases/entities/product-alias.entity';
import { PosSyncType } from '../entities/pos-sync-job.entity';

export class PosSyncEntryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  productId?: number;

  @IsOptional()
  @IsEnum(ProductAliasType)
  aliasType?: ProductAliasType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  aliasValue?: string;

  @Type(() => Number)
  @IsNumber()
  quantity!: number;

  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  counterpartyBranchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  transferId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class IngestPosSyncDto {
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  partnerCredentialId?: number;

  @IsEnum(PosSyncType)
  syncType!: PosSyncType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalJobId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosSyncEntryDto)
  entries!: PosSyncEntryDto[];
}
