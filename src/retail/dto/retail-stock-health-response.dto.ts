import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RetailStockHealthSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  totalSkus!: number;

  @ApiProperty()
  healthyCount!: number;

  @ApiProperty()
  replenishmentCandidateCount!: number;

  @ApiProperty()
  outOfStockCount!: number;

  @ApiProperty()
  negativeAvailableCount!: number;

  @ApiProperty()
  inboundOpenPoUnits!: number;

  @ApiProperty()
  committedUnits!: number;

  @ApiPropertyOptional()
  lastUpdatedAt?: Date | null;
}

export class RetailStockHealthItemResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  productId!: number;

  @ApiProperty()
  quantityOnHand!: number;

  @ApiProperty()
  reservedQuantity!: number;

  @ApiProperty()
  reservedOnline!: number;

  @ApiProperty()
  reservedStoreOps!: number;

  @ApiProperty()
  inboundOpenPo!: number;

  @ApiProperty()
  outboundTransfers!: number;

  @ApiProperty()
  safetyStock!: number;

  @ApiProperty()
  availableToSell!: number;

  @ApiProperty()
  shortageToSafetyStock!: number;

  @ApiProperty({
    enum: ['HEALTHY', 'LOW_STOCK', 'REORDER_NOW', 'OUT_OF_STOCK'],
  })
  stockStatus!: 'HEALTHY' | 'LOW_STOCK' | 'REORDER_NOW' | 'OUT_OF_STOCK';

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional()
  lastReceivedAt?: Date | null;

  @ApiPropertyOptional()
  lastPurchaseOrderId?: number | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class RetailStockHealthResponseDto {
  @ApiProperty({ type: RetailStockHealthSummaryResponseDto })
  summary!: RetailStockHealthSummaryResponseDto;

  @ApiProperty({ type: [RetailStockHealthItemResponseDto] })
  items!: RetailStockHealthItemResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
