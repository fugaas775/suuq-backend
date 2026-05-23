import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { HotelRoomStatus } from '../entities/hotel-room.entity';
import { HotelReservationStatus } from '../entities/hotel-reservation.entity';

// ══════════════════════════════════════════════════════════════
// HOTEL ROOMS
// ══════════════════════════════════════════════════════════════

export class CreateHotelRoomDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => String(value ?? '').trim())
  roomNumber!: string;

  @IsString()
  @IsOptional()
  @Transform(
    ({ value }) =>
      String(value ?? '')
        .trim()
        .toUpperCase() || undefined,
  )
  roomType?: string;

  @IsInt()
  @IsOptional()
  floor?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  maxOccupancy?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(Object.values(HotelRoomStatus))
  @IsOptional()
  status?: HotelRoomStatus;
}

export class UpdateHotelRoomDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @IsOptional()
  @Transform(
    ({ value }) =>
      String(value ?? '')
        .trim()
        .toUpperCase() || undefined,
  )
  roomType?: string;

  @IsInt()
  @IsOptional()
  floor?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  maxOccupancy?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(Object.values(HotelRoomStatus))
  @IsOptional()
  status?: HotelRoomStatus;
}

export class ListHotelRoomsQueryDto {
  @IsInt()
  @Type(() => Number)
  branchId!: number;

  @IsIn(Object.values(HotelRoomStatus))
  @IsOptional()
  status?: HotelRoomStatus;

  @IsString()
  @IsOptional()
  roomType?: string;
}

// ══════════════════════════════════════════════════════════════
// HOTEL RATE PLANS
// ══════════════════════════════════════════════════════════════

export class CreateHotelRatePlanDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => String(value ?? '').trim())
  name!: string;

  @IsString()
  @IsOptional()
  @Transform(
    ({ value }) =>
      String(value ?? '')
        .trim()
        .toUpperCase() || undefined,
  )
  roomType?: string;

  @IsNumber()
  @IsPositive()
  weekdayRate!: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  weekendRate?: number;

  @IsString()
  @IsOptional()
  @Transform(
    ({ value }) =>
      String(value ?? '')
        .trim()
        .toUpperCase() || 'ETB',
  )
  currency?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  taxPercent?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  serviceChargePercent?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ListHotelRatePlansQueryDto {
  @IsInt()
  @Type(() => Number)
  branchId!: number;

  @IsString()
  @IsOptional()
  roomType?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}

// ══════════════════════════════════════════════════════════════
// HOTEL RESERVATIONS
// ══════════════════════════════════════════════════════════════

export class CreateHotelReservationDto {
  @IsInt()
  branchId!: number;

  @IsIn(Object.values(HotelReservationStatus))
  @IsOptional()
  status?: HotelReservationStatus;

  @IsString()
  @IsOptional()
  @Transform(
    ({ value }) =>
      String(value ?? '')
        .trim()
        .toUpperCase() || undefined,
  )
  roomType?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim() || undefined)
  roomNumber?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => String(value ?? '').trim())
  guestName!: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim() || undefined)
  guestPhone?: string;

  @IsString()
  @IsOptional()
  @Transform(
    ({ value }) =>
      String(value ?? '')
        .trim()
        .toLowerCase() || undefined,
  )
  guestEmail?: string;

  @IsString()
  @IsOptional()
  guestNationality?: string;

  @IsString()
  @IsOptional()
  guestIdType?: string;

  @IsString()
  @IsOptional()
  guestIdNumber?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  numberOfGuests?: number;

  @IsDateString()
  checkInAt!: string;

  @IsDateString()
  checkOutAt!: string;

  @IsInt()
  @IsOptional()
  ratePlanId?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateHotelReservationDto {
  @IsInt()
  branchId!: number;

  @IsIn(Object.values(HotelReservationStatus))
  @IsOptional()
  status?: HotelReservationStatus;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim() || undefined)
  roomNumber?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim() || undefined)
  guestName?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim() || undefined)
  guestPhone?: string;

  @IsDateString()
  @IsOptional()
  checkInAt?: string;

  @IsDateString()
  @IsOptional()
  checkOutAt?: string;

  @IsInt()
  @IsOptional()
  ratePlanId?: number;

  @IsInt()
  @IsOptional()
  folioId?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ListHotelReservationsQueryDto {
  @IsInt()
  @Type(() => Number)
  branchId!: number;

  @IsIn(Object.values(HotelReservationStatus))
  @IsOptional()
  status?: HotelReservationStatus;

  /** Filter by check-in date (YYYY-MM-DD) */
  @IsDateString()
  @IsOptional()
  checkInDate?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;
}

// ══════════════════════════════════════════════════════════════
// NIGHT AUDIT
// ══════════════════════════════════════════════════════════════

export class TriggerNightAuditDto {
  @IsInt()
  branchId!: number;

  /**
   * ISO date to audit (defaults to today in EAT UTC+3).
   * Format: YYYY-MM-DD
   */
  @IsDateString()
  @IsOptional()
  auditDate?: string;

  /**
   * Default rate plan ID to use if no room-type-specific plan is found.
   * Optional — folios without a resolvable rate are skipped with a note.
   */
  @IsInt()
  @IsOptional()
  defaultRatePlanId?: number;
}

export class ListNightAuditLogsQueryDto {
  @IsInt()
  @Type(() => Number)
  branchId!: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number;
}
