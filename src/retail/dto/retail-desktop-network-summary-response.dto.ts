import { ApiProperty } from '@nestjs/swagger';
import {
  RetailDesktopWorkbenchActionResponseDto,
  RetailDesktopWorkbenchAlertResponseDto,
} from './retail-desktop-workbench-response.dto';

export class RetailDesktopNetworkSummaryBranchResponseDto {
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
  failedPosSyncJobCount!: number;

  @ApiProperty()
  openPosSyncJobCount!: number;

  @ApiProperty()
  rejectedSyncEntryCount!: number;

  @ApiProperty()
  pendingTransferCount!: number;

  @ApiProperty()
  inboundTransferPendingCount!: number;

  @ApiProperty()
  outboundTransferPendingCount!: number;

  @ApiProperty()
  negativeAdjustmentCount!: number;

  @ApiProperty()
  totalNegativeAdjustmentUnits!: number;

  @ApiProperty({ nullable: true })
  oldestTransferAgeHours!: number | null;

  @ApiProperty({ nullable: true })
  lastProcessedPosSyncAt!: Date | null;

  @ApiProperty({ type: [RetailDesktopWorkbenchActionResponseDto] })
  actions!: RetailDesktopWorkbenchActionResponseDto[];
}

export class RetailDesktopNetworkSummaryResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  failedPosSyncJobCount!: number;

  @ApiProperty()
  openPosSyncJobCount!: number;

  @ApiProperty()
  rejectedSyncEntryCount!: number;

  @ApiProperty()
  pendingTransferCount!: number;

  @ApiProperty()
  inboundTransferPendingCount!: number;

  @ApiProperty()
  outboundTransferPendingCount!: number;

  @ApiProperty()
  negativeAdjustmentCount!: number;

  @ApiProperty()
  totalNegativeAdjustmentUnits!: number;

  @ApiProperty()
  criticalBranchCount!: number;

  @ApiProperty()
  highBranchCount!: number;

  @ApiProperty()
  normalBranchCount!: number;

  @ApiProperty({ type: [RetailDesktopWorkbenchAlertResponseDto] })
  alerts!: RetailDesktopWorkbenchAlertResponseDto[];

  @ApiProperty({ type: [RetailDesktopNetworkSummaryBranchResponseDto] })
  branches!: RetailDesktopNetworkSummaryBranchResponseDto[];
}
