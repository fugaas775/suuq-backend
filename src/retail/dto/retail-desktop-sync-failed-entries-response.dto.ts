import { ApiProperty } from '@nestjs/swagger';
import {
  PosSyncStatus,
  PosSyncType,
} from '../../pos-sync/entities/pos-sync-job.entity';
import { RetailDesktopWorkbenchActionResponseDto } from './retail-desktop-workbench-response.dto';

export class RetailDesktopSyncFailedEntryResponseDto {
  @ApiProperty()
  entryIndex!: number;

  @ApiProperty({ nullable: true })
  productId!: number | null;

  @ApiProperty({ nullable: true })
  aliasType!: string | null;

  @ApiProperty({ nullable: true })
  aliasValue!: string | null;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ nullable: true })
  movementType!: string | null;

  @ApiProperty({ nullable: true })
  counterpartyBranchId!: number | null;

  @ApiProperty({ nullable: true })
  transferId!: number | null;

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty()
  error!: string;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  priority!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  priorityReason!: string;

  @ApiProperty({ type: [RetailDesktopWorkbenchActionResponseDto] })
  actions!: RetailDesktopWorkbenchActionResponseDto[];
}

export class RetailDesktopSyncFailedEntriesSummaryResponseDto {
  @ApiProperty()
  jobId!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty({ enum: PosSyncType })
  syncType!: PosSyncType;

  @ApiProperty({ enum: PosSyncStatus })
  status!: PosSyncStatus;

  @ApiProperty()
  rejectedCount!: number;

  @ApiProperty()
  failedEntryCount!: number;

  @ApiProperty()
  filteredEntryCount!: number;

  @ApiProperty()
  criticalEntryCount!: number;

  @ApiProperty()
  highEntryCount!: number;

  @ApiProperty()
  normalEntryCount!: number;

  @ApiProperty()
  transferLinkedEntryCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ nullable: true })
  processedAt!: Date | null;
}

export class RetailDesktopSyncFailedEntriesResponseDto {
  @ApiProperty({ type: RetailDesktopSyncFailedEntriesSummaryResponseDto })
  summary!: RetailDesktopSyncFailedEntriesSummaryResponseDto;

  @ApiProperty({ type: [RetailDesktopWorkbenchActionResponseDto] })
  actions!: RetailDesktopWorkbenchActionResponseDto[];

  @ApiProperty({ type: [RetailDesktopSyncFailedEntryResponseDto] })
  items!: RetailDesktopSyncFailedEntryResponseDto[];
}
