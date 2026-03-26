import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { SupplierProcurementBranchInterventionAction } from './act-on-supplier-procurement-branch-intervention.dto';
import { SupplierProcurementScorecardQueryDto } from './supplier-procurement-scorecard-query.dto';
import {
  toValidatedEnumArray,
  toValidatedPositiveIntArray,
} from './supplier-procurement-query-transformers';

export enum SupplierProcurementBranchInterventionAgeBucket {
  UNTRIAGED = 'UNTRIAGED',
  OVER_24H = 'OVER_24H',
  OVER_72H = 'OVER_72H',
}

export enum SupplierProcurementBranchInterventionSortBy {
  PRIORITY_DESC = 'PRIORITY_DESC',
  STALE_FIRST = 'STALE_FIRST',
  UNTRIAGED_FIRST = 'UNTRIAGED_FIRST',
}

export class SupplierProcurementBranchInterventionQueryDto extends SupplierProcurementScorecardQueryDto {
  @ApiPropertyOptional({
    enum: SupplierProcurementBranchInterventionAction,
    isArray: true,
    description:
      'Filter interventions by their latest recorded workflow action.',
  })
  @IsOptional()
  @Transform(
    toValidatedEnumArray<SupplierProcurementBranchInterventionAction>(),
  )
  @IsEnum(SupplierProcurementBranchInterventionAction, { each: true })
  latestActions?: SupplierProcurementBranchInterventionAction[];

  @ApiPropertyOptional({
    enum: SupplierProcurementBranchInterventionAgeBucket,
    isArray: true,
    description:
      'Filter interventions by workflow age buckets such as untriaged or older than 24/72 hours.',
  })
  @IsOptional()
  @Transform(
    toValidatedEnumArray<SupplierProcurementBranchInterventionAgeBucket>(),
  )
  @IsEnum(SupplierProcurementBranchInterventionAgeBucket, { each: true })
  actionAgeBuckets?: SupplierProcurementBranchInterventionAgeBucket[];

  @ApiPropertyOptional({
    enum: SupplierProcurementBranchInterventionSortBy,
    description:
      'Sort intervention queues by priority, stale workflow age, or untriaged-first ordering.',
    default: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
  })
  @IsOptional()
  @IsEnum(SupplierProcurementBranchInterventionSortBy)
  sortBy?: SupplierProcurementBranchInterventionSortBy;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Filter interventions assigned to one or more user IDs.',
    example: [21, 34],
  })
  @IsOptional()
  @Transform(toValidatedPositiveIntArray)
  @IsInt({ each: true })
  @Min(1, { each: true })
  assigneeUserIds?: number[];

  @ApiPropertyOptional({
    default: true,
    description:
      'Whether to include interventions that have no recorded triage action yet.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === false) {
      return value;
    }

    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }

    return Boolean(value);
  })
  @IsBoolean()
  includeUntriaged?: boolean;
}
