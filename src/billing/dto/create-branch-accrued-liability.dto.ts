import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  BranchAccruedLiabilityCategory,
  BranchAccruedLiabilityStatus,
} from '../entities/branch-accrued-liability.entity';

export class CreateBranchAccruedLiabilityDto {
  @ApiProperty()
  @IsString()
  label!: string;

  @ApiProperty({ enum: BranchAccruedLiabilityCategory })
  @IsEnum(BranchAccruedLiabilityCategory)
  category!: BranchAccruedLiabilityCategory;

  @ApiPropertyOptional({
    enum: BranchAccruedLiabilityStatus,
    default: BranchAccruedLiabilityStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(BranchAccruedLiabilityStatus)
  status?: BranchAccruedLiabilityStatus;

  @ApiProperty({ example: 18000 })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ description: 'ISO timestamp for accrual date' })
  @IsISO8601()
  accruedAt!: string;

  @ApiPropertyOptional({ description: 'ISO timestamp for due date' })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional({ default: 'ETB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
