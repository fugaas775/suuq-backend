import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VehicleClassStatus } from '../entities/vehicle-class.entity';
import { VehicleOwnerKind } from '../entities/vehicle-owner.entity';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

/** Chassis and plate numbers are compared case-folded, so store them folded. */
function upperString(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class VehicleBranchScopeDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

// ── Classes ─────────────────────────────────────────────────────────────────

export class CreateVehicleClassDto extends VehicleBranchScopeDto {
  @Transform(({ value }) => upperString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  nameEn!: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameSo?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameAm?: string;

  @Transform(({ value }) => upperString(value))
  @IsOptional()
  @IsString()
  @MaxLength(16)
  plateSeriesPrefix?: string;

  /**
   * Capped at 120 months. Not arbitrary: a licence longer than a decade is
   * almost certainly a typo for months-vs-years, and it would silently issue a
   * vehicle a certificate nobody alive at this office will see expire.
   */
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  renewalMonths?: number;

  @IsOptional()
  @IsBoolean()
  inspectionRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  plateFollowsVehicle?: boolean;

  @Transform(({ value }) => upperString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  registrationFeeSku?: string;

  @Transform(({ value }) => upperString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  renewalFeeSku?: string;

  @Transform(({ value }) => upperString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  transferFeeSku?: string;

  @Transform(({ value }) => upperString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  plateFeeSku?: string;

  @Transform(({ value }) => upperString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  inspectionFeeSku?: string;

  @Transform(({ value }) => upperString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  penaltyFeeSku?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateVehicleClassDto extends CreateVehicleClassDto {
  @IsOptional()
  @IsEnum(VehicleClassStatus)
  status?: VehicleClassStatus;
}

// ── Plate series ────────────────────────────────────────────────────────────

export class CreatePlateSeriesDto extends VehicleBranchScopeDto {
  @Transform(({ value }) => upperString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  prefix!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  rangeStart!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  rangeEnd!: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  numberWidth?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  classId?: number;
}

// ── Registration intake ─────────────────────────────────────────────────────

export class VehicleOwnerInputDto {
  /** Reuse an existing owner. When given, every other field is ignored. */
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  ownerId?: number;

  @IsOptional()
  @IsEnum(VehicleOwnerKind)
  kind?: VehicleOwnerKind;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nationalId?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tin?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(512)
  address?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  zone?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  woreda?: string;
}

export class VehicleInputDto {
  @Transform(({ value }) => upperString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  vin!: string;

  @Transform(({ value }) => upperString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  engineNumber?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  make?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;

  /**
   * 1900 to a little past today. A model year in the future by more than one is
   * a typo, and a certificate carrying it is a certificate that reads wrong for
   * the life of the vehicle.
   */
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  modelYear?: number;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  colour?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  fuel?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  seats?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  grossWeightKg?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  engineCc?: number;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  importRef?: string;
}

export class DraftRegistrationDto extends VehicleBranchScopeDto {
  @Type(() => Number)
  @IsInt()
  classId!: number;

  @ValidateNested()
  @Type(() => VehicleOwnerInputDto)
  owner!: VehicleOwnerInputDto;

  @ValidateNested()
  @Type(() => VehicleInputDto)
  vehicle!: VehicleInputDto;

  /**
   * Draw the plate from a specific series. Omitted, the office's oldest ACTIVE
   * series matching the class is used — which is what a clerk wants, because
   * plates go out in the order the office was given them.
   */
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  plateSeriesId?: number;
}

export class IssueRegistrationDto extends VehicleBranchScopeDto {
  /**
   * The settled checkout that paid the fee. Issuance is idempotent on it — a
   * unique index means a retried settle cannot mint a second registration or
   * consume a second plate.
   */
  @Type(() => Number)
  @IsInt()
  checkoutId!: number;
}

// ── Queries ─────────────────────────────────────────────────────────────────

export class SearchVehiclesDto extends VehicleBranchScopeDto {
  /** Plate, chassis number, or owner name. One box, because a counter has one. */
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListVehicleClassesDto extends VehicleBranchScopeDto {
  @IsOptional()
  @IsEnum(VehicleClassStatus)
  status?: VehicleClassStatus;
}

export class ListPlateStockDto extends VehicleBranchScopeDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  seriesId?: number;
}
