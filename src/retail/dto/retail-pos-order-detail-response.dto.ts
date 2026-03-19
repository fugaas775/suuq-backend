import { ApiProperty } from '@nestjs/swagger';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../orders/entities/order.entity';
import { RetailPosExceptionQueueFilter } from './retail-pos-exceptions-query.dto';
import { RetailPosOperationsActionResponseDto } from './retail-pos-operations-response.dto';

export class RetailPosOrderDetailSummaryResponseDto {
  @ApiProperty()
  orderId!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty({ enum: RetailPosExceptionQueueFilter, nullable: true })
  queueType!: RetailPosExceptionQueueFilter | null;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'], nullable: true })
  priority!: 'CRITICAL' | 'HIGH' | 'NORMAL' | null;

  @ApiProperty({ nullable: true })
  priorityReason!: string | null;

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
  currency!: string;

  @ApiProperty()
  itemCount!: number;

  @ApiProperty()
  totalUnits!: number;

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
  proofOfDeliveryUrl!: string | null;

  @ApiProperty({ nullable: true })
  deliveryFailureReasonCode!: string | null;

  @ApiProperty({ nullable: true })
  deliveryFailureNotes!: string | null;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ nullable: true })
  customerPhoneNumber!: string | null;

  @ApiProperty({ nullable: true })
  shippingCity!: string | null;
}

export class RetailPosOrderDetailItemResponseDto {
  @ApiProperty({ nullable: true })
  productId!: number | null;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty()
  lineTotal!: number;
}

export class RetailPosOrderDetailResponseDto {
  @ApiProperty({ type: RetailPosOrderDetailSummaryResponseDto })
  summary!: RetailPosOrderDetailSummaryResponseDto;

  @ApiProperty({ type: [RetailPosOperationsActionResponseDto] })
  actions!: RetailPosOperationsActionResponseDto[];

  @ApiProperty({ type: [RetailPosOrderDetailItemResponseDto] })
  items!: RetailPosOrderDetailItemResponseDto[];
}
