import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseOrderReceiptDiscrepancyStatus } from '../entities/purchase-order-receipt-event.entity';

export class PurchaseOrderReceiptEventLineResponseDto {
  @ApiProperty()
  itemId!: number;

  @ApiProperty()
  productId!: number;

  @ApiProperty()
  receivedQuantity!: number;

  @ApiProperty()
  shortageQuantity!: number;

  @ApiProperty()
  damagedQuantity!: number;

  @ApiPropertyOptional()
  note?: string | null;
}

export class PurchaseOrderReceiptEventResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  purchaseOrderId!: number;

  @ApiPropertyOptional()
  actorUserId?: number | null;

  @ApiPropertyOptional()
  note?: string | null;

  @ApiProperty({ type: [PurchaseOrderReceiptEventLineResponseDto] })
  receiptLines!: PurchaseOrderReceiptEventLineResponseDto[];

  @ApiPropertyOptional({
    example: { deliveryReference: 'DEL-77' },
  })
  metadata?: Record<string, any> | null;

  @ApiPropertyOptional()
  supplierAcknowledgedAt?: Date | null;

  @ApiPropertyOptional()
  supplierAcknowledgedByUserId?: number | null;

  @ApiPropertyOptional()
  supplierAcknowledgementNote?: string | null;

  @ApiPropertyOptional({ enum: PurchaseOrderReceiptDiscrepancyStatus })
  discrepancyStatus?: PurchaseOrderReceiptDiscrepancyStatus | null;

  @ApiPropertyOptional()
  discrepancyResolutionNote?: string | null;

  @ApiPropertyOptional({
    example: { creditMemoNumber: 'CM-101' },
  })
  discrepancyMetadata?: Record<string, any> | null;

  @ApiPropertyOptional()
  discrepancyResolvedAt?: Date | null;

  @ApiPropertyOptional()
  discrepancyResolvedByUserId?: number | null;

  @ApiPropertyOptional()
  discrepancyApprovedAt?: Date | null;

  @ApiPropertyOptional()
  discrepancyApprovedByUserId?: number | null;

  @ApiPropertyOptional()
  discrepancyApprovalNote?: string | null;

  @ApiProperty()
  createdAt!: Date;
}
