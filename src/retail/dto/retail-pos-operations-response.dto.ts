import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PaymentMethod } from '../../orders/entities/order.entity';

export class RetailPosOperationsActionResponseDto {
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

export class RetailPosOperationsAlertResponseDto {
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

export class RetailPosOperationsSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  orderCount!: number;

  @ApiProperty()
  grossSales!: number;

  @ApiProperty()
  paidSales!: number;

  @ApiProperty()
  averageOrderValue!: number;

  @ApiProperty()
  paidOrderCount!: number;

  @ApiProperty()
  unpaidOrderCount!: number;

  @ApiProperty()
  failedPaymentOrderCount!: number;

  @ApiProperty()
  openOrderCount!: number;

  @ApiProperty()
  delayedFulfillmentOrderCount!: number;

  @ApiProperty()
  deliveredOrderCount!: number;

  @ApiProperty()
  cancelledOrderCount!: number;

  @ApiProperty()
  activeStaffCount!: number;

  @ApiProperty()
  managerCount!: number;

  @ApiProperty()
  operatorCount!: number;

  @ApiProperty({ nullable: true })
  lastOrderAt!: Date | null;
}

export class RetailPosOperationsPaymentMixResponseDto {
  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty()
  orderCount!: number;

  @ApiProperty()
  grossSales!: number;

  @ApiProperty()
  paidOrderCount!: number;
}

export class RetailPosOperationsStatusMixResponseDto {
  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty()
  orderCount!: number;

  @ApiProperty()
  grossSales!: number;
}

export class RetailPosOperationsTopItemResponseDto {
  @ApiProperty({ nullable: true })
  productId!: number | null;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  grossSales!: number;
}

export class RetailPosOperationsResponseDto {
  @ApiProperty({ type: RetailPosOperationsSummaryResponseDto })
  summary!: RetailPosOperationsSummaryResponseDto;

  @ApiProperty({ type: [RetailPosOperationsAlertResponseDto] })
  alerts!: RetailPosOperationsAlertResponseDto[];

  @ApiProperty({ type: [RetailPosOperationsPaymentMixResponseDto] })
  paymentMix!: RetailPosOperationsPaymentMixResponseDto[];

  @ApiProperty({ type: [RetailPosOperationsStatusMixResponseDto] })
  statusMix!: RetailPosOperationsStatusMixResponseDto[];

  @ApiProperty({ type: [RetailPosOperationsTopItemResponseDto] })
  topItems!: RetailPosOperationsTopItemResponseDto[];
}
