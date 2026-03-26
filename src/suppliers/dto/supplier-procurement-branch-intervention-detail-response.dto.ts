import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import { SupplierProcurementRecentOrderResponseDto } from './supplier-procurement-summary-response.dto';
import {
  SupplierProcurementTrendAppliedFiltersResponseDto,
  SupplierProcurementTrendDiscrepancyContributorResponseDto,
  SupplierProcurementTrendOrderContributorResponseDto,
} from './supplier-procurement-trend-response.dto';
import { SupplierProcurementBranchInterventionEntryResponseDto } from './supplier-procurement-branch-intervention-response.dto';

export class SupplierProcurementBranchInterventionActionResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  action!: string;

  @ApiProperty({ nullable: true })
  actorId!: number | null;

  @ApiProperty({ nullable: true })
  actorEmail!: string | null;

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty({ nullable: true })
  assigneeUserId!: number | null;

  @ApiProperty()
  createdAt!: string;
}

export class SupplierProcurementBranchInterventionDetailAppliedFiltersResponseDto {
  @ApiProperty()
  windowDays!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ enum: PurchaseOrderStatus, isArray: true })
  statuses!: PurchaseOrderStatus[];

  @ApiProperty()
  from!: string;

  @ApiProperty()
  to!: string;
}

export class SupplierProcurementBranchInterventionDetailResponseDto {
  @ApiProperty()
  generatedAt!: string;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionDetailAppliedFiltersResponseDto,
  })
  appliedFilters!: SupplierProcurementBranchInterventionDetailAppliedFiltersResponseDto;

  @ApiProperty({ type: SupplierProcurementBranchInterventionEntryResponseDto })
  intervention!: SupplierProcurementBranchInterventionEntryResponseDto;

  @ApiProperty({ type: [SupplierProcurementRecentOrderResponseDto] })
  recentOrders!: SupplierProcurementRecentOrderResponseDto[];

  @ApiProperty({ type: [SupplierProcurementTrendOrderContributorResponseDto] })
  topContributingOrders!: SupplierProcurementTrendOrderContributorResponseDto[];

  @ApiProperty({
    type: [SupplierProcurementTrendDiscrepancyContributorResponseDto],
  })
  discrepancyEvents!: SupplierProcurementTrendDiscrepancyContributorResponseDto[];

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionActionResponseDto],
  })
  recentActions!: SupplierProcurementBranchInterventionActionResponseDto[];
}
