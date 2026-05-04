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
  BranchFixedAssetCategory,
  BranchFixedAssetStatus,
} from '../entities/branch-fixed-asset.entity';

export class CreateBranchFixedAssetDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: BranchFixedAssetCategory })
  @IsEnum(BranchFixedAssetCategory)
  category!: BranchFixedAssetCategory;

  @ApiPropertyOptional({
    enum: BranchFixedAssetStatus,
    default: BranchFixedAssetStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(BranchFixedAssetStatus)
  status?: BranchFixedAssetStatus;

  @ApiProperty({ description: 'ISO timestamp for acquisition date' })
  @IsISO8601()
  acquiredAt!: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(0)
  capitalizationAmount!: number;

  @ApiPropertyOptional({ example: 5000, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salvageValue?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  usefulLifeMonths?: number;

  @ApiPropertyOptional({ default: 'ETB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
