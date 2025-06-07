import { IsEmail, IsString, MinLength, IsOptional, IsArray, IsEnum, ValidateIf } from 'class-validator';
import { UserRole } from '../../auth/roles.enum'; // Corrected import path

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  // Provide 'roles' as the primary way to set roles.
  // 'role' can be a deprecated fallback or removed if not needed.
  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { 
    each: true, 
    message: 'Each role in roles must be a valid UserRole enum value (CUSTOMER, VENDOR, ADMIN, DELIVERER)' 
  })
  roles?: UserRole[];

  // If you still want to accept a single 'role' for some registration flows,
  // make sure it's validated and then converted to an array in the service.
  // This is optional and can be removed if 'roles' array is always used.
  @IsOptional()
  @ValidateIf(o => !o.roles || o.roles.length === 0) // Only validate 'role' if 'roles' is not provided
  @IsEnum(UserRole, { 
    message: 'Role must be a valid UserRole enum value (CUSTOMER, VENDOR, ADMIN, DELIVERER)' 
  })
  role?: UserRole;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  storeName?: string;
}