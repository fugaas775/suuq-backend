import { ApiProperty } from '@nestjs/swagger';
import {
  RetailAccountingActionResponseDto,
  RetailAccountingAlertResponseDto,
  RetailAccountingPriorityQueueSummaryResponseDto,
} from './retail-accounting-overview-response.dto';

export class RetailAccountingPayoutNetworkBranchResponseDto {
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
  exceptionCount!: number;

  @ApiProperty()
  autoRetryRequiredCount!: number;

  @ApiProperty()
  reconciliationRequiredCount!: number;

  @ApiProperty()
  totalAmountAtRisk!: number;

  @ApiProperty({ nullable: true })
  oldestExceptionAgeHours!: number | null;

  @ApiProperty({ type: RetailAccountingPriorityQueueSummaryResponseDto })
  priorityQueue!: RetailAccountingPriorityQueueSummaryResponseDto;

  @ApiProperty({ type: [RetailAccountingActionResponseDto] })
  actions!: RetailAccountingActionResponseDto[];
}

export class RetailAccountingPayoutNetworkSummaryResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  exceptionCount!: number;

  @ApiProperty()
  autoRetryRequiredCount!: number;

  @ApiProperty()
  reconciliationRequiredCount!: number;

  @ApiProperty()
  totalAmountAtRisk!: number;

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

  @ApiProperty({ type: [RetailAccountingPayoutNetworkBranchResponseDto] })
  branches!: RetailAccountingPayoutNetworkBranchResponseDto[];
}
