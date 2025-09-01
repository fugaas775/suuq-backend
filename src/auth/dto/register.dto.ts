import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateIf,
  Matches,
} from 'class-validator';
import { UserRole } from '../../auth/roles.enum';

export class RegisterDto {
  @IsOptional()
  @IsString()
  firebaseUid?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  roles?: UserRole[];

  @IsOptional()
  @ValidateIf((o) => !o.roles || o.roles.length === 0)
  @IsEnum(UserRole)
  role?: UserRole;

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
  @Matches(/^(\d{9}|0\d{9})$/, {
    message: 'Phone number must be 9 digits, or 10 digits starting with 0.',
  })
  phoneNumber?: string;
}
