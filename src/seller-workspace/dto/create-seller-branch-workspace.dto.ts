import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export enum SellerBranchServiceFormat {
  RETAIL = 'RETAIL',
  QSR = 'QSR',
  FSR = 'FSR',
}

export class CreateSellerBranchWorkspaceDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  branchName!: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  city?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  country?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  address?: string;

  @Transform(({ value }) =>
    String(value || '')
      .trim()
      .toUpperCase(),
  )
  @IsEnum(SellerBranchServiceFormat)
  serviceFormat!: SellerBranchServiceFormat;

  @Transform(({ value }) =>
    String(value || '')
      .trim()
      .toUpperCase(),
  )
  @IsString()
  @MinLength(3)
  defaultCurrency!: string;
}
