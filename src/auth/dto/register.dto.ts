import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateIf,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { UserRole } from '../../auth/roles.enum';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  firebaseUid!: string;

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
  @ValidateIf(o => !o.roles || o.roles.length === 0)
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  storeName?: string;
  
  @IsString()
  @IsNotEmpty()
  phoneCountryCode!: string;

  @IsString()
  @IsNotEmpty()
  // --- UPDATED VALIDATION LOGIC ---
  @Matches(/^(\d{9}|0\d{9})$/, { message: 'Phone number must be 9 digits, or 10 digits starting with 0.' })
  phoneNumber!: string;
}