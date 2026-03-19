import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../entities/tenant-subscription.entity';
import { RetailModule } from '../entities/tenant-module-entitlement.entity';

export class RetailPlanPresetModuleResponseDto {
  @ApiProperty({ enum: RetailModule })
  module!: RetailModule;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  reason!: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  metadata?: Record<string, any> | null;
}

export class RetailPlanPresetResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: TenantBillingInterval })
  billingInterval!: TenantBillingInterval;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: TenantSubscriptionStatus })
  defaultStatus!: TenantSubscriptionStatus;

  @ApiProperty({ type: [RetailPlanPresetModuleResponseDto] })
  modules!: RetailPlanPresetModuleResponseDto[];
}

export class AppliedRetailPlanPresetResponseDto {
  @ApiProperty({ type: RetailPlanPresetResponseDto })
  preset!: RetailPlanPresetResponseDto;

  @ApiProperty({ type: Object })
  subscription!: Record<string, any>;

  @ApiProperty({ type: [Object] })
  entitlements!: Record<string, any>[];
}
