import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  BranchStaffCapability,
  BranchStaffRole,
} from '../entities/branch-staff-assignment.entity';

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
  @IsEnum(BranchStaffCapability, { each: true })
  @Transform(({ value }) => normalizeStringArray(value))
  capabilities?: BranchStaffCapability[];
}
