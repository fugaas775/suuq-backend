import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReplayProcurementWebhookDeliveryDto {
  @ApiPropertyOptional({
    description:
      'Optional operator note explaining why the delivery is being replayed.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
