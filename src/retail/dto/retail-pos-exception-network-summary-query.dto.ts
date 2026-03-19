import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import {
  RetailPosExceptionPriorityFilter,
  RetailPosExceptionQueueFilter,
} from './retail-pos-exceptions-query.dto';

export class RetailPosExceptionNetworkSummaryQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 10, required: false, default: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit = 10;

  @ApiProperty({ example: 24, required: false, default: 24 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  windowHours = 24;

  @ApiProperty({ enum: RetailPosExceptionQueueFilter, required: false })
  @IsOptional()
  @IsEnum(RetailPosExceptionQueueFilter)
  queueType?: RetailPosExceptionQueueFilter;

  @ApiProperty({ enum: RetailPosExceptionPriorityFilter, required: false })
  @IsOptional()
  @IsEnum(RetailPosExceptionPriorityFilter)
  priority?: RetailPosExceptionPriorityFilter;
}
