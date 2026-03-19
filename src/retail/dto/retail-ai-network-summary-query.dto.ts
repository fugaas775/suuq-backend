import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

export enum RetailAiNetworkSeverityFilter {
  INFO = 'INFO',
  WATCH = 'WATCH',
  CRITICAL = 'CRITICAL',
}

export class RetailAiNetworkSummaryQueryDto {
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

  @ApiProperty({ enum: RetailAiNetworkSeverityFilter, required: false })
  @IsOptional()
  @IsEnum(RetailAiNetworkSeverityFilter)
  severity?: RetailAiNetworkSeverityFilter;
}
