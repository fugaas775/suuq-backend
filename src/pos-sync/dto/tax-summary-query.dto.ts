import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional } from 'class-validator';

export class TaxSummaryQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: '2026-04-23T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  fromAt?: string;

  @ApiPropertyOptional({ example: '2026-04-23T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601()
  toAt?: string;

  @ApiPropertyOptional({ example: 21 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  registerSessionId?: number;
}
