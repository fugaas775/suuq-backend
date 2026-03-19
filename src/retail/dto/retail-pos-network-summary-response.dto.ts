import { ApiProperty } from '@nestjs/swagger';
import {
  RetailPosOperationsActionResponseDto,
  RetailPosOperationsAlertResponseDto,
} from './retail-pos-operations-response.dto';

export class RetailPosNetworkSummaryBranchResponseDto {
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
  orderCount!: number;

  @ApiProperty()
  grossSales!: number;

  @ApiProperty()
  paidSales!: number;

  @ApiProperty()
  averageOrderValue!: number;

  @ApiProperty()
  unpaidOrderCount!: number;

  @ApiProperty()
  failedPaymentOrderCount!: number;

  @ApiProperty()
  delayedFulfillmentOrderCount!: number;

  @ApiProperty()
  activeStaffCount!: number;

  @ApiProperty({ nullable: true })
  lastOrderAt!: Date | null;

  @ApiProperty({ type: [RetailPosOperationsActionResponseDto] })
  actions!: RetailPosOperationsActionResponseDto[];
}

export class RetailPosNetworkSummaryResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  totalOrderCount!: number;

  @ApiProperty()
  totalGrossSales!: number;

  @ApiProperty()
  totalPaidSales!: number;

  @ApiProperty()
  totalUnpaidOrderCount!: number;

  @ApiProperty()
  totalFailedPaymentOrderCount!: number;

  @ApiProperty()
  totalDelayedFulfillmentOrderCount!: number;

  @ApiProperty()
  criticalBranchCount!: number;

  @ApiProperty()
  highBranchCount!: number;

  @ApiProperty()
  normalBranchCount!: number;

  @ApiProperty({ type: [RetailPosOperationsAlertResponseDto] })
  alerts!: RetailPosOperationsAlertResponseDto[];

  @ApiProperty({ type: [RetailPosNetworkSummaryBranchResponseDto] })
  branches!: RetailPosNetworkSummaryBranchResponseDto[];
}
