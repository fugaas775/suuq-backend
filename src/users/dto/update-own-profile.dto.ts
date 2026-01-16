import { IsOptional, IsString, IsArray, IsNumber } from 'class-validator';

// Safe subset for self-service profile updates; excludes roles/email/password
export class UpdateOwnProfileDto {
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  interestedCategoryIds?: number[];

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsString()
  phoneCountryCode?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  // --- Vendor / Contact Fields ---
  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  businessLicenseNumber?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  registrationCountry?: string;

  @IsOptional()
  @IsString()
  registrationRegion?: string;

  @IsOptional()
  @IsString()
  registrationCity?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  vendorPhoneNumber?: string;

  @IsOptional()
  @IsString()
  vendorEmail?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  vendorAvatarUrl?: string;

  @IsOptional()
  @IsString()
  telebirrAccount?: string;

  @IsOptional()
  @IsString()
  telebirr_account?: string;

  @IsOptional()
  @IsString()
  telebirrMobile?: string;
}
