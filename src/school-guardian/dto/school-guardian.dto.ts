import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
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

  /** A corrected username (the phone typed wrong) — the same rule as at creation. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(GUARDIAN_USERNAME_PATTERN, {
    message:
      'Username may contain letters, digits, dots, hyphens and underscores only — no "@" and no spaces.',
  })
  username?: string;

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

/* ── Notices from the office to parents ─────────────────────────────────── */

export const NOTICE_AUDIENCES = ['ALL', 'CLASSES'] as const;

export class ListSchoolNoticesQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

export class CreateSchoolNoticeDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsIn(NOTICE_AUDIENCES)
  audience?: 'ALL' | 'CLASSES';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  classCodes?: string[];

  /** YYYY-MM-DD, the last day it shows; '' or absent = until taken down. */
  @IsOptional()
  @IsString()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/)
  expiresAt?: string;
}

export class UpdateSchoolNoticeDto {
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsIn(NOTICE_AUDIENCES)
  audience?: 'ALL' | 'CLASSES';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  classCodes?: string[];

  /** '' clears it. */
  @IsOptional()
  @IsString()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/)
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
