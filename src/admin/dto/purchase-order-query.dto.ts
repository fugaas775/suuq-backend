import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import { ReplenishmentPolicySubmissionMode } from '../../retail/dto/upsert-tenant-module-entitlement.dto';

export class PurchaseOrderQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  supplierProfileId?: number;

  @ApiPropertyOptional({ enum: PurchaseOrderStatus })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional({
    description:
      'Filter purchase orders created by the auto-replenishment workflow',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return String(value).toLowerCase() === 'true';
  })
  @IsBoolean()
  autoReplenishment?: boolean;

  @ApiPropertyOptional({
    enum: ReplenishmentPolicySubmissionMode,
    description:
      'Filter auto-replenishment purchase orders by configured submission mode.',
  })
  @IsOptional()
  @IsEnum(ReplenishmentPolicySubmissionMode)
  autoReplenishmentSubmissionMode?: ReplenishmentPolicySubmissionMode;

  @ApiPropertyOptional({
    description:
      'Filter auto-replenishment purchase orders by the last blocked auto-submit reason, for example MINIMUM_ORDER_TOTAL_NOT_MET.',
    example: 'MINIMUM_ORDER_TOTAL_NOT_MET',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  autoReplenishmentBlockedReason?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}
