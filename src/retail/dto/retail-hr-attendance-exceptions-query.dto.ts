import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum RetailHrAttendanceExceptionQueueFilter {
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  OVERTIME = 'OVERTIME',
}

export enum RetailHrAttendanceExceptionPriorityFilter {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
}

export class RetailHrAttendanceExceptionsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  @ApiPropertyOptional({ example: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 24, minimum: 1, maximum: 168 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  windowHours?: number;

  @ApiPropertyOptional({ enum: RetailHrAttendanceExceptionQueueFilter })
  @IsOptional()
  @IsEnum(RetailHrAttendanceExceptionQueueFilter)
  queueType?: RetailHrAttendanceExceptionQueueFilter;

  @ApiPropertyOptional({ enum: RetailHrAttendanceExceptionPriorityFilter })
  @IsOptional()
  @IsEnum(RetailHrAttendanceExceptionPriorityFilter)
  priority?: RetailHrAttendanceExceptionPriorityFilter;
}
