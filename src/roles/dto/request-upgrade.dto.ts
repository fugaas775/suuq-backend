import { IsArray, ArrayNotEmpty, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { UserRole } from '../../auth/roles.enum';

export class RequestRoleUpgradeDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(UserRole, { each: true })
  roles!: UserRole[]; // e.g., ['VENDOR'] or ['DELIVERER']

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsOptional()
  @IsString()
  phoneCountryCode?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsString()
  businessLicenseNumber?: string;

  // For now, client will upload via /verification/request and server will copy docs from user profile if needed
}
