import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PurchaseOrderReceiptLineDto } from './update-purchase-order-status.dto';

export class RecordPurchaseOrderReceiptDto {
  @ApiPropertyOptional({
    description:
      'Optional receipt note stored on the receipt event and movement logs.',
    example: 'Second truck delivered remaining cartons.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Optional structured metadata for the receipt event.',
    example: { dockDoor: 'B2', deliveryReference: 'DEL-77' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      'Explicit receipt lines for this event. Values are incremental for this receipt event, not full cumulative totals.',
    type: [PurchaseOrderReceiptLineDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderReceiptLineDto)
  receiptLines?: PurchaseOrderReceiptLineDto[];
}
