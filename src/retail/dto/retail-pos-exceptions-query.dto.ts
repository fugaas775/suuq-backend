import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export enum RetailPosExceptionQueueFilter {
  FAILED_PAYMENT = 'FAILED_PAYMENT',
  PAYMENT_REVIEW = 'PAYMENT_REVIEW',
  FULFILLMENT_DELAY = 'FULFILLMENT_DELAY',
}

export enum RetailPosExceptionPriorityFilter {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
}

export class RetailPosExceptionsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 25, required: false, default: 25 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit = 25;

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
