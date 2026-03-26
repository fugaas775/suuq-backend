import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ProcurementWebhookDeliveryStatus } from '../entities/procurement-webhook-delivery.entity';
import { ProcurementWebhookEventType } from '../entities/procurement-webhook-subscription.entity';

export enum ProcurementWebhookDeliveryRetryState {
  RETRY_ELIGIBLE = 'RETRY_ELIGIBLE',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  TERMINAL_FAILURE = 'TERMINAL_FAILURE',
}

export class ProcurementWebhookDeliveryQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ enum: ProcurementWebhookDeliveryStatus })
  @IsOptional()
  @IsEnum(ProcurementWebhookDeliveryStatus)
  status?: ProcurementWebhookDeliveryStatus;

  @ApiPropertyOptional({ enum: ProcurementWebhookEventType })
  @IsOptional()
  @IsEnum(ProcurementWebhookEventType)
  eventType?: ProcurementWebhookEventType;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  subscriptionId?: number;

  @ApiPropertyOptional({ enum: ProcurementWebhookDeliveryRetryState })
  @IsOptional()
  @IsEnum(ProcurementWebhookDeliveryRetryState)
  retryState?: ProcurementWebhookDeliveryRetryState;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  nextRetryFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  nextRetryTo?: string;
}
