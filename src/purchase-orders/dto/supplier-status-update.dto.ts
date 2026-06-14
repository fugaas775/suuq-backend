import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PurchaseOrderStatus } from '../entities/purchase-order.entity';

/**
 * Narrow DTO for the supplier-driven status transitions. A supplier may only
 * acknowledge a submitted order or mark an acknowledged order as shipped — the
 * buyer-driven transitions (SUBMITTED / RECEIVED / RECONCILED / CANCELLED) are
 * not accepted here. Structurally assignable to UpdatePurchaseOrderStatusDto for
 * the fields the shared status pipeline reads.
 */
export class SupplierStatusUpdateDto {
  @ApiProperty({
    enum: PurchaseOrderStatus,
    enumName: 'SupplierPurchaseOrderStatus',
    description: 'Supplier transitions only: ACKNOWLEDGED or SHIPPED.',
    example: PurchaseOrderStatus.ACKNOWLEDGED,
  })
  @IsEnum(PurchaseOrderStatus)
  @IsIn([PurchaseOrderStatus.ACKNOWLEDGED, PurchaseOrderStatus.SHIPPED])
  status!: PurchaseOrderStatus;

  @ApiPropertyOptional({ example: 'Packed and ready for carrier pickup' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: 'TRACK-123' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  trackingReference?: string;

  @ApiPropertyOptional({ example: { carrier: 'DHL' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
