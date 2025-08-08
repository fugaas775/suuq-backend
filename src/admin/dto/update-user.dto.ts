import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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
}
