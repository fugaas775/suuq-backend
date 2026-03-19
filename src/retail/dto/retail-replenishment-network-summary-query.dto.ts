import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ReplenishmentPolicySubmissionMode } from './upsert-tenant-module-entitlement.dto';

export class RetailReplenishmentNetworkSummaryQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: 17 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  supplierProfileId?: number;

  @ApiPropertyOptional({
    enum: ReplenishmentPolicySubmissionMode,
    description:
      'Filter tenant branch summaries by configured auto-submit mode.',
  })
  @IsOptional()
  @IsEnum(ReplenishmentPolicySubmissionMode)
  autoReplenishmentSubmissionMode?: ReplenishmentPolicySubmissionMode;

  @ApiPropertyOptional({
    example: 'MINIMUM_ORDER_TOTAL_NOT_MET',
    description:
      'Filter tenant branch summaries by the last blocked auto-submit reason.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  autoReplenishmentBlockedReason?: string;

  @ApiProperty({ example: 10, required: false, default: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit = 10;
}
