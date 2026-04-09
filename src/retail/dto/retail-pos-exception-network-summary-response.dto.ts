import { ApiProperty } from '@nestjs/swagger';
import {
  RetailPosOperationsActionResponseDto,
  RetailPosOperationsAlertResponseDto,
} from './retail-pos-operations-response.dto';

export class RetailPosExceptionNetworkBranchResponseDto {
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
  failedPaymentCount!: number;

  @ApiProperty()
  paymentReviewCount!: number;

  @ApiProperty()
  delayedFulfillmentCount!: number;

  @ApiProperty()
  criticalCount!: number;

  @ApiProperty()
  highCount!: number;

  @ApiProperty()
  normalCount!: number;

  @ApiProperty({ nullable: true })
  oldestExceptionAgeHours!: number | null;

  @ApiProperty({ nullable: true })
  lastOrderAt!: Date | null;

  @ApiProperty({ type: [RetailPosOperationsActionResponseDto] })
  actions!: RetailPosOperationsActionResponseDto[];
}

export class RetailPosExceptionNetworkSummaryResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  matchedBranchCount!: number;

  @ApiProperty()
  visibleBranchCount!: number;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  totalExceptionCount!: number;

  @ApiProperty()
  totalFailedPaymentCount!: number;

  @ApiProperty()
  totalPaymentReviewCount!: number;

  @ApiProperty()
  totalDelayedFulfillmentCount!: number;

  @ApiProperty()
  criticalBranchCount!: number;

  @ApiProperty()
  highBranchCount!: number;

  @ApiProperty()
  normalBranchCount!: number;

  @ApiProperty({ type: [RetailPosOperationsAlertResponseDto] })
  alerts!: RetailPosOperationsAlertResponseDto[];

  @ApiProperty({ type: [RetailPosExceptionNetworkBranchResponseDto] })
  branches!: RetailPosExceptionNetworkBranchResponseDto[];
}
