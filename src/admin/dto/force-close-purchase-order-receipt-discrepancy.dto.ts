import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class ForceClosePurchaseOrderReceiptDiscrepancyDto {
  @ApiProperty({
    example:
      'Force-closed after supplier stopped responding and branch finance approved write-off.',
  })
  @IsString()
  @MaxLength(1000)
  note!: string;
}
