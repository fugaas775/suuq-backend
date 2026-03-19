import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { RetailModule } from '../entities/tenant-module-entitlement.entity';

export enum RetailCommandCenterStatusFilter {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
}

export enum RetailCommandCenterAlertSeverityFilter {
  INFO = 'INFO',
  WATCH = 'WATCH',
  CRITICAL = 'CRITICAL',
}

const toBooleanOrUndefined = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return value;
};

export class RetailCommandCenterSummaryQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: 3, default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10)
  branchLimit = 3;

  @ApiPropertyOptional({ enum: RetailModule })
  @IsOptional()
  @IsEnum(RetailModule)
  module?: RetailModule;

  @ApiPropertyOptional({ enum: RetailCommandCenterStatusFilter })
  @IsOptional()
  @IsEnum(RetailCommandCenterStatusFilter)
  status?: RetailCommandCenterStatusFilter;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(toBooleanOrUndefined)
  @IsBoolean()
  hasAlertsOnly?: boolean;

  @ApiPropertyOptional({ enum: RetailCommandCenterAlertSeverityFilter })
  @IsOptional()
  @IsEnum(RetailCommandCenterAlertSeverityFilter)
  alertSeverity?: RetailCommandCenterAlertSeverityFilter;
}
