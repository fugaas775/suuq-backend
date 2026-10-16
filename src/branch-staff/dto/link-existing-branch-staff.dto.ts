import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { BranchStaffRole } from '../entities/branch-staff-assignment.entity';
import { PosRegisterPermission } from './create-branch-staff-manual-account.dto';

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

/**
 * Gives a login that already works at one of the owner's branches access to
 * this one too — Muntaha Hotel's manager also running Muntaha Cafeteria. The
 * person keeps one username and password; the branch switcher picks.
 * Everything except the account is this branch's own: role, lane and
 * permissions are set here exactly as on a new login.
 */
export class LinkExistingBranchStaffDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @IsEnum(BranchStaffRole)
  role!: BranchStaffRole;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(PosRegisterPermission, { each: true })
  @Transform(({ value }) => normalizeStringArray(value))
  permissions?: PosRegisterPermission[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Transform(({ value }) => normalizeStringArray(value))
  assignedSurfaces?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Transform(({ value }) => normalizeStringArray(value))
  capabilities?: string[];

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, {
    message:
      'posExperienceProfileCode must be uppercase alphanumeric with underscores',
  })
  @MaxLength(64)
  posExperienceProfileCode?: string | null;
}
