import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Same rule as a manual staff username (`create-branch-staff-manual-account.dto`):
 * no "@" and no whitespace, because sign-in routes any "@" identifier to the
 * email lookup and an "@" username can be saved but never signed in with.
 * A phone number is a valid username — the office's default for a parent.
 */
export const GUARDIAN_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export class ListSchoolGuardiansQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

export class CreateSchoolGuardianDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(64)
  @Matches(GUARDIAN_USERNAME_PATTERN, {
    message:
      'Username may contain letters, digits, dots, hyphens and underscores only — no "@" and no spaces.',
  })
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  relationship?: string;

  /** The pupils' record ids (`pos_suspended_carts.id`) on this branch. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  folioIds!: number[];
}

export class UpdateSchoolGuardianDto {
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  relationship?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Given → REPLACES the set of pupils this login may read. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  folioIds?: number[];
}

export class ResetSchoolGuardianPasswordDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}

/** The parent's own sign-in — username only, never an email. */
export class GuardianPortalLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class GuardianPortalChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword!: string;
}
