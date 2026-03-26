import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderReceiptDiscrepancyStatus } from '../../purchase-orders/entities/purchase-order-receipt-event.entity';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import { SupplierOnboardingStatus } from '../entities/supplier-profile.entity';
import { SupplierProcurementScorecardBreakdownResponseDto } from './supplier-procurement-scorecard-response.dto';

export class SupplierProcurementTrendOrderContributorResponseDto {
  @ApiProperty()
  purchaseOrderId!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ enum: PurchaseOrderStatus })
  status!: PurchaseOrderStatus;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  impactScore!: number;

  @ApiProperty()
  fillRatePercent!: number;

  @ApiProperty()
  shortageQuantity!: number;

  @ApiProperty()
  damagedQuantity!: number;

  @ApiProperty({ nullable: true })
  acknowledgementHours!: number | null;

  @ApiProperty({ nullable: true })
  shipmentLatencyHours!: number | null;

  @ApiProperty()
  dominantIssue!: string;
}

export class SupplierProcurementTrendDiscrepancyContributorResponseDto {
  @ApiProperty()
  receiptEventId!: number;

  @ApiProperty()
  purchaseOrderId!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ enum: PurchaseOrderReceiptDiscrepancyStatus, nullable: true })
  discrepancyStatus!: PurchaseOrderReceiptDiscrepancyStatus | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  impactScore!: number;

  @ApiProperty()
  shortageQuantity!: number;

  @ApiProperty()
  damagedQuantity!: number;

  @ApiProperty({ nullable: true })
  supplierAcknowledgedAt!: string | null;

  @ApiProperty({ nullable: true })
  note!: string | null;
}

export class SupplierProcurementTrendWindowResponseDto {
  @ApiProperty()
  windowDays!: number;

  @ApiProperty()
  procurementScore!: number;

  @ApiProperty({ type: SupplierProcurementScorecardBreakdownResponseDto })
  scoreBreakdown!: SupplierProcurementScorecardBreakdownResponseDto;

  @ApiProperty()
  totalOrders!: number;

  @ApiProperty()
  activeOrderCount!: number;

  @ApiProperty()
  fillRatePercent!: number;

  @ApiProperty()
  averageAcknowledgementHours!: number;

  @ApiProperty()
  averageShipmentLatencyHours!: number;

  @ApiProperty()
  averageReceiptAcknowledgementHours!: number;

  @ApiProperty()
  pendingAcknowledgementCount!: number;

  @ApiProperty()
  pendingShipmentCount!: number;

  @ApiProperty()
  pendingReceiptAcknowledgementCount!: number;

  @ApiProperty()
  openDiscrepancyCount!: number;
}

export class SupplierProcurementTrendBranchBucketResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty()
  procurementScore!: number;

  @ApiProperty({ enum: ['IMPROVING', 'STABLE', 'WORSENING'] })
  trendDirection!: 'IMPROVING' | 'STABLE' | 'WORSENING';

  @ApiProperty()
  scoreDeltaFrom90d!: number;

  @ApiProperty()
  fillRateDeltaFrom90d!: number;

  @ApiProperty()
  impactScore!: number;

  @ApiProperty()
  impactSharePercent!: number;

  @ApiProperty()
  orderCount!: number;

  @ApiProperty()
  discrepancyEventCount!: number;

  @ApiProperty()
  openDiscrepancyCount!: number;

  @ApiProperty()
  fillRatePercent!: number;

  @ApiProperty()
  averageAcknowledgementHours!: number;

  @ApiProperty()
  averageShipmentLatencyHours!: number;

  @ApiProperty()
  averageReceiptAcknowledgementHours!: number;
}

export class SupplierProcurementTrendAppliedFiltersResponseDto {
  @ApiProperty({ type: [Number] })
  branchIds!: number[];

  @ApiProperty({ enum: PurchaseOrderStatus, isArray: true })
  statuses!: PurchaseOrderStatus[];

  @ApiProperty()
  asOf!: string;
}

export class SupplierProcurementTrendResponseDto {
  @ApiProperty()
  supplierProfileId!: number;

  @ApiProperty()
  companyName!: string;

  @ApiProperty({ enum: SupplierOnboardingStatus })
  onboardingStatus!: SupplierOnboardingStatus;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  asOf!: string;

  @ApiProperty({ enum: ['IMPROVING', 'STABLE', 'WORSENING'] })
  trendDirection!: 'IMPROVING' | 'STABLE' | 'WORSENING';

  @ApiProperty()
  scoreDeltaFrom90d!: number;

  @ApiProperty()
  fillRateDeltaFrom90d!: number;

  @ApiProperty({ type: SupplierProcurementTrendAppliedFiltersResponseDto })
  appliedFilters!: SupplierProcurementTrendAppliedFiltersResponseDto;

  @ApiProperty({ type: [SupplierProcurementTrendWindowResponseDto] })
  windows!: SupplierProcurementTrendWindowResponseDto[];

  @ApiProperty({ type: [SupplierProcurementTrendBranchBucketResponseDto] })
  branchBuckets!: SupplierProcurementTrendBranchBucketResponseDto[];

  @ApiProperty({ type: [SupplierProcurementTrendOrderContributorResponseDto] })
  topContributingOrders!: SupplierProcurementTrendOrderContributorResponseDto[];

  @ApiProperty({
    type: [SupplierProcurementTrendDiscrepancyContributorResponseDto],
  })
  topDiscrepancyEvents!: SupplierProcurementTrendDiscrepancyContributorResponseDto[];
}
