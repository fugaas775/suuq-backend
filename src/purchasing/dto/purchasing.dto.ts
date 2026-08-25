import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

function trimmed(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class PurchaseRunLineDto {
  @ApiProperty({ example: 'Tomatoes' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(({ value }) => trimmed(value))
  description!: string;

  @ApiPropertyOptional({ example: 'Hodan vegetable stall' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => trimmed(value))
  vendorName?: string | null;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: 'kg' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  @Transform(({ value }) => trimmed(value))
  unitLabel?: string | null;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  /**
   * What the line actually cost. Sent rather than derived from quantity ×
   * unitPrice because a market price is negotiated on the total as often as on
   * the unit — "three hundred for the lot" — and rounding a haggled total back
   * out of a per-kilo rate loses the birr the two differ by.
   */
  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lineTotal?: number;

  @ApiPropertyOptional({ example: 4211, description: 'Optional catalog link.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number | null;

  @ApiPropertyOptional({
    example: 12,
    description: "How many of the PRODUCT's own units this adds to stock.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQuantity?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimmed(value))
  note?: string | null;
}

export class ListPurchaseRunsQueryDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'SUBMITTED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    example: 50,
    description: 'Newest first. Capped at 200.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class CreatePurchaseRunDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'Jigjiga market' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => trimmed(value))
  label?: string | null;

  @ApiPropertyOptional({ example: '2026-08-25T06:00:00.000Z' })
  @IsOptional()
  @IsString()
  occurredAt?: string;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ type: [PurchaseRunLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRunLineDto)
  lines?: PurchaseRunLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => trimmed(value))
  note?: string | null;
}

export class UpdatePurchaseRunDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'Jigjiga market' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => trimmed(value))
  label?: string | null;

  @ApiPropertyOptional({ example: '2026-08-25T06:00:00.000Z' })
  @IsOptional()
  @IsString()
  occurredAt?: string;

  /**
   * The WHOLE line list, always. A partial line patch would need stable client
   * ids for rows that are still being typed on a phone in a market; replacing
   * the set is one round trip and cannot half-apply.
   */
  @ApiPropertyOptional({ type: [PurchaseRunLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRunLineDto)
  lines?: PurchaseRunLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => trimmed(value))
  note?: string | null;
}

export class SubmitPurchaseRunDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({
    example: 410,
    description:
      'Change handed back to the till. Omit when no advance was issued.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  returnedAmount?: number | null;
}

export class DecidePurchaseRunDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'Charcoal was already bought on Monday.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => trimmed(value))
  reason?: string | null;
}

export class IssuePurchaseAdvanceDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ example: 2500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({
    example: 91,
    description: 'The open register session the cash came out of.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  registerSessionId?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimmed(value))
  note?: string | null;
}

export class PurchasePriceHistoryQueryDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'tomato' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimmed(value))
  q?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class ListCashMovementsQueryDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 91 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  registerSessionId?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
