import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BranchStaffRole } from '../entities/branch-staff-assignment.entity';

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export class UpdateBranchStaffAssignmentDto {
  @IsOptional()
  @IsEnum(BranchStaffRole)
  role?: BranchStaffRole;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Transform(({ value }) => normalizeStringArray(value))
  assignedSurfaces?: string[] | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Z][A-Z0-9_]*(?::[A-Z0-9_]+)?$/, {
    each: true,
    message:
      'Each capability must be an uppercase identifier, optionally with a colon-separated qualifier (e.g. MANAGE_BRANCH_STAFF or KITCHEN_STATION:HOT_LINE)',
  })
  @Transform(({ value }) => normalizeStringArray(value))
  capabilities?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Z0-9_]+$/, {
    message:
      'posExperienceProfileCode must be uppercase alphanumeric with underscores',
  })
  posExperienceProfileCode?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  serviceSharePct?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
