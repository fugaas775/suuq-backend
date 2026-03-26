import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  ProcurementWebhookEventType,
  ProcurementWebhookSubscriptionStatus,
} from '../entities/procurement-webhook-subscription.entity';
import { ProcurementWebhookResumeRiskSeverity } from './procurement-webhook-response.dto';

export class ProcurementWebhookSubscriptionQueryDto {
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

  @ApiPropertyOptional({ enum: ProcurementWebhookSubscriptionStatus })
  @IsOptional()
  @IsEnum(ProcurementWebhookSubscriptionStatus)
  status?: ProcurementWebhookSubscriptionStatus;

  @ApiPropertyOptional({ enum: ProcurementWebhookEventType })
  @IsOptional()
  @IsEnum(ProcurementWebhookEventType)
  eventType?: ProcurementWebhookEventType;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierProfileId?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'When true, only return subscriptions whose current failure pressure would require forceResume=true before activation.',
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
  forceResumeRequired?: boolean;

  @ApiPropertyOptional({
    description:
      'When true, order subscriptions by current terminal failure pressure descending before pagination.',
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
  sortByFailurePressure?: boolean;

  @ApiPropertyOptional({
    enum: ProcurementWebhookResumeRiskSeverity,
    description:
      'Only return subscriptions whose current failure pressure maps to the requested severity band.',
  })
  @IsOptional()
  @IsEnum(ProcurementWebhookResumeRiskSeverity)
  severity?: ProcurementWebhookResumeRiskSeverity;
}
