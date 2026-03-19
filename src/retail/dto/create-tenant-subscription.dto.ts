import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../entities/tenant-subscription.entity';

export class CreateTenantSubscriptionDto {
  @IsString()
  @MaxLength(64)
  planCode!: string;

  @IsEnum(TenantSubscriptionStatus)
  status!: TenantSubscriptionStatus;

  @IsOptional()
  @IsEnum(TenantBillingInterval)
  billingInterval?: TenantBillingInterval;

  @ApiPropertyOptional({ example: 199 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({ example: '2026-04-17T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoRenew?: boolean;
}
