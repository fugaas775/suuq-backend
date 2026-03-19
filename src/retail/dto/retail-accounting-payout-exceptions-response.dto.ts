import { ApiProperty } from '@nestjs/swagger';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../orders/entities/order.entity';
import {
  PayoutProvider,
  PayoutStatus,
} from '../../wallet/entities/payout-log.entity';
import { RetailAccountingPayoutExceptionTypeFilter } from './retail-accounting-payout-exceptions-query.dto';
import {
  RetailAccountingActionResponseDto,
  RetailAccountingAlertResponseDto,
} from './retail-accounting-overview-response.dto';

export class RetailAccountingPayoutExceptionsSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  totalExceptionCount!: number;

  @ApiProperty()
  filteredExceptionCount!: number;

  @ApiProperty()
  autoRetryRequiredCount!: number;

  @ApiProperty()
  reconciliationRequiredCount!: number;

  @ApiProperty()
  criticalCount!: number;

  @ApiProperty()
  highCount!: number;

  @ApiProperty()
  normalCount!: number;

  @ApiProperty()
  totalAmountAtRisk!: number;

  @ApiProperty({ nullable: true })
  lastPayoutAt!: Date | null;
}

export class RetailAccountingPayoutExceptionItemResponseDto {
  @ApiProperty()
  payoutLogId!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  orderId!: number;

  @ApiProperty()
  orderItemId!: number;

  @ApiProperty({ enum: RetailAccountingPayoutExceptionTypeFilter })
  exceptionType!: RetailAccountingPayoutExceptionTypeFilter;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  priority!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  priorityReason!: string;

  @ApiProperty({ enum: PayoutProvider })
  provider!: PayoutProvider;

  @ApiProperty({ enum: PayoutStatus })
  payoutStatus!: PayoutStatus;

  @ApiProperty({ enum: OrderStatus })
  orderStatus!: OrderStatus;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  vendorId!: number;

  @ApiProperty()
  vendorName!: string;

  @ApiProperty({ nullable: true })
  vendorPhoneNumber!: string | null;

  @ApiProperty({ nullable: true })
  failureReason!: string | null;

  @ApiProperty()
  ageHours!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: [RetailAccountingActionResponseDto] })
  actions!: RetailAccountingActionResponseDto[];
}

export class RetailAccountingPayoutExceptionsResponseDto {
  @ApiProperty({ type: RetailAccountingPayoutExceptionsSummaryResponseDto })
  summary!: RetailAccountingPayoutExceptionsSummaryResponseDto;

  @ApiProperty({ type: [RetailAccountingAlertResponseDto] })
  alerts!: RetailAccountingAlertResponseDto[];

  @ApiProperty({ type: [RetailAccountingPayoutExceptionItemResponseDto] })
  items!: RetailAccountingPayoutExceptionItemResponseDto[];
}
