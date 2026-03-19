import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import {
  RetailAccountingPriorityFilter,
  RetailAccountingStateFilter,
} from './retail-accounting-overview-query.dto';

export class RetailAccountingNetworkSummaryQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(25)
  limit = 10;

  @ApiPropertyOptional({ enum: RetailAccountingPriorityFilter })
  @IsOptional()
  @IsEnum(RetailAccountingPriorityFilter)
  priority?: RetailAccountingPriorityFilter;

  @ApiPropertyOptional({ enum: RetailAccountingStateFilter })
  @IsOptional()
  @IsEnum(RetailAccountingStateFilter)
  accountingState?: RetailAccountingStateFilter;
}
