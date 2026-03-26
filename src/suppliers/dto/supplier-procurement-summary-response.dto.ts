import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import { PurchaseOrderReceiptDiscrepancyStatus } from '../../purchase-orders/entities/purchase-order-receipt-event.entity';
import { SupplierOnboardingStatus } from '../entities/supplier-profile.entity';

export class SupplierProcurementStatusCountResponseDto {
  @ApiProperty({ enum: PurchaseOrderStatus })
  status!: PurchaseOrderStatus;

  @ApiProperty()
  count!: number;
}

export class SupplierProcurementSlaResponseDto {
  @ApiProperty()
  averageAcknowledgementHours!: number;

  @ApiProperty()
  averageShipmentLatencyHours!: number;

  @ApiProperty()
  averageReceiptAcknowledgementHours!: number;

  @ApiProperty()
  fillRatePercent!: number;

  @ApiProperty()
  shortageRatePercent!: number;

  @ApiProperty()
  damageRatePercent!: number;
}

export class SupplierProcurementWorkQueueResponseDto {
  @ApiProperty()
  pendingAcknowledgementCount!: number;

  @ApiProperty()
  pendingShipmentCount!: number;

  @ApiProperty()
  pendingReceiptAcknowledgementCount!: number;

  @ApiProperty()
  openDiscrepancyCount!: number;

  @ApiProperty()
  awaitingApprovalDiscrepancyCount!: number;
}

export class SupplierProcurementRecentOrderResponseDto {
  @ApiProperty()
  purchaseOrderId!: number;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty({ enum: PurchaseOrderStatus })
  status!: PurchaseOrderStatus;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ nullable: true })
  expectedDeliveryDate!: string | null;

  @ApiProperty({ nullable: true })
  submittedAt!: Date | null;

  @ApiProperty({ nullable: true })
  acknowledgedAt!: Date | null;

  @ApiProperty({ nullable: true })
  shippedAt!: Date | null;

  @ApiProperty({ nullable: true })
  receivedAt!: Date | null;

  @ApiProperty()
  pendingReceiptAcknowledgementCount!: number;

  @ApiProperty()
  openDiscrepancyCount!: number;

  @ApiProperty()
  awaitingApprovalDiscrepancyCount!: number;

  @ApiProperty({ nullable: true })
  acknowledgementHours!: number | null;

  @ApiProperty({ nullable: true })
  shipmentLatencyHours!: number | null;
}

export class SupplierProcurementSummaryResponseDto {
  @ApiProperty()
  supplierProfileId!: number;

  @ApiProperty()
  companyName!: string;

  @ApiProperty({ enum: SupplierOnboardingStatus })
  onboardingStatus!: SupplierOnboardingStatus;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  windowDays!: number;

  @ApiProperty()
  totalOrders!: number;

  @ApiProperty()
  activeOrderCount!: number;

  @ApiProperty({ type: [SupplierProcurementStatusCountResponseDto] })
  statusCounts!: SupplierProcurementStatusCountResponseDto[];

  @ApiProperty({ type: SupplierProcurementWorkQueueResponseDto })
  workQueues!: SupplierProcurementWorkQueueResponseDto;

  @ApiProperty({ type: SupplierProcurementSlaResponseDto })
  sla!: SupplierProcurementSlaResponseDto;

  @ApiProperty({ type: [SupplierProcurementRecentOrderResponseDto] })
  recentOrders!: SupplierProcurementRecentOrderResponseDto[];
}
