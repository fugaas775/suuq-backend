import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One proposed amendment to a line. Either field may be omitted to leave it
 * unchanged; at least one of quantity/price should differ for the proposal to be
 * meaningful (not enforced here — an unchanged proposal is harmless).
 */
export class ProposePurchaseOrderChangeLineDto {
  @ApiProperty({ example: 12, description: 'purchase_order_items.id to amend.' })
  @IsInt()
  itemId!: number;

  @ApiPropertyOptional({ example: 8, description: 'Proposed ordered quantity (≥1).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  proposedQuantity?: number;

  @ApiPropertyOptional({ example: 42.5, description: 'Proposed unit price (≥0).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  proposedUnitPrice?: number;
}

/**
 * Supplier counter-offers amended quantities/prices and/or a new delivery date
 * (SUBMITTED → CHANGES_PROPOSED). The proposal is stored on statusMeta and only
 * applied to the real line items when the buyer accepts.
 */
export class ProposePurchaseOrderChangesDto {
  @ApiProperty({ type: [ProposePurchaseOrderChangeLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProposePurchaseOrderChangeLineDto)
  proposedLines!: ProposePurchaseOrderChangeLineDto[];

  @ApiPropertyOptional({ example: '2026-07-15' })
  @IsOptional()
  @IsISO8601()
  proposedDeliveryDate?: string;

  @ApiPropertyOptional({ example: 'Can ship 8 of 10 at a slightly higher unit price.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
