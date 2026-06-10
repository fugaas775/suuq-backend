import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum ReplenishmentPolicySubmissionMode {
  DRAFT_ONLY = 'DRAFT_ONLY',
  AUTO_SUBMIT = 'AUTO_SUBMIT',
}

export class ReplenishmentPolicyOrderWindowDto {
  @ApiPropertyOptional({
    description:
      'Allowed order weekdays in tenant-local time where 0=Sunday and 6=Saturday.',
    example: [1, 3, 5],
    type: [Number],
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ArrayUnique()
  daysOfWeek?: number[];

  @ApiPropertyOptional({ example: 8, minimum: 0, maximum: 23 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  startHour?: number;

  @ApiPropertyOptional({ example: 17, minimum: 0, maximum: 23 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  endHour?: number;

  @ApiPropertyOptional({
    description: 'IANA timezone used to evaluate the order window.',
    example: 'Africa/Addis_Ababa',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timeZone?: string;
}

export class ReplenishmentPolicyDto {
  @ApiPropertyOptional({
    enum: ReplenishmentPolicySubmissionMode,
    description:
      'Whether automation should keep drafts open or auto-submit them when constraints pass.',
  })
  @IsOptional()
  @IsEnum(ReplenishmentPolicySubmissionMode)
  submissionMode?: ReplenishmentPolicySubmissionMode;

  @ApiPropertyOptional({
    description:
      'Restrict auto-submit to drafts targeting this supplier profile. Draft creation still occurs for other suppliers.',
    example: 42,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  preferredSupplierProfileId?: number;

  @ApiPropertyOptional({
    description:
      'Minimum order total required before automation can auto-submit the draft.',
    example: 250,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  minimumOrderTotal?: number;

  @ApiPropertyOptional({ type: () => ReplenishmentPolicyOrderWindowDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReplenishmentPolicyOrderWindowDto)
  orderWindow?: ReplenishmentPolicyOrderWindowDto;
}

export class AiAnalyticsPolicyDto {
  @ApiPropertyOptional({
    description:
      'Number of hours after which an open purchase order is considered stale in AI insight summaries.',
    example: 72,
    minimum: 1,
    maximum: 720,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  stalePurchaseOrderHours?: number;

  @ApiPropertyOptional({
    description:
      'Target branch health score used to raise watch alerts when the live score falls below this value.',
    example: 85,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  targetHealthScore?: number;
}

export class TenantModuleEntitlementMetadataDto {
  @ApiPropertyOptional({
    type: () => ReplenishmentPolicyDto,
    description:
      'Inventory automation controls. Supported for the INVENTORY_AUTOMATION module and validated at write time.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReplenishmentPolicyDto)
  replenishmentPolicy?: ReplenishmentPolicyDto;

  @ApiPropertyOptional({
    type: () => AiAnalyticsPolicyDto,
    description:
      'AI analytics controls. Supported for the AI_ANALYTICS module and validated at write time.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiAnalyticsPolicyDto)
  aiAnalyticsPolicy?: AiAnalyticsPolicyDto;
}

export class UpsertTenantModuleEntitlementDto {
  @Type(() => Boolean)
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ example: '2026-03-17T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2027-03-17T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    example: 'Enterprise inventory automation entitlement',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    type: () => TenantModuleEntitlementMetadataDto,
    description:
      'Optional module metadata. INVENTORY_AUTOMATION supports replenishmentPolicy. AI_ANALYTICS supports aiAnalyticsPolicy.',
    example: {
      source: 'admin-override',
      replenishmentPolicy: {
        submissionMode: 'AUTO_SUBMIT',
        preferredSupplierProfileId: 42,
        minimumOrderTotal: 250,
        orderWindow: {
          daysOfWeek: [1, 3, 5],
          startHour: 8,
          endHour: 17,
          timeZone: 'Africa/Addis_Ababa',
        },
      },
      aiAnalyticsPolicy: {
        stalePurchaseOrderHours: 72,
        targetHealthScore: 85,
      },
    },
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TenantModuleEntitlementMetadataDto)
  metadata?: TenantModuleEntitlementMetadataDto & Record<string, any>;
}
