import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional } from 'class-validator';

export class StylistSummaryQueryDto {
  @ApiProperty({ example: 4, description: 'Branch ID to aggregate over.' })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  fromAt?: string;

  @ApiPropertyOptional({ example: '2026-05-31T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601()
  toAt?: string;
}
