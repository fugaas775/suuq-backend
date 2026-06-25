import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One line of a (partial) dispatch: how many units of this item are shipping in
 * THIS dispatch. The value is added to the line's cumulative shippedQuantity
 * (the service caps the total at orderedQuantity).
 */
export class DispatchPurchaseOrderLineDto {
  @ApiProperty({ example: 12, description: 'purchase_order_items.id being shipped.' })
  @IsInt()
  itemId!: number;

  @ApiProperty({ example: 5, description: 'Quantity shipped in this dispatch (≥0).' })
  @IsInt()
  @Min(0)
  shippedQuantity!: number;
}

/**
 * Supplier (partially) dispatches an acknowledged order. When every line becomes
 * fully shipped the order moves to SHIPPED, otherwise PARTIALLY_SHIPPED.
 */
export class DispatchPurchaseOrderDto {
  @ApiProperty({ type: [DispatchPurchaseOrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DispatchPurchaseOrderLineDto)
  lines!: DispatchPurchaseOrderLineDto[];

  @ApiPropertyOptional({ example: 'TRACK-123' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  trackingReference?: string;

  @ApiPropertyOptional({ example: 'First of two shipments.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
