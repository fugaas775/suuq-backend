import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export enum RetailStockHealthNetworkStatusFilter {
  HEALTHY = 'HEALTHY',
  LOW_STOCK = 'LOW_STOCK',
  REORDER_NOW = 'REORDER_NOW',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

export class RetailStockHealthNetworkSummaryQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 10, required: false, default: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit = 10;

  @ApiProperty({ enum: RetailStockHealthNetworkStatusFilter, required: false })
  @IsOptional()
  @IsEnum(RetailStockHealthNetworkStatusFilter)
  stockStatus?: RetailStockHealthNetworkStatusFilter;
}
