import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export enum RetailPosNetworkStatusFilter {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
}

export class RetailPosNetworkSummaryQueryDto {
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

  @ApiProperty({ enum: RetailPosNetworkStatusFilter, required: false })
  @IsOptional()
  @IsEnum(RetailPosNetworkStatusFilter)
  status?: RetailPosNetworkStatusFilter;
}
