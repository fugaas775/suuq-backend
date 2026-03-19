import { ApiProperty } from '@nestjs/swagger';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../orders/entities/order.entity';
import { RetailPosExceptionQueueFilter } from './retail-pos-exceptions-query.dto';
import { RetailPosOperationsActionResponseDto } from './retail-pos-operations-response.dto';

export class RetailPosExceptionsSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  totalExceptionCount!: number;

  @ApiProperty()
  filteredExceptionCount!: number;

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
  lastOrderAt!: Date | null;
}

export class RetailPosExceptionItemResponseDto {
  @ApiProperty()
  orderId!: number;

  @ApiProperty({ enum: RetailPosExceptionQueueFilter })
  queueType!: RetailPosExceptionQueueFilter;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  priority!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  priorityReason!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus;

  @ApiProperty({ nullable: true })
  paymentProofStatus!: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | null;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  itemCount!: number;

  @ApiProperty()
  ageHours!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ nullable: true })
  deliveryAssignedAt!: Date | null;

  @ApiProperty({ nullable: true })
  outForDeliveryAt!: Date | null;

  @ApiProperty({ nullable: true })
  deliveryResolvedAt!: Date | null;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ nullable: true })
  customerPhoneNumber!: string | null;

  @ApiProperty({ type: [RetailPosOperationsActionResponseDto] })
  actions!: RetailPosOperationsActionResponseDto[];
}

export class RetailPosExceptionsResponseDto {
  @ApiProperty({ type: RetailPosExceptionsSummaryResponseDto })
  summary!: RetailPosExceptionsSummaryResponseDto;

  @ApiProperty({ type: [RetailPosOperationsActionResponseDto] })
  actions!: RetailPosOperationsActionResponseDto[];

  @ApiProperty({ type: [RetailPosExceptionItemResponseDto] })
  items!: RetailPosExceptionItemResponseDto[];
}
