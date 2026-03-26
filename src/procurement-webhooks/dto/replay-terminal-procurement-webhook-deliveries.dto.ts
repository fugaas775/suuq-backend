import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { ProcurementWebhookEventType } from '../entities/procurement-webhook-subscription.entity';

export class ReplayTerminalProcurementWebhookDeliveriesDto {
  @ApiPropertyOptional({
    type: [Number],
    description:
      'Optional explicit delivery IDs to replay if they are terminal failures.',
    example: [90, 91, 92],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  deliveryIds?: number[];

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subscriptionId?: number;

  @ApiPropertyOptional({ enum: ProcurementWebhookEventType })
  @IsOptional()
  @IsEnum(ProcurementWebhookEventType)
  eventType?: ProcurementWebhookEventType;

  @ApiPropertyOptional({
    type: String,
    description:
      'Opaque cursor returned by the previous replay preview response to fetch the next page of matched terminal failures.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Opaque confirmation token returned by replay preview for executing the exact previewed page during high-volume replay remediation.',
  })
  @IsOptional()
  @IsString()
  previewConfirmationToken?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Optional operator note explaining why the replay operation is being executed.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ type: Number, default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
