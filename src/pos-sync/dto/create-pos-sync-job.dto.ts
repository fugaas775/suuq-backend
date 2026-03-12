import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PosSyncStatus, PosSyncType } from '../entities/pos-sync-job.entity';

export class CreatePosSyncJobDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  partnerCredentialId?: number;

  @IsEnum(PosSyncType)
  syncType!: PosSyncType;

  @IsOptional()
  @IsEnum(PosSyncStatus)
  status?: PosSyncStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalJobId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;

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
}
