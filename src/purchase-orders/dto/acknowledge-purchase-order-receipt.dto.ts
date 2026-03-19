import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AcknowledgePurchaseOrderReceiptDto {
  @ApiPropertyOptional({
    example: 'Supplier reviewed shortages and accepts branch receipt event.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
