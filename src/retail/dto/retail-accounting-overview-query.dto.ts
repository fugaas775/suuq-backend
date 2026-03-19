import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export enum RetailAccountingStateFilter {
  OPEN_COMMITMENT = 'OPEN_COMMITMENT',
  RECEIVED_PENDING_RECONCILIATION = 'RECEIVED_PENDING_RECONCILIATION',
  DISCREPANCY_REVIEW = 'DISCREPANCY_REVIEW',
  DISCREPANCY_AWAITING_APPROVAL = 'DISCREPANCY_AWAITING_APPROVAL',
  READY_TO_RECONCILE = 'READY_TO_RECONCILE',
}

export enum RetailAccountingPriorityFilter {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
}

export class RetailAccountingOverviewQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 20, required: false, default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: RetailAccountingStateFilter })
  @IsOptional()
  @IsEnum(RetailAccountingStateFilter)
  accountingState?: RetailAccountingStateFilter;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  supplierProfileId?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  slaBreachedOnly?: boolean;

  @ApiPropertyOptional({ enum: RetailAccountingPriorityFilter })
  @IsOptional()
  @IsEnum(RetailAccountingPriorityFilter)
  priority?: RetailAccountingPriorityFilter;
}
