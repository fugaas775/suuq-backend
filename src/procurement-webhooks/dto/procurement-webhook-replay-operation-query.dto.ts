import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  ProcurementWebhookReplayExecutionMode,
  ProcurementWebhookReplayOperationScope,
} from './procurement-webhook-response.dto';

export class ProcurementWebhookReplayOperationQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description:
      'Opaque cursor returned by the previous replay-operations page to continue scanning older entries.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subscriptionId?: number;

  @ApiPropertyOptional({ enum: ProcurementWebhookReplayExecutionMode })
  @IsOptional()
  @IsEnum(ProcurementWebhookReplayExecutionMode)
  replayExecutionMode?: ProcurementWebhookReplayExecutionMode;

  @ApiPropertyOptional({ enum: ProcurementWebhookReplayOperationScope })
  @IsOptional()
  @IsEnum(ProcurementWebhookReplayOperationScope)
  replayScope?: ProcurementWebhookReplayOperationScope;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  actorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  actorEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Filter replay operations by whether they used a preview-confirmed execution token.',
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
  previewConfirmed?: boolean;
}
