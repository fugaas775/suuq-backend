import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
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

export class ListHotelFoliosQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({
    example: 'OPEN',
    description: 'Filter by folio status',
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class OpenFolioDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiProperty({ example: 'Room 202' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  roomNumber!: string;

  @ApiPropertyOptional({ example: 'Abdi Kadir' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  guestName?: string;

  @ApiPropertyOptional({ example: '+251911234567' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  guestPhone?: string;

  @ApiPropertyOptional({ example: 'ET' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  guestNationality?: string;

  @ApiPropertyOptional({ example: 'PASSPORT' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  guestIdType?: string;

  @ApiPropertyOptional({ example: 'EP1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  guestIdNumber?: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'FK to pos_hotel_rate_plans.id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rateId?: number;

  @ApiPropertyOptional({
    example: 12,
    description: 'FK to pos_hotel_reservations.id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reservationId?: number;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  checkInAt?: string;

  @ApiPropertyOptional({ example: '2026-06-03' })
  @IsOptional()
  @IsDateString()
  checkOutAt?: string;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 'folio-open-1717200000000-abc' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: 'folio-local-91' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  localRef?: string;
}

export class PostFolioChargeDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 'ROOM_CHARGES' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  chargeGroupCode?: string;

  @ApiProperty({ example: 'Room Night' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  chargeName!: string;

  @ApiProperty({ example: 400 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity?: number;

  @ApiPropertyOptional({ example: 'folio-charge-folio-local-91-line-room-1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class FolioPaymentRowDto {
  @ApiProperty({
    example: 'CASH',
    description:
      'CASH | CARD | MOBILE_MONEY | BANK_TRANSFER | CREDIT_ACCOUNT | VOUCHER | FOREIGN_CURRENCY_CASH',
  })
  @IsString()
  @MaxLength(32)
  method!: string;

  @ApiProperty({ example: 1200 })
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

export class SettleFolioDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  /**
   * Preferred: array of payment rows supporting split and multi-currency settlement.
   * When provided, legacy flat fields (paymentMethod, paidAmount) are ignored.
   */
  @ApiPropertyOptional({ type: [FolioPaymentRowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FolioPaymentRowDto)
  payments?: FolioPaymentRowDto[];

  /** @deprecated Use payments[] instead. */
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
  @ApiPropertyOptional({ example: 1200 })
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
 * Records a partial (instalment) payment against an OPEN folio.
 *
 * Distinct from SettleFolioDto because settling is terminal: settleFolio flips the
 * folio to SETTLED, which is why the POS could never call it for an instalment
 * (the Muntaha Room 210 incident) and why folio.paidAmount was wrong across every
 * instalment-paid stay. This endpoint accrues `paidAmount` and leaves the folio
 * OPEN.
 */
export class RecordFolioPaymentDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  /** Preferred: payment rows supporting split tender. */
  @ApiPropertyOptional({ type: [FolioPaymentRowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FolioPaymentRowDto)
  payments?: FolioPaymentRowDto[];

  /** Legacy flat amount, used only when `payments` is absent. */
  @ApiPropertyOptional({ example: 7500 })
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

  /** POS receipt number for this instalment. */
  @ApiPropertyOptional({ example: 'POS-1-482' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  checkoutId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  /**
   * Required in practice: this is what makes a retried instalment idempotent. The
   * key is matched against the folio's existing `payments` ledger.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class VoidFolioDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 'Guest cancelled stay' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class TransferFolioRoomDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiProperty({ example: 'Room 305' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  newRoomNumber!: string;

  @ApiPropertyOptional({ example: 'Same guest, room upgrade' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  newGuestName?: string;

  @ApiPropertyOptional({ example: 'Room upgrade requested at front desk' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
