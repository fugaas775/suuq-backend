import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  IsDateString,
  IsEmail,
} from 'class-validator';
import { Type, Expose } from 'class-transformer';
import {
  VerificationStatus,
  VerificationDocument,
} from '../../users/entities/user.entity';

// This DTO can be reused if you have other places where you need to validate this structure.
class VerificationDocumentDto implements VerificationDocument {
  @IsString()
  url: string;

  @IsString()
  name: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  phoneCountryCode?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerificationDocumentDto)
  verificationDocuments?: VerificationDocument[];

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  // --- Vendor Fields ---
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
  @IsArray()
  @IsNumber({}, { each: true })
  interestedCategoryIds?: number[];

  @IsOptional()
  @IsDateString()
  interestedCategoriesLastUpdated?: Date;
}
