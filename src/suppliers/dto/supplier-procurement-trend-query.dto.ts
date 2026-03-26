import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import {
  toValidatedEnumArray,
  toValidatedOptionalDate,
  toValidatedPositiveIntArray,
} from './supplier-procurement-query-transformers';

export class SupplierProcurementTrendQueryDto {
  @ApiPropertyOptional({
    type: [Number],
    description: 'Filter trend snapshots to one or more branch IDs.',
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
    description: 'Filter trend snapshots to specific purchase-order statuses.',
  })
  @IsOptional()
  @Transform(toValidatedEnumArray<PurchaseOrderStatus>())
  @IsEnum(PurchaseOrderStatus, { each: true })
  statuses?: PurchaseOrderStatus[];

  @ApiPropertyOptional({
    type: String,
    description: 'Anchor the trend calculation at a specific point in time.',
    example: '2026-03-19T12:00:00.000Z',
  })
  @IsOptional()
  @Transform(toValidatedOptionalDate)
  @IsDate()
  asOf?: Date;
}
