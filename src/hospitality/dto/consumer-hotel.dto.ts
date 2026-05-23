import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum PrepaymentProvider {
  EBIRR = 'EBIRR',
  TELEBIRR = 'TELEBIRR',
  MPESA = 'MPESA',
  STARPAY = 'STARPAY',
}

export class CreateConsumerReservationDto {
  /** The VendorStore id (resolves branchId server-side). */
  @IsInt()
  @Min(1)
  storeId!: number;

  @IsDateString()
  checkInAt!: string;

  @IsDateString()
  checkOutAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomType?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  ratePlanId?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  numberOfGuests?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Optional phone override (defaults to user's registered phone) */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  guestPhone?: string;
}

export class PayConsumerReservationDto {
  @IsEnum(PrepaymentProvider)
  provider!: PrepaymentProvider;

  /**
   * Phone number to charge (Ebirr / Telebirr / M-Pesa format).
   * E.g. "0912345678" for Ethiopian numbers.
   */
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}
