import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SellerBranchServiceFormat } from './create-seller-branch-workspace.dto';

export class InitiateAdditionalBranchCreationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  branchName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  city?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  country?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
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

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(9)
  phoneNumber!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tinNumber?: string;

  /**
   * Billing period for the new branch: 'MONTHLY' (1 month) or 'ONE_YEAR'
   * (1 year, 10% discount). Defaults to MONTHLY in the service when omitted.
   */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsIn(['MONTHLY', 'ONE_YEAR'])
  subscriptionPeriod?: 'MONTHLY' | 'ONE_YEAR';

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
