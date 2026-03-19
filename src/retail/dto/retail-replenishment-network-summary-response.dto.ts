import { ApiProperty } from '@nestjs/swagger';
import { RetailReplenishmentBlockedReasonCountResponseDto } from './retail-replenishment-review-response.dto';

export class RetailReplenishmentNetworkActionResponseDto {
  @ApiProperty()
  type!: string;

  @ApiProperty()
  method!: string;

  @ApiProperty()
  path!: string;

  @ApiProperty({ type: Object, nullable: true })
  query!: Record<string, string | number | boolean> | null;

  @ApiProperty()
  enabled!: boolean;
}

export class RetailReplenishmentNetworkAlertResponseDto {
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

export class RetailReplenishmentNetworkBranchResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  highestPriority!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  highestPriorityReason!: string;

  @ApiProperty()
  totalDrafts!: number;

  @ApiProperty()
  staleDraftCount!: number;

  @ApiProperty()
  totalDraftValue!: number;

  @ApiProperty()
  supplierCount!: number;

  @ApiProperty()
  autoSubmitDraftCount!: number;

  @ApiProperty()
  blockedAutoSubmitDraftCount!: number;

  @ApiProperty()
  readyAutoSubmitDraftCount!: number;

  @ApiProperty({ type: [RetailReplenishmentBlockedReasonCountResponseDto] })
  blockedReasonBreakdown!: RetailReplenishmentBlockedReasonCountResponseDto[];

  @ApiProperty({ type: [RetailReplenishmentNetworkActionResponseDto] })
  actions!: RetailReplenishmentNetworkActionResponseDto[];
}

export class RetailReplenishmentNetworkSummaryResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  totalDrafts!: number;

  @ApiProperty()
  staleDraftCount!: number;

  @ApiProperty()
  totalDraftValue!: number;

  @ApiProperty()
  supplierCount!: number;

  @ApiProperty()
  autoSubmitDraftCount!: number;

  @ApiProperty()
  blockedAutoSubmitDraftCount!: number;

  @ApiProperty()
  readyAutoSubmitDraftCount!: number;

  @ApiProperty()
  criticalBranchCount!: number;

  @ApiProperty()
  highBranchCount!: number;

  @ApiProperty()
  normalBranchCount!: number;

  @ApiProperty({ type: [RetailReplenishmentNetworkAlertResponseDto] })
  alerts!: RetailReplenishmentNetworkAlertResponseDto[];

  @ApiProperty({ type: [RetailReplenishmentNetworkBranchResponseDto] })
  branches!: RetailReplenishmentNetworkBranchResponseDto[];
}
