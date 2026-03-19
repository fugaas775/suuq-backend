import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

export enum RetailAccountingPayoutExceptionTypeFilter {
  AUTO_RETRY_REQUIRED = 'AUTO_RETRY_REQUIRED',
  RECONCILIATION_REQUIRED = 'RECONCILIATION_REQUIRED',
}

export enum RetailAccountingPayoutPriorityFilter {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
}

export class RetailAccountingPayoutExceptionsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 25, required: false, default: 25 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit = 25;

  @ApiProperty({ example: 168, required: false, default: 168 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(720)
  windowHours = 168;

  @ApiPropertyOptional({ enum: RetailAccountingPayoutExceptionTypeFilter })
  @IsOptional()
  @IsEnum(RetailAccountingPayoutExceptionTypeFilter)
  exceptionType?: RetailAccountingPayoutExceptionTypeFilter;

  @ApiPropertyOptional({ enum: RetailAccountingPayoutPriorityFilter })
  @IsOptional()
  @IsEnum(RetailAccountingPayoutPriorityFilter)
  priority?: RetailAccountingPayoutPriorityFilter;
}
