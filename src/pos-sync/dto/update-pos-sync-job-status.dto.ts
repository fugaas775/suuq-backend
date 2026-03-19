import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { PosSyncStatus } from '../entities/pos-sync-job.entity';

export class UpdatePosSyncJobStatusDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  branchId?: number;

  @IsEnum(PosSyncStatus)
  status!: PosSyncStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  acceptedCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rejectedCount?: number;

  @IsOptional()
  @IsDateString()
  processedAt?: string;
}
