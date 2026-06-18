import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';

/**
 * Manual stock adjustment (waste / shrinkage / found stock). A signed
 * quantityDelta is applied to on-hand and logged as an ADJUSTMENT movement; the
 * resulting on-hand must not go negative (the ledger rejects it).
 */
export class RetailStockAdjustmentDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ example: 103 })
  @Type(() => Number)
  @IsInt()
  productId!: number;

  @ApiProperty({
    example: -3,
    description:
      'Signed change to on-hand. Negative for waste/shrinkage, positive for found stock. Must not be 0.',
  })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  quantityDelta!: number;

  @ApiProperty({
    example: 'WASTE',
    description:
      'Reason code (e.g. WASTE, DAMAGE, THEFT, SHRINKAGE, RECOUNT, CORRECTION).',
  })
  @IsString()
  @MaxLength(48)
  reason!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string | null;
}

export class RetailStockAdjustmentsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 103 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class RetailStockAdjustmentResponseDto {
  @ApiProperty()
  adjustmentId!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  productId!: number;

  @ApiProperty()
  previousQuantity!: number;

  @ApiProperty()
  quantityDelta!: number;

  @ApiProperty()
  newQuantity!: number;

  @ApiProperty()
  reason!: string;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ nullable: true })
  adjustedByUserId!: number | null;

  @ApiProperty()
  adjustedAt!: Date;
}

export class RetailStockAdjustmentHistoryItemDto {
  @ApiProperty()
  adjustmentId!: number;

  @ApiProperty()
  productId!: number;

  @ApiProperty()
  quantityDelta!: number;

  @ApiProperty()
  reason!: string;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ nullable: true })
  adjustedByUserId!: number | null;

  @ApiProperty()
  adjustedAt!: Date;
}

export class RetailStockAdjustmentHistoryResponseDto {
  @ApiProperty({ type: [RetailStockAdjustmentHistoryItemDto] })
  items!: RetailStockAdjustmentHistoryItemDto[];

  @ApiProperty()
  total!: number;
}
