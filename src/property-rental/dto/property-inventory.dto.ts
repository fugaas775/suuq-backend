import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const UNIT_TYPES = [
  'STUDIO',
  'ONE_BED',
  'TWO_BED',
  'THREE_BED',
  'HOUSE',
  'ROOM',
  'OTHER',
];

// ── Property units ──────────────────────────────────────────────────────────

export class ListPropertyUnitsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreatePropertyUnitDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 'APT-3B' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  propertyCode!: string;

  @ApiProperty({ example: 'Apartment 3B — Bole' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: 'TWO_BED',
    description: UNIT_TYPES.join(' | '),
  })
  @IsOptional()
  @IsString()
  @IsIn(UNIT_TYPES)
  unitType?: string;

  @ApiPropertyOptional({ example: 'Bole, Addis Ababa' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  capacity?: number;

  @ApiPropertyOptional({ example: 65 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  areaSqm?: number;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}

export class UpdatePropertyUnitDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 'Apartment 3B — Bole' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: 'TWO_BED',
    description: UNIT_TYPES.join(' | '),
  })
  @IsOptional()
  @IsString()
  @IsIn(UNIT_TYPES)
  unitType?: string;

  @ApiPropertyOptional({ example: 'Bole, Addis Ababa' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  capacity?: number;

  @ApiPropertyOptional({ example: 65 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  areaSqm?: number;

  @ApiPropertyOptional({ example: 'INACTIVE' })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}

// ── Rate plans ──────────────────────────────────────────────────────────────

export class ListPropertyRatePlansQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;
}

export class CreatePropertyRatePlanDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 'Standard Monthly — 2 Bed' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: 12,
    description: 'FK to pos_property_units.id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  propertyId?: number;

  @ApiPropertyOptional({ example: 18000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyRate?: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weeklyRate?: number;

  @ApiPropertyOptional({ example: 900 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  nightlyRate?: number;

  @ApiPropertyOptional({ example: 18000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lateFeeAmount?: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxPercent?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  validTo?: string;
}

// ── Reservations ────────────────────────────────────────────────────────────

export class ListPropertyReservationsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: 'HOLD' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreatePropertyReservationDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 'Abdi Kadir' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  renterName!: string;

  @ApiPropertyOptional({ example: 'APT-3B' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  propertyCode?: string;

  @ApiPropertyOptional({ example: '+251911234567' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  renterPhone?: string;

  @ApiPropertyOptional({ example: 'renter@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  renterEmail?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  numberOfOccupants?: number;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  leaseStartAt?: string;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsDateString()
  leaseEndAt?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ratePlanId?: number;

  @ApiPropertyOptional({ example: 'Prefers ground floor' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdatePropertyReservationDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({
    example: 'CONFIRMED',
    description:
      'HOLD | CONFIRMED | MOVED_IN | MOVED_OUT | CANCELLED | NO_SHOW',
  })
  @IsOptional()
  @IsString()
  @IsIn(['HOLD', 'CONFIRMED', 'MOVED_IN', 'MOVED_OUT', 'CANCELLED', 'NO_SHOW'])
  status?: string;

  @ApiPropertyOptional({ example: 'APT-3B' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  propertyCode?: string;

  @ApiPropertyOptional({ example: 'Abdi Kadir' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  renterName?: string;

  @ApiPropertyOptional({ example: '+251911234567' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  renterPhone?: string;

  @ApiPropertyOptional({ example: 'renter@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  renterEmail?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  numberOfOccupants?: number;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  leaseStartAt?: string;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsDateString()
  leaseEndAt?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ratePlanId?: number;

  @ApiPropertyOptional({ example: 'Prefers ground floor' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
