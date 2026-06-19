import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
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

  @ApiPropertyOptional({
    description:
      'HOTEL standard checkout time as "HH:MM" 24h (e.g. "11:00", "11:30"). ' +
      'Seeds the folio default time and the early-check-in / late-checkout fee ' +
      'boundary on the register. Send null to clear (falls back to 11:00).',
    nullable: true,
    example: '11:30',
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @ValidateIf((o) => o.checkoutPolicyTime !== null)
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'checkoutPolicyTime must be a valid "HH:MM" 24h time',
  })
  checkoutPolicyTime?: string | null;

  @ApiPropertyOptional({
    description: 'Brand logo URL for this branch. Send null to clear.',
    nullable: true,
    example: 'https://cdn.example.com/branch-logo.png',
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(512)
  logoUrl?: string | null;
}
