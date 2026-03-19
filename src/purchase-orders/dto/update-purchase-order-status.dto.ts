import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseOrderStatus } from '../entities/purchase-order.entity';

export class PurchaseOrderReceiptLineDto {
  @ApiProperty({ example: 101 })
  @Type(() => Number)
  @IsNumber()
  itemId!: number;

  @ApiProperty({ example: 8 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receivedQuantity!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shortageQuantity?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  damagedQuantity?: number;

  @ApiPropertyOptional({ example: 'Two boxes dented at arrival.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({ enum: PurchaseOrderStatus })
  @IsEnum(PurchaseOrderStatus)
  status!: PurchaseOrderStatus;

  @ApiPropertyOptional({ example: 'Goods received at branch' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: 'TRACK-123' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  trackingReference?: string;

  @ApiPropertyOptional({ example: { dockDoor: 'B2' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      'Explicit line-level receipt data. Values are incremental for this status update event.',
    type: [PurchaseOrderReceiptLineDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderReceiptLineDto)
  receiptLines?: PurchaseOrderReceiptLineDto[];
}
