import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateBranchWorkspaceDto {
  @ApiPropertyOptional({ description: 'Branch display name' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Street address' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: 'City' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  city?: string;

  @ApiPropertyOptional({ description: 'Country' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  country?: string;

  @ApiPropertyOptional({ description: 'IANA timezone identifier' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Branch phone number' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ description: 'Branch TIN number' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tinNumber?: string;

  @ApiPropertyOptional({
    description:
      'Default RETAIL marketplace category id pre-selected when adding products. Send null to clear.',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultCategoryId?: number | null;
}
