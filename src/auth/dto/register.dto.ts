import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateIf,
  IsNotEmpty, // <-- Import IsNotEmpty
  Matches,
} from 'class-validator';
import { UserRole } from '../../auth/roles.enum';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  // ... other properties are unchanged ...
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
  
  // --- UPDATED PHONE BLOCK ---
  // The old 'phone' field is removed. We now have two required fields.
  
  @IsString()
  @IsNotEmpty()
  phoneCountryCode!: string;

  @IsString()
  @IsNotEmpty()
  // This regex checks for 9 digits, common for Ethiopian numbers after the '0' is dropped.
  // Adjust if other regions have different lengths.
  @Matches(/^\d{9}$/, { message: 'Phone number must be exactly 9 digits.' })
  phoneNumber!: string;
  // -------------------------
}