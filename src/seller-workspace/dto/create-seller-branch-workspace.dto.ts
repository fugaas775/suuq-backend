import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export enum SellerBranchServiceFormat {
  RETAIL = 'RETAIL',
  BARBER = 'BARBER',
  HOTEL = 'HOTEL',
  PHARMACY = 'PHARMACY',
  GROCERY = 'GROCERY',
  BAKERY = 'BAKERY',
  LAUNDRY = 'LAUNDRY',
  SALON_SPA = 'SALON_SPA',
  BUTCHERY = 'BUTCHERY',
  GAS_STATION = 'GAS_STATION',
  ELECTRONICS = 'ELECTRONICS',
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

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tinNumber?: string;

  /** Optional equity partner referral code (e.g. PART-X7K2). */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(16)
  referralCode?: string;

  /** Optional email of the branch owner (defaults to the creator's email). */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;
}
