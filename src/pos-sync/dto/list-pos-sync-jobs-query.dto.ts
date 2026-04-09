import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PosSyncStatus, PosSyncType } from '../entities/pos-sync-job.entity';

export class ListPosSyncJobsQueryDto {
  @ApiPropertyOptional({ example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ enum: PosSyncType })
  @IsOptional()
  @IsEnum(PosSyncType)
  syncType?: PosSyncType;

  @ApiPropertyOptional({ enum: PosSyncStatus })
  @IsOptional()
  @IsEnum(PosSyncStatus)
  status?: PosSyncStatus;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  failedOnly?: boolean;
}
