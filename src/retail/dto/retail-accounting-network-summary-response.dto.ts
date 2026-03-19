import { ApiProperty } from '@nestjs/swagger';
import {
  RetailAccountingActionResponseDto,
  RetailAccountingAlertResponseDto,
  RetailAccountingPriorityQueueSummaryResponseDto,
} from './retail-accounting-overview-response.dto';

export class RetailAccountingNetworkBranchResponseDto {
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
  openCommitmentCount!: number;

  @ApiProperty()
  openCommitmentValue!: number;

  @ApiProperty()
  receivedPendingReconciliationCount!: number;

  @ApiProperty()
  discrepancyOpenCount!: number;

  @ApiProperty()
  discrepancyApprovedCount!: number;

  @ApiProperty()
  reconcileReadyCount!: number;

  @ApiProperty()
  oldestOpenCommitmentAgeHours!: number;

  @ApiProperty()
  oldestReceivedPendingReconciliationAgeHours!: number;

  @ApiProperty({ type: RetailAccountingPriorityQueueSummaryResponseDto })
  priorityQueue!: RetailAccountingPriorityQueueSummaryResponseDto;

  @ApiProperty()
  queueItemCount!: number;

  @ApiProperty({ type: [RetailAccountingActionResponseDto] })
  actions!: RetailAccountingActionResponseDto[];
}

export class RetailAccountingNetworkSummaryResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  openCommitmentCount!: number;

  @ApiProperty()
  openCommitmentValue!: number;

  @ApiProperty()
  receivedPendingReconciliationCount!: number;

  @ApiProperty()
  discrepancyOpenCount!: number;

  @ApiProperty()
  discrepancyApprovedCount!: number;

  @ApiProperty()
  reconcileReadyCount!: number;

  @ApiProperty({ type: RetailAccountingPriorityQueueSummaryResponseDto })
  priorityQueue!: RetailAccountingPriorityQueueSummaryResponseDto;

  @ApiProperty()
  criticalBranchCount!: number;

  @ApiProperty()
  highBranchCount!: number;

  @ApiProperty()
  normalBranchCount!: number;

  @ApiProperty({ type: [RetailAccountingAlertResponseDto] })
  alerts!: RetailAccountingAlertResponseDto[];

  @ApiProperty({ type: [RetailAccountingNetworkBranchResponseDto] })
  branches!: RetailAccountingNetworkBranchResponseDto[];
}
