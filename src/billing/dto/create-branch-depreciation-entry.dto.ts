import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateBranchDepreciationEntryDto {
  @ApiProperty()
  @IsNumber()
  @Min(1)
  fixedAssetId!: number;

  @ApiProperty({ example: 1200 })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ description: 'ISO timestamp for depreciation posting date' })
  @IsISO8601()
  occurredAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
