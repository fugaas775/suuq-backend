import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import {
  toValidatedEnumArray,
  toValidatedOptionalDate,
} from './supplier-procurement-query-transformers';

export class SupplierProcurementBranchInterventionDetailQueryDto {
  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    enum: PurchaseOrderStatus,
    isArray: true,
    description:
      'Filter intervention detail to specific purchase-order statuses.',
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
    example: '2026-03-20T08:00:00.000Z',
  })
  @IsOptional()
  @Transform(toValidatedOptionalDate)
  @IsDate()
  to?: Date;
}
