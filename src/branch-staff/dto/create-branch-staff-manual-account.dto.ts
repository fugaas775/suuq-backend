import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  BranchStaffCapability,
  BranchStaffRole,
} from '../entities/branch-staff-assignment.entity';

export enum PosRegisterPermission {
  OPEN_REGISTER = 'OPEN_REGISTER',
  CLOSE_REGISTER = 'CLOSE_REGISTER',
  SUSPEND_SALE = 'SUSPEND_SALE',
  SYNC_POS_OUTBOX = 'SYNC_POS_OUTBOX',
  PROCESS_RETURN = 'PROCESS_RETURN',
  REOPEN_SETTLED_BILL = 'REOPEN_SETTLED_BILL',
  VOID_SETTLED_BILL = 'VOID_SETTLED_BILL',
  RESUME_SUSPENDED_SALE = 'RESUME_SUSPENDED_SALE',
  DISCARD_SUSPENDED_SALE = 'DISCARD_SUSPENDED_SALE',
}

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export class CreateBranchStaffManualAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => trimString(value))
  displayName?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Transform(({ value }) => trimString(value))
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(BranchStaffRole)
  @Type(() => String)
  role!: BranchStaffRole;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(PosRegisterPermission, { each: true })
  @Transform(({ value }) => normalizeStringArray(value))
  permissions: PosRegisterPermission[] = [];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Transform(({ value }) => normalizeStringArray(value))
  assignedSurfaces?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(BranchStaffCapability, { each: true })
  @Transform(({ value }) => normalizeStringArray(value))
  capabilities?: BranchStaffCapability[];
}
