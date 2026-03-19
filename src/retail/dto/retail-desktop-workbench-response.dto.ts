import { ApiProperty } from '@nestjs/swagger';
import { BranchTransferStatus } from '../../branches/entities/branch-transfer.entity';
import { StockMovementType } from '../../branches/entities/stock-movement.entity';
import {
  PosSyncStatus,
  PosSyncType,
} from '../../pos-sync/entities/pos-sync-job.entity';

export class RetailDesktopWorkbenchActionResponseDto {
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

export class RetailDesktopWorkbenchAlertResponseDto {
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

export class RetailDesktopWorkbenchSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

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

  @ApiProperty({ nullable: true })
  lastProcessedPosSyncAt!: Date | null;
}

export class RetailDesktopWorkbenchSyncJobResponseDto {
  @ApiProperty()
  jobId!: number;

  @ApiProperty({ enum: PosSyncType })
  syncType!: PosSyncType;

  @ApiProperty({ enum: PosSyncStatus })
  status!: PosSyncStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ nullable: true })
  processedAt!: Date | null;

  @ApiProperty()
  rejectedCount!: number;

  @ApiProperty()
  failedEntryCount!: number;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  priority!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  priorityReason!: string;

  @ApiProperty({ type: [RetailDesktopWorkbenchActionResponseDto] })
  actions!: RetailDesktopWorkbenchActionResponseDto[];
}

export class RetailDesktopWorkbenchTransferResponseDto {
  @ApiProperty()
  transferId!: number;

  @ApiProperty()
  transferNumber!: string;

  @ApiProperty({ enum: ['INBOUND', 'OUTBOUND'] })
  direction!: 'INBOUND' | 'OUTBOUND';

  @ApiProperty({ enum: BranchTransferStatus })
  status!: BranchTransferStatus;

  @ApiProperty()
  totalUnits!: number;

  @ApiProperty()
  ageHours!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  priority!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  priorityReason!: string;

  @ApiProperty({ type: [RetailDesktopWorkbenchActionResponseDto] })
  actions!: RetailDesktopWorkbenchActionResponseDto[];
}

export class RetailDesktopWorkbenchStockExceptionResponseDto {
  @ApiProperty()
  movementId!: number;

  @ApiProperty({ enum: StockMovementType })
  movementType!: StockMovementType;

  @ApiProperty()
  quantityDelta!: number;

  @ApiProperty()
  sourceType!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  priority!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  priorityReason!: string;

  @ApiProperty({ type: [RetailDesktopWorkbenchActionResponseDto] })
  actions!: RetailDesktopWorkbenchActionResponseDto[];
}

export class RetailDesktopWorkbenchResponseDto {
  @ApiProperty({ type: RetailDesktopWorkbenchSummaryResponseDto })
  summary!: RetailDesktopWorkbenchSummaryResponseDto;

  @ApiProperty({ type: [RetailDesktopWorkbenchAlertResponseDto] })
  alerts!: RetailDesktopWorkbenchAlertResponseDto[];

  @ApiProperty({ type: [RetailDesktopWorkbenchSyncJobResponseDto] })
  syncQueue!: RetailDesktopWorkbenchSyncJobResponseDto[];

  @ApiProperty({ type: [RetailDesktopWorkbenchTransferResponseDto] })
  transferQueue!: RetailDesktopWorkbenchTransferResponseDto[];

  @ApiProperty({ type: [RetailDesktopWorkbenchStockExceptionResponseDto] })
  stockExceptions!: RetailDesktopWorkbenchStockExceptionResponseDto[];
}
