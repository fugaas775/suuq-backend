import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ProcurementWebhookEventType,
  ProcurementWebhookSubscriptionStatus,
} from '../entities/procurement-webhook-subscription.entity';

export class CreateProcurementWebhookSubscriptionDto {
  @ApiProperty({ example: 'ERP Procurement Feed' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'https://partner.example.com/webhooks/procurement' })
  @IsUrl({ require_tld: false })
  endpointUrl!: string;

  @ApiProperty({ example: 'super-secret-signing-key' })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  signingSecret!: string;

  @ApiProperty({ enum: ProcurementWebhookEventType, isArray: true })
  @IsArray()
  @IsEnum(ProcurementWebhookEventType, { each: true })
  eventTypes!: ProcurementWebhookEventType[];

  @ApiPropertyOptional({ enum: ProcurementWebhookSubscriptionStatus })
  @IsOptional()
  @IsEnum(ProcurementWebhookSubscriptionStatus)
  status?: ProcurementWebhookSubscriptionStatus;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  supplierProfileId?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  metadata?: Record<string, any>;
}
