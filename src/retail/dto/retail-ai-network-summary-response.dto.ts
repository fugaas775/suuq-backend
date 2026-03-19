import { ApiProperty } from '@nestjs/swagger';

export class RetailAiNetworkActionResponseDto {
  @ApiProperty()
  type!: string;

  @ApiProperty()
  method!: string;

  @ApiProperty()
  path!: string;

  @ApiProperty({ type: Object, nullable: true })
  body!: Record<string, any> | null;

  @ApiProperty()
  enabled!: boolean;
}

export class RetailAiNetworkAlertResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: ['INFO', 'WATCH', 'CRITICAL'] })
  severity!: 'INFO' | 'WATCH' | 'CRITICAL';

  @ApiProperty()
  title!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ nullable: true })
  metric!: number | null;

  @ApiProperty({ nullable: true })
  action!: string | null;
}

export class RetailAiNetworkBranchResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty()
  healthScore!: number;

  @ApiProperty({ enum: ['INFO', 'WATCH', 'CRITICAL'] })
  highestSeverity!: 'INFO' | 'WATCH' | 'CRITICAL';

  @ApiProperty()
  highestSeverityReason!: string;

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
  staleOpenPurchaseOrderCount!: number;

  @ApiProperty()
  blockedAutoSubmitDraftCount!: number;

  @ApiProperty({ type: [String] })
  topInsightCodes!: string[];

  @ApiProperty({ type: [RetailAiNetworkActionResponseDto] })
  actions!: RetailAiNetworkActionResponseDto[];
}

export class RetailAiNetworkSummaryResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  averageHealthScore!: number;

  @ApiProperty()
  criticalBranchCount!: number;

  @ApiProperty()
  watchBranchCount!: number;

  @ApiProperty()
  infoBranchCount!: number;

  @ApiProperty()
  totalAtRiskSkus!: number;

  @ApiProperty()
  totalOutOfStockSkus!: number;

  @ApiProperty()
  totalNegativeAvailableSkus!: number;

  @ApiProperty()
  totalStaleOpenPurchaseOrderCount!: number;

  @ApiProperty()
  totalBlockedAutoSubmitDraftCount!: number;

  @ApiProperty({ type: [RetailAiNetworkAlertResponseDto] })
  alerts!: RetailAiNetworkAlertResponseDto[];

  @ApiProperty({ type: [RetailAiNetworkBranchResponseDto] })
  branches!: RetailAiNetworkBranchResponseDto[];
}
