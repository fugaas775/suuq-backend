import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ProcurementWebhookSubscriptionStatus } from '../entities/procurement-webhook-subscription.entity';

export class UpdateProcurementWebhookSubscriptionStatusDto {
  @ApiProperty({ enum: ProcurementWebhookSubscriptionStatus })
  @IsEnum(ProcurementWebhookSubscriptionStatus)
  status!: ProcurementWebhookSubscriptionStatus;

  @ApiPropertyOptional({
    description:
      'Required when resuming a subscription that still has terminal failure pressure within the circuit-breaker window.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === false) {
      return value;
    }

    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }

    return Boolean(value);
  })
  @IsBoolean()
  forceResume?: boolean;

  @ApiPropertyOptional({
    description:
      'Optional operator note explaining why the subscription status was changed.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
