import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional } from 'class-validator';
import {
  PosSyncStatus,
  PosSyncType,
} from '../../pos-sync/entities/pos-sync-job.entity';
import { PaginationQueryDto } from './pagination-query.dto';

export class PosSyncJobQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  partnerCredentialId?: number;

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
