import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApprovePurchaseOrderReceiptDiscrepancyDto {
  @ApiPropertyOptional({
    example:
      'Approved after reviewing supplier credit memo and replacement ETA.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
