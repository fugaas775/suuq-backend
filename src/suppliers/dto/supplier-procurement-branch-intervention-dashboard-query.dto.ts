import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SupplierProcurementBranchInterventionQueryDto } from './supplier-procurement-branch-intervention-query.dto';

export enum SupplierProcurementDashboardSupplierRollupSortBy {
  OVER_72H_DESC = 'OVER_72H_DESC',
  PRIORITY_DESC = 'PRIORITY_DESC',
  UNTRIAGED_DESC = 'UNTRIAGED_DESC',
}

export enum SupplierProcurementDashboardBranchRollupSortBy {
  OVER_72H_DESC = 'OVER_72H_DESC',
  INTERVENTION_COUNT_DESC = 'INTERVENTION_COUNT_DESC',
  PRIORITY_DESC = 'PRIORITY_DESC',
}

export class SupplierProcurementBranchInterventionDashboardQueryDto extends SupplierProcurementBranchInterventionQueryDto {
  @ApiPropertyOptional({
    enum: SupplierProcurementDashboardSupplierRollupSortBy,
    description:
      'Sort supplier hotspot rollups by stale load, highest priority, or untriaged volume.',
    default: SupplierProcurementDashboardSupplierRollupSortBy.OVER_72H_DESC,
  })
  @IsOptional()
  @IsEnum(SupplierProcurementDashboardSupplierRollupSortBy)
  supplierRollupSortBy?: SupplierProcurementDashboardSupplierRollupSortBy;

  @ApiPropertyOptional({
    enum: SupplierProcurementDashboardBranchRollupSortBy,
    description:
      'Sort branch hotspot rollups by stale load, intervention volume, or highest priority.',
    default: SupplierProcurementDashboardBranchRollupSortBy.OVER_72H_DESC,
  })
  @IsOptional()
  @IsEnum(SupplierProcurementDashboardBranchRollupSortBy)
  branchRollupSortBy?: SupplierProcurementDashboardBranchRollupSortBy;

  @ApiPropertyOptional({
    example: 5,
    minimum: 1,
    maximum: 100,
    description:
      'Optional maximum number of supplier hotspot rollups to return.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  supplierRollupLimit?: number;

  @ApiPropertyOptional({
    example: 5,
    minimum: 1,
    maximum: 100,
    description: 'Optional maximum number of branch hotspot rollups to return.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  branchRollupLimit?: number;
}
