import { ApiProperty } from '@nestjs/swagger';

export class RetailStockHealthNetworkActionResponseDto {
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

export class RetailStockHealthNetworkAlertResponseDto {
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

export class RetailStockHealthNetworkBranchResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty({
    enum: ['HEALTHY', 'LOW_STOCK', 'REORDER_NOW', 'OUT_OF_STOCK'],
  })
  worstStockStatus!: 'HEALTHY' | 'LOW_STOCK' | 'REORDER_NOW' | 'OUT_OF_STOCK';

  @ApiProperty()
  worstStockStatusReason!: string;

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

  @ApiProperty({ nullable: true })
  lastUpdatedAt!: Date | null;

  @ApiProperty({ type: [RetailStockHealthNetworkActionResponseDto] })
  actions!: RetailStockHealthNetworkActionResponseDto[];
}

export class RetailStockHealthNetworkSummaryResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

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

  @ApiProperty()
  outOfStockBranchCount!: number;

  @ApiProperty()
  reorderNowBranchCount!: number;

  @ApiProperty()
  lowStockBranchCount!: number;

  @ApiProperty({ type: [RetailStockHealthNetworkAlertResponseDto] })
  alerts!: RetailStockHealthNetworkAlertResponseDto[];

  @ApiProperty({ type: [RetailStockHealthNetworkBranchResponseDto] })
  branches!: RetailStockHealthNetworkBranchResponseDto[];
}
