import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import { SupplierOnboardingStatus } from '../entities/supplier-profile.entity';

export class SupplierProcurementScorecardBreakdownResponseDto {
  @ApiProperty()
  fillRateScore!: number;

  @ApiProperty()
  acknowledgementScore!: number;

  @ApiProperty()
  shipmentScore!: number;

  @ApiProperty()
  receiptAcknowledgementScore!: number;

  @ApiProperty()
  discrepancyScore!: number;

  @ApiProperty()
  discrepancyPenalty!: number;
}

export class SupplierProcurementScorecardEntryResponseDto {
  @ApiProperty()
  supplierProfileId!: number;

  @ApiProperty()
  companyName!: string;

  @ApiProperty({ enum: SupplierOnboardingStatus })
  onboardingStatus!: SupplierOnboardingStatus;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  procurementScore!: number;

  @ApiProperty({ type: SupplierProcurementScorecardBreakdownResponseDto })
  scoreBreakdown!: SupplierProcurementScorecardBreakdownResponseDto;

  @ApiProperty()
  totalOrders!: number;

  @ApiProperty()
  activeOrderCount!: number;

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

export class SupplierProcurementScorecardAppliedFiltersResponseDto {
  @ApiProperty()
  includeInactive!: boolean;

  @ApiProperty({ enum: SupplierOnboardingStatus, nullable: true })
  onboardingStatus!: SupplierOnboardingStatus | null;

  @ApiProperty({ type: [Number] })
  supplierProfileIds!: number[];

  @ApiProperty({ type: [Number] })
  branchIds!: number[];

  @ApiProperty({ enum: PurchaseOrderStatus, isArray: true })
  statuses!: PurchaseOrderStatus[];

  @ApiProperty()
  from!: string;

  @ApiProperty({ nullable: true })
  to!: string | null;
}

export class SupplierProcurementScorecardResponseDto {
  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  windowDays!: number;

  @ApiProperty()
  totalSuppliersEvaluated!: number;

  @ApiProperty({ type: SupplierProcurementScorecardAppliedFiltersResponseDto })
  appliedFilters!: SupplierProcurementScorecardAppliedFiltersResponseDto;

  @ApiProperty({
    type: [SupplierProcurementScorecardEntryResponseDto],
  })
  rankedSuppliers!: SupplierProcurementScorecardEntryResponseDto[];
}
