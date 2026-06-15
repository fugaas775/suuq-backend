import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SupplierStaffRole } from '../entities/supplier-staff-assignment.entity';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Create a manual supplier-staff login — the wholesaler-side mirror of branch
 * staff manual accounts. A manager provisions a username + password directly
 * (no email invite); the teammate signs in with those credentials.
 */
export class CreateSupplierStaffManualAccountDto {
  @ApiPropertyOptional({ example: 'Amina Yusuf' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => trimString(value))
  displayName?: string;

  @ApiProperty({ example: 'amina' })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  // The username doubles as the login identifier. Login treats any identifier
  // containing "@" as an email, so a username with "@" (or whitespace) can be
  // created but can never sign in. Restrict to login-safe characters.
  @Matches(/^[a-z0-9][a-z0-9._-]*$/i, {
    message:
      'username can only contain letters, numbers, dots, underscores, and hyphens (no "@" or spaces)',
  })
  @Transform(({ value }) => trimString(value))
  username!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    enum: SupplierStaffRole,
    default: SupplierStaffRole.OPERATOR,
  })
  @IsOptional()
  @IsEnum(SupplierStaffRole)
  @Type(() => String)
  role?: SupplierStaffRole;
}
