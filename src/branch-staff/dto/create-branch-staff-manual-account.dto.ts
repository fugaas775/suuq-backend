import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
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
  // Hotel folio permissions
  VIEW_FOLIO_BOARD = 'VIEW_FOLIO_BOARD',
  OPEN_ROOM_FOLIO = 'OPEN_ROOM_FOLIO',
  POST_FOLIO_CHARGE = 'POST_FOLIO_CHARGE',
  SETTLE_ROOM_FOLIO = 'SETTLE_ROOM_FOLIO',
  VOID_ROOM_FOLIO = 'VOID_ROOM_FOLIO',
  TRANSFER_FOLIO_ROOM = 'TRANSFER_FOLIO_ROOM',
  // Hospitality workflow permissions
  FIRE_KITCHEN_TICKET = 'FIRE_KITCHEN_TICKET',
  HOLD_KITCHEN_TICKET = 'HOLD_KITCHEN_TICKET',
  MARK_KITCHEN_TICKET_READY = 'MARK_KITCHEN_TICKET_READY',
  COMPLETE_KITCHEN_HANDOFF = 'COMPLETE_KITCHEN_HANDOFF',
  UPDATE_TABLE_STATUS = 'UPDATE_TABLE_STATUS',
  ASSIGN_TABLE_OWNER = 'ASSIGN_TABLE_OWNER',
  SPLIT_OPEN_BILL = 'SPLIT_OPEN_BILL',
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
  @Transform(({ value }) => normalizeStringArray(value))
  capabilities?: string[];

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, {
    message:
      'posExperienceProfileCode must be uppercase alphanumeric with underscores',
  })
  @MaxLength(64)
  @Transform(({ value }) => trimString(value))
  posExperienceProfileCode?: string | null;
}
