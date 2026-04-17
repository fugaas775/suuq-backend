import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PosUserFitCategory } from '../../categories/entities/category.entity';

export const RETAIL_TENANT_PROVISIONING_SOURCES = [
  'POS_SELF_SERVE',
  'ADMIN_OR_BACKOFFICE',
] as const;

export const RETAIL_TENANT_ACTIVATION_STATUSES = [
  'ACTIVATED',
  'PENDING_MONTHLY_BILLING',
  'PAST_DUE',
  'EXPIRED',
  'CANCELLED',
  'MODULE_SETUP_REQUIRED',
  'TENANT_INACTIVE',
  'NO_BRANCH_WORKSPACE',
] as const;

export class ListRetailTenantsQueryDto {
  @ApiPropertyOptional({ enum: RETAIL_TENANT_PROVISIONING_SOURCES })
  @IsOptional()
  @IsIn(RETAIL_TENANT_PROVISIONING_SOURCES)
  provisioningSource?: (typeof RETAIL_TENANT_PROVISIONING_SOURCES)[number];

  @ApiPropertyOptional({ enum: RETAIL_TENANT_ACTIVATION_STATUSES })
  @IsOptional()
  @IsIn(RETAIL_TENANT_ACTIVATION_STATUSES)
  activationStatus?: (typeof RETAIL_TENANT_ACTIVATION_STATUSES)[number];

  @ApiPropertyOptional({ example: 'fugaas775@gmail.com' })
  @IsOptional()
  @IsString()
  ownerEmail?: string;

  @ApiPropertyOptional({ example: 'cafeteria' })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({ enum: PosUserFitCategory })
  @IsOptional()
  @IsIn(Object.values(PosUserFitCategory))
  userFit?: PosUserFitCategory;
}
