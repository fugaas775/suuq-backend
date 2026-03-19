import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RetailAiInsightSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  generatedAt!: Date;

  @ApiProperty()
  healthScore!: number;

  @ApiProperty()
  totalSkus!: number;

  @ApiProperty()
  atRiskSkus!: number;

  @ApiProperty()
  outOfStockSkus!: number;

  @ApiProperty()
  negativeAvailableSkus!: number;

  @ApiProperty()
  inboundOpenPoUnits!: number;

  @ApiProperty()
  openPurchaseOrderCount!: number;

  @ApiProperty()
  openPurchaseOrderValue!: number;

  @ApiProperty()
  staleOpenPurchaseOrderCount!: number;

  @ApiProperty()
  blockedAutoSubmitDraftCount!: number;
}

export class RetailAiInsightCardResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: ['INFO', 'WATCH', 'CRITICAL'] })
  severity!: 'INFO' | 'WATCH' | 'CRITICAL';

  @ApiProperty()
  title!: string;

  @ApiProperty()
  summary!: string;

  @ApiPropertyOptional()
  metric?: number | null;

  @ApiPropertyOptional()
  action?: string | null;
}

export class RetailAiProductRiskResponseDto {
  @ApiProperty()
  productId!: number;

  @ApiProperty({
    enum: ['HEALTHY', 'LOW_STOCK', 'REORDER_NOW', 'OUT_OF_STOCK'],
  })
  stockStatus!: 'HEALTHY' | 'LOW_STOCK' | 'REORDER_NOW' | 'OUT_OF_STOCK';

  @ApiProperty()
  availableToSell!: number;

  @ApiProperty()
  safetyStock!: number;

  @ApiProperty()
  inboundOpenPo!: number;

  @ApiProperty()
  shortageToSafetyStock!: number;

  @ApiProperty()
  riskScore!: number;

  @ApiProperty()
  recommendedReorderUnits!: number;

  @ApiPropertyOptional()
  lastReceivedAt?: Date | null;

  @ApiPropertyOptional()
  lastPurchaseOrderId?: number | null;
}

export class RetailAiInsightsResponseDto {
  @ApiProperty({ type: RetailAiInsightSummaryResponseDto })
  summary!: RetailAiInsightSummaryResponseDto;

  @ApiProperty({ type: [RetailAiInsightCardResponseDto] })
  insights!: RetailAiInsightCardResponseDto[];

  @ApiProperty({ type: [RetailAiProductRiskResponseDto] })
  productRisks!: RetailAiProductRiskResponseDto[];
}
