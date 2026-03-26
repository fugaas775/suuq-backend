import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import { SupplierOnboardingStatus } from '../entities/supplier-profile.entity';
import {
  toValidatedEnumArray,
  toValidatedOptionalDate,
  toValidatedPositiveIntArray,
} from './supplier-procurement-query-transformers';

export class SupplierProcurementScorecardQueryDto {
  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: false })
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
  includeInactive?: boolean;

  @ApiPropertyOptional({ enum: SupplierOnboardingStatus })
  @IsOptional()
  @IsEnum(SupplierOnboardingStatus)
  onboardingStatus?: SupplierOnboardingStatus;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Filter the scorecard to one or more supplier profile IDs.',
    example: [7, 9],
  })
  @IsOptional()
  @Transform(toValidatedPositiveIntArray)
  @IsInt({ each: true })
  @Min(1, { each: true })
  supplierProfileIds?: number[];

  @ApiPropertyOptional({
    type: [Number],
    description: 'Filter scorecard metrics to one or more branch IDs.',
    example: [3, 4],
  })
  @IsOptional()
  @Transform(toValidatedPositiveIntArray)
  @IsInt({ each: true })
  @Min(1, { each: true })
  branchIds?: number[];

  @ApiPropertyOptional({
    enum: PurchaseOrderStatus,
    isArray: true,
    description:
      'Filter scorecard metrics to specific purchase-order statuses.',
  })
  @IsOptional()
  @Transform(toValidatedEnumArray<PurchaseOrderStatus>())
  @IsEnum(PurchaseOrderStatus, { each: true })
  statuses?: PurchaseOrderStatus[];

  @ApiPropertyOptional({
    type: String,
    description: 'Inclusive lower bound for purchase-order creation time.',
    example: '2026-03-01T00:00:00.000Z',
  })
  @IsOptional()
  @Transform(toValidatedOptionalDate)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    type: String,
    description: 'Inclusive upper bound for purchase-order creation time.',
    example: '2026-03-19T23:59:59.999Z',
  })
  @IsOptional()
  @Transform(toValidatedOptionalDate)
  @IsDate()
  to?: Date;
}
