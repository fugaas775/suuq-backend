import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  ALL_SERVICE_FORMAT_LABELS,
  CONSUMER_FORMAT_ORDER_MODES,
  CONSUMER_ORDERABLE_SERVICE_FORMAT_CODES,
  ORDER_MODES,
} from '../../common/service-formats';

/**
 * Service formats a consumer may place an order against.
 *
 * Derived from the shared registry in `src/common/service-formats.ts` — do not
 * add codes here. A format that POS-S can create is not automatically orderable:
 * `PROPERTY_RENTAL` and `PRINTING_PRESS` have no consumer ordering surface, and
 * giving them one would extend the frozen consumer→POS direction.
 */
export const SERVICE_FORMAT_CODES = CONSUMER_ORDERABLE_SERVICE_FORMAT_CODES;

export type ServiceFormatCode = string;

/** Labels for every known format, orderable or not. */
export const SERVICE_FORMAT_LABELS = ALL_SERVICE_FORMAT_LABELS;

/** Allowed order modes per orderable format. */
export const FORMAT_ORDER_MODES = CONSUMER_FORMAT_ORDER_MODES;

export class ConsumerOrderLineDto {
  @IsString()
  @MaxLength(128)
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsString()
  @MaxLength(3)
  currency!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  modifiers?: string;
}

export class PlaceConsumerOrderDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  branchId!: number;

  @IsString()
  @IsIn(SERVICE_FORMAT_CODES)
  serviceFormat!: ServiceFormatCode;

  /**
   * Order mode must match one of the allowed modes for the given serviceFormat.
   * The service validates this at runtime; the enum is for documentation.
   */
  @IsString()
  @IsIn(ORDER_MODES)
  orderMode!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsumerOrderLineDto)
  lines!: ConsumerOrderLineDto[];

  /** Consumer name or alias shown to POS staff. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  consumerName?: string;

  /** Consumer contact phone for confirmation. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  consumerPhone?: string;

  /** Free-text note for staff (allergies, special requests, etc.). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  consumerNote?: string;

  /** ISO-8601 datetime for APPOINTMENT / BOOKING / SCHEDULED modes. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  appointmentTime?: string;

  /** Preferred staff member name/code for APPOINTMENT mode. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  serviceOwner?: string;

  /** Table label / room preference for DINE_IN / BOOKING modes. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  tablePreference?: string;

  /** Number of guests (DINE_IN / BOOKING). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  guestCount?: number;

  /** 3-letter ISO 4217 currency. Defaults to branch's default currency (ETB). */
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
