import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { BranchTransferStatus } from '../../branches/entities/branch-transfer.entity';

export class BranchTransferQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fromBranchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  toBranchId?: number;

  @IsOptional()
  @IsEnum(BranchTransferStatus)
  status?: BranchTransferStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}
