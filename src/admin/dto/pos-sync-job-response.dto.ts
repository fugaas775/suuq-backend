import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PosSyncStatus,
  PosSyncType,
} from '../../pos-sync/entities/pos-sync-job.entity';

export class PosSyncFailedEntryResponseDto {
  @ApiProperty()
  entryIndex!: number;

  @ApiPropertyOptional()
  productId?: number | null;

  @ApiPropertyOptional()
  aliasType?: string | null;

  @ApiPropertyOptional()
  aliasValue?: string | null;

  @ApiProperty()
  quantity!: number;

  @ApiPropertyOptional()
  movementType?: string | null;

  @ApiPropertyOptional()
  counterpartyBranchId?: number | null;

  @ApiPropertyOptional()
  transferId?: number | null;

  @ApiPropertyOptional()
  note?: string | null;

  @ApiProperty()
  error!: string;
}

export class PosSyncJobResponseDto {
  @ApiProperty()
  id!: number;

  @ApiPropertyOptional()
  branchId?: number | null;

  @ApiPropertyOptional()
  partnerCredentialId?: number | null;

  @ApiProperty({ enum: PosSyncType })
  syncType!: PosSyncType;

  @ApiProperty({ enum: PosSyncStatus })
  status!: PosSyncStatus;

  @ApiPropertyOptional()
  externalJobId?: string | null;

  @ApiPropertyOptional()
  idempotencyKey?: string | null;

  @ApiProperty()
  acceptedCount!: number;

  @ApiProperty()
  rejectedCount!: number;

  @ApiPropertyOptional()
  processedAt?: Date | null;

  @ApiProperty({ type: [PosSyncFailedEntryResponseDto] })
  failedEntries!: PosSyncFailedEntryResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
