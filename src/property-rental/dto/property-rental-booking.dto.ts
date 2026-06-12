import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const PROPERTY_CHARGE_GROUP_CODES = [
  'RENT',
  'UTILITIES',
  'MAINTENANCE',
  'CLEANING',
  'SECURITY_DEPOSIT',
  'LATE_FEES',
  'PARKING',
  'OTHER_FEES',
] as const;

export class ListPropertyBookingsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({
    example: 'OPEN',
    description: 'Filter by booking status (OPEN | SETTLED | VOIDED)',
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class OpenPropertyBookingDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 'APT-3B' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  propertyCode!: string;

  @ApiPropertyOptional({
    example: 12,
    description: 'FK to pos_property_units.id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  propertyId?: number;

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

  @ApiPropertyOptional({
    example: 'INDIVIDUAL',
    description: 'INDIVIDUAL | BUSINESS',
  })
  @IsOptional()
  @IsString()
  @IsIn(['INDIVIDUAL', 'BUSINESS'])
  tenantType?: string;

  @ApiPropertyOptional({ example: 'ET' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  renterNationality?: string;

  @ApiPropertyOptional({ example: 'PASSPORT' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  idType?: string;

  @ApiPropertyOptional({ example: 'EP1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idNumber?: string;

  @ApiPropertyOptional({
    example: 45.5,
    description: 'Floor area in square metres',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  areaSqm?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'FK to pos_property_rate_plans.id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ratePlanId?: number;

  @ApiPropertyOptional({
    example: 8,
    description: 'FK to pos_property_reservations.id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reservationId?: number;

  @ApiPropertyOptional({ example: '2026-06-01', description: 'Move-in date' })
  @IsOptional()
  @IsDateString()
  leaseStartAt?: string;

  @ApiPropertyOptional({ example: '2026-12-01', description: 'Lease end date' })
  @IsOptional()
  @IsDateString()
  leaseEndAt?: string;

  @ApiPropertyOptional({
    example: 'MONTH',
    description: 'Billing cadence: MONTH (default) | WEEK',
  })
  @IsOptional()
  @IsString()
  @IsIn(['MONTH', 'WEEK'])
  billingCycle?: string;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Security deposit collected at move-in',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount?: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 'property-open-1717200000000-abc' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: 'property-local-91' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  localRef?: string;
}

export class PostPropertyChargeDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({
    example: 'RENT',
    description: PROPERTY_CHARGE_GROUP_CODES.join(' | '),
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  chargeGroupCode?: string;

  @ApiProperty({ example: 'Monthly Rent' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  chargeName!: string;

  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Number of billing periods/units',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Mirror this charge onto the next billing cycle',
  })
  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @ApiPropertyOptional({ example: 'June electricity reading 320kWh' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: 'property-charge-local-91-line-rent-1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class PropertyBookingPaymentRowDto {
  @ApiProperty({
    example: 'CASH',
    description:
      'CASH | CARD | MOBILE_MONEY | BANK_TRANSFER | CREDIT_ACCOUNT | VOUCHER | FOREIGN_CURRENCY_CASH',
  })
  @IsString()
  @MaxLength(32)
  method!: string;

  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 'TXN-ABC123' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;
}

export class SettlePropertyBookingDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  /**
   * Array of payment rows supporting split and multi-currency settlement.
   * When provided, legacy flat fields (paymentMethod, paidAmount) are ignored.
   */
  @ApiPropertyOptional({ type: [PropertyBookingPaymentRowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyBookingPaymentRowDto)
  payments?: PropertyBookingPaymentRowDto[];

  @ApiPropertyOptional({
    example: 1500,
    description: 'Amount of the security deposit refunded at move-out',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositRefund?: number;

  @ApiPropertyOptional({
    example: 2000,
    description: 'Total deposit on file at move-out (held = refund + forfeit)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositHeld?: number;

  @ApiPropertyOptional({
    example: 500,
    description: 'Amount of the security deposit kept (forfeited) at move-out',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositForfeit?: number;

  @ApiPropertyOptional({ example: 'checkout-999' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  checkoutId?: string;

  /** @deprecated Use payments[].method instead. */
  @ApiPropertyOptional({ example: 'CASH' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  paymentMethod?: string;

  /** @deprecated Use payments[].amount instead. */
  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  settledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

/**
 * Records a single partial (instalment) payment against an OPEN booking. The
 * cumulative total accrues on `paidAmount`; each call appends to the ledger.
 */
export class RecordPropertyPaymentDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  /** Tender rows for this instalment (split payments supported). */
  @ApiPropertyOptional({ type: [PropertyBookingPaymentRowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyBookingPaymentRowDto)
  payments?: PropertyBookingPaymentRowDto[];

  /** Flat amount fallback when no payments[] array is provided. */
  @ApiPropertyOptional({ example: 30000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ example: 'CASH' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 'checkout-777' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  checkoutId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class VoidPropertyBookingDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 'Booking opened in error' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class TransferPropertyUnitDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiProperty({ example: 'APT-5A' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  newPropertyCode!: string;

  @ApiPropertyOptional({ example: 'Abdi Kadir' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  newRenterName?: string;

  @ApiPropertyOptional({ example: 'Unit upgrade' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
