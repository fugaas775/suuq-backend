import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../entities/tenant-subscription.entity';

export class ApplyRetailPlanPresetDto {
  @ApiProperty({ example: 'RETAIL_INTELLIGENCE' })
  @IsString()
  @MaxLength(64)
  presetCode!: string;

  @ApiPropertyOptional({ example: '2026-03-18T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2027-03-18T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ enum: TenantSubscriptionStatus })
  @IsOptional()
  @IsEnum(TenantSubscriptionStatus)
  status?: TenantSubscriptionStatus;

  @ApiPropertyOptional({ enum: TenantBillingInterval })
  @IsOptional()
  @IsEnum(TenantBillingInterval)
  billingInterval?: TenantBillingInterval;

  @ApiPropertyOptional({ example: 249 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoRenew?: boolean;
}
