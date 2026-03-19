import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import {
  RetailDesktopWorkbenchPriorityFilter,
  RetailDesktopWorkbenchQueueFilter,
} from './retail-desktop-workbench-query.dto';

export class RetailDesktopNetworkSummaryQueryDto {
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

  @ApiPropertyOptional({ example: 72, default: 72 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(720)
  windowHours = 72;

  @ApiPropertyOptional({ enum: RetailDesktopWorkbenchPriorityFilter })
  @IsOptional()
  @IsEnum(RetailDesktopWorkbenchPriorityFilter)
  priority?: RetailDesktopWorkbenchPriorityFilter;

  @ApiPropertyOptional({ enum: RetailDesktopWorkbenchQueueFilter })
  @IsOptional()
  @IsEnum(RetailDesktopWorkbenchQueueFilter)
  queueType?: RetailDesktopWorkbenchQueueFilter;
}
