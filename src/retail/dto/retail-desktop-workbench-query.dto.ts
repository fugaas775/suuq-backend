import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

export enum RetailDesktopWorkbenchQueueFilter {
  SYNC_QUEUE = 'SYNC_QUEUE',
  TRANSFER_QUEUE = 'TRANSFER_QUEUE',
  STOCK_EXCEPTIONS = 'STOCK_EXCEPTIONS',
}

export enum RetailDesktopWorkbenchPriorityFilter {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
}

export class RetailDesktopWorkbenchQueryDto {
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

  @ApiPropertyOptional({ enum: RetailDesktopWorkbenchQueueFilter })
  @IsOptional()
  @IsEnum(RetailDesktopWorkbenchQueueFilter)
  queueType?: RetailDesktopWorkbenchQueueFilter;

  @ApiPropertyOptional({ enum: RetailDesktopWorkbenchPriorityFilter })
  @IsOptional()
  @IsEnum(RetailDesktopWorkbenchPriorityFilter)
  priority?: RetailDesktopWorkbenchPriorityFilter;
}
