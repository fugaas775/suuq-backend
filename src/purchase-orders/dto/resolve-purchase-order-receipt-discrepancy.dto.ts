import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolvePurchaseOrderReceiptDiscrepancyDto {
  @ApiProperty({
    example:
      'Supplier will issue a credit note for the missing unit and replace the damaged carton on the next dispatch.',
  })
  @IsString()
  @MaxLength(1000)
  resolutionNote!: string;

  @ApiPropertyOptional({
    example: { creditMemoNumber: 'CM-101', replacementEta: '2026-03-20' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
