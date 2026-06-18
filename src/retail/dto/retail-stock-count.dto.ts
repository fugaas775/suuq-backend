import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RetailStockCountLineDto {
  @ApiProperty({ example: 103 })
  @Type(() => Number)
  @IsInt()
  productId!: number;

  @ApiProperty({
    example: 12,
    minimum: 0,
    description: 'The physically counted quantity (authoritative reset).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQuantity!: number;
}

/**
 * Submit a physical / cycle count. Each line resets on-hand to countedQuantity;
 * the variance vs. the previous on-hand is logged as an ADJUSTMENT movement.
 */
export class RetailStockCountDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'CYCLE', enum: ['CYCLE', 'FULL'] })
  @IsOptional()
  @IsString()
  @IsIn(['CYCLE', 'FULL'])
  countType?: 'CYCLE' | 'FULL';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string | null;

  @ApiProperty({ type: [RetailStockCountLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => RetailStockCountLineDto)
  lines!: RetailStockCountLineDto[];
}

export class RetailStockCountsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class RetailStockCountResultLineDto {
  @ApiProperty()
  productId!: number;

  @ApiProperty()
  expectedQuantity!: number;

  @ApiProperty()
  countedQuantity!: number;

  @ApiProperty()
  variance!: number;

  @ApiProperty()
  newQuantityOnHand!: number;
}

export class RetailStockCountResponseDto {
  @ApiProperty()
  countId!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  countType!: string;

  @ApiProperty()
  countedAt!: Date;

  @ApiProperty()
  lineCount!: number;

  @ApiProperty()
  totalVariance!: number;

  @ApiProperty({ type: [RetailStockCountResultLineDto] })
  lines!: RetailStockCountResultLineDto[];
}

export class RetailStockCountSummaryDto {
  @ApiProperty()
  countId!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  countType!: string;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiProperty()
  lineCount!: number;

  @ApiProperty()
  totalVariance!: number;

  @ApiPropertyOptional({ nullable: true })
  countedByUserId!: number | null;

  @ApiProperty()
  countedAt!: Date;
}

export class RetailStockCountsHistoryResponseDto {
  @ApiProperty({ type: [RetailStockCountSummaryDto] })
  items!: RetailStockCountSummaryDto[];

  @ApiProperty()
  total!: number;
}
