import { IsOptional, IsString } from 'class-validator';

// Safe subset for self-service profile updates; excludes roles/email/password
export class UpdateOwnProfileDto {
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
}
