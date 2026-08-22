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
  VIEW_FOLIO = 'VIEW_FOLIO',
  OPEN_ROOM_FOLIO = 'OPEN_ROOM_FOLIO',
  POST_FOLIO_CHARGE = 'POST_FOLIO_CHARGE',
  SETTLE_ROOM_FOLIO = 'SETTLE_ROOM_FOLIO',
  SETTLE_TABLE_FOLIO = 'SETTLE_TABLE_FOLIO',
  VOID_ROOM_FOLIO = 'VOID_ROOM_FOLIO',
  TRANSFER_FOLIO_ROOM = 'TRANSFER_FOLIO_ROOM',
  REOPEN_SETTLED_FOLIO = 'REOPEN_SETTLED_FOLIO',
  // Hospitality workflow permissions
  FIRE_KITCHEN_TICKET = 'FIRE_KITCHEN_TICKET',
  HOLD_KITCHEN_TICKET = 'HOLD_KITCHEN_TICKET',
  MARK_KITCHEN_TICKET_READY = 'MARK_KITCHEN_TICKET_READY',
  COMPLETE_KITCHEN_HANDOFF = 'COMPLETE_KITCHEN_HANDOFF',
  UPDATE_TABLE_STATUS = 'UPDATE_TABLE_STATUS',
  ASSIGN_TABLE_OWNER = 'ASSIGN_TABLE_OWNER',
  SPLIT_OPEN_BILL = 'SPLIT_OPEN_BILL',
  // QSR counter-service permissions.
  //
  // Not a mirror of a server guard, unlike every other block here: printing a
  // kitchen slip is not a route — the till renders and prints it. A QSR slip
  // locks itself to "view only" once printed, because a second copy of a ticket
  // the pass already holds is a plate cooked twice. This is the manager's
  // per-person exception to that lock, for the case the lock cannot tell from a
  // duplicate: a slip that jammed or never left the printer. It lives in this
  // enum because this enum is the allow-list — a permission missing here cannot
  // be stored on a staff account at all, so it could never reach the till.
  REPRINT_ORDER_SLIP = 'REPRINT_ORDER_SLIP',
  // Property-rental booking permissions
  VIEW_PROPERTY_BOARD = 'VIEW_PROPERTY_BOARD',
  OPEN_PROPERTY_BOOKING = 'OPEN_PROPERTY_BOOKING',
  POST_PROPERTY_CHARGE = 'POST_PROPERTY_CHARGE',
  SETTLE_PROPERTY_BOOKING = 'SETTLE_PROPERTY_BOOKING',
  VOID_PROPERTY_BOOKING = 'VOID_PROPERTY_BOOKING',
  TRANSFER_PROPERTY_UNIT = 'TRANSFER_PROPERTY_UNIT',
  SET_PROPERTY_MAINTENANCE = 'SET_PROPERTY_MAINTENANCE',
  // School fee-desk permissions. This enum is the load-bearing allow-list — it
  // is what `@IsEnum(PosRegisterPermission, { each: true })` below validates
  // against, so a permission missing here can never reach a staff account or a
  // token, however it is declared elsewhere.
  VIEW_CLASS_BOARD = 'VIEW_CLASS_BOARD',
  ENROL_STUDENT = 'ENROL_STUDENT',
  POST_FEE_CHARGE = 'POST_FEE_CHARGE',
  SETTLE_FEE_PAYMENT = 'SETTLE_FEE_PAYMENT',
  VOID_STUDENT_FOLIO = 'VOID_STUDENT_FOLIO',
  IMPORT_STUDENT_ROSTER = 'IMPORT_STUDENT_ROSTER',
  // Take a class register. A teacher's permission, not the fee desk's — which
  // is the whole reason it is separate from ENROL_STUDENT.
  MARK_ATTENDANCE = 'MARK_ATTENDANCE',
  // Vehicle-registry permissions (Somali Region Bureau of Trade and Transport).
  //
  // Split finely on purpose: a registry office separates the clerk who takes
  // the details, the inspector who passes the vehicle, the cashier who takes
  // the fee and the registrar who may override any of them. Collapsing those
  // into one VEHICLE_ADMIN would mean the only way to let a clerk renew a
  // licence is to also let them clear a stolen flag.
  VEHICLE_ISSUE = 'VEHICLE_ISSUE',
  VEHICLE_RENEW = 'VEHICLE_RENEW',
  VEHICLE_TRANSFER = 'VEHICLE_TRANSFER',
  VEHICLE_INSPECT = 'VEHICLE_INSPECT',
  VEHICLE_FLAG = 'VEHICLE_FLAG',
  // Raising a stolen flag and clearing one are not the same authority. Any
  // officer may report a vehicle; releasing it is a supervisor's signature.
  VEHICLE_FLAG_CLEAR = 'VEHICLE_FLAG_CLEAR',
  VEHICLE_DEREGISTER = 'VEHICLE_DEREGISTER',
  VEHICLE_PLATE_STOCK = 'VEHICLE_PLATE_STOCK',
  VEHICLE_APPLICATION_REVIEW = 'VEHICLE_APPLICATION_REVIEW',
  // Issue against a failed or missing inspection, or waive a late penalty.
  // Overrides happen in a real office; this makes them recorded rather than
  // impossible, and every use writes a VEHICLE_EVENT row with a reason.
  VEHICLE_OVERRIDE = 'VEHICLE_OVERRIDE',
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
  // The username doubles as the login identifier. Login treats any identifier
  // containing "@" as an email, so a username with "@" (or whitespace) can be
  // created but can never sign in. Restrict to login-safe characters.
  @Matches(/^[a-z0-9][a-z0-9._-]*$/i, {
    message:
      'username can only contain letters, numbers, dots, underscores, and hyphens (no "@" or spaces)',
  })
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
