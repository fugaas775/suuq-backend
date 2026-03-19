import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import {
  RetailAccountingPayoutExceptionTypeFilter,
  RetailAccountingPayoutPriorityFilter,
} from './retail-accounting-payout-exceptions-query.dto';

export class RetailAccountingPayoutNetworkSummaryQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 10, required: false, default: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(25)
  limit = 10;

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
