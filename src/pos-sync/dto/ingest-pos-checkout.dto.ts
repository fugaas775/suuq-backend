import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductAliasType } from '../../product-aliases/entities/product-alias.entity';
import { PosCheckoutTransactionType } from '../entities/pos-checkout.entity';

export class PosCheckoutTenderDto {
  @IsString()
  @MaxLength(64)
  method!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class PosCheckoutItemDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lineTotal!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class IngestPosCheckoutDto {
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @IsEnum(PosCheckoutTransactionType)
  transactionType!: PosCheckoutTransactionType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  partnerCredentialId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalCheckoutId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  registerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  registerSessionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  suspendedCartId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  receiptNumber?: string;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  changeDue?: number;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cashierUserId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  cashierName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceReceiptId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceReceiptNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  refundMethod?: string;

  @IsOptional()
  @IsObject()
  pricingSummary?: Record<string, any>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosCheckoutItemDto)
  items!: PosCheckoutItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosCheckoutTenderDto)
  tenders?: PosCheckoutTenderDto[];
}
