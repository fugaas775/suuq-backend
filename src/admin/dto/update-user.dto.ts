import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { VerificationStatus } from '../../users/entities/user.entity';

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
  @IsString({ each: true })
  verificationDocuments?: string[];

  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}
