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
import { GUARDIAN_USERNAME_PATTERN } from './school-guardian.dto';

/** Same rule as a parent's or a manual staff username: no "@", no spaces. */
const USERNAME_MESSAGE =
  'Username may contain letters, digits, dots, hyphens and underscores only — no "@" and no spaces.';

export class ListSchoolStudentAccountsQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

export class CreateSchoolStudentAccountDto {
  @IsInt()
  branchId!: number;

  /** The pupil's record id (`pos_suspended_carts.id`) on this branch. */
  @IsInt()
  folioId!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(64)
  @Matches(GUARDIAN_USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;
}

/**
 * Logins for many pupils in one call. The server picks each username (the
 * admission number, else the name — never one taken) and, with no common
 * `password`, a random one per pupil; the answer carries them in clear,
 * once, for the cards.
 */
export class CreateSchoolStudentAccountsBulkDto {
  @IsInt()
  branchId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  folioIds!: number[];

  /** One password for every login; absent → a random one per pupil. */
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;
}

export class UpdateSchoolStudentAccountDto {
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(GUARDIAN_USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetSchoolStudentAccountPasswordDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}

/** The pupil's own sign-in — username only, never an email. */
export class StudentPortalLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class StudentPortalChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword!: string;
}
