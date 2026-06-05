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

/** All 14 active service formats in suuq-backend */
export const SERVICE_FORMAT_CODES = [
  'RETAIL',
  'GROCERY',
  'PHARMACY',
  'BAKERY',
  'BUTCHERY',
  'ELECTRONICS',
  'GAS_STATION',
  'QSR',
  'CAFETERIA',
  'BARBER',
  'SALON_SPA',
  'LAUNDRY',
  'HOTEL',
  'OTHER',
] as const;

export type ServiceFormatCode = (typeof SERVICE_FORMAT_CODES)[number];

/** Maps each service format to its human-readable label */
export const SERVICE_FORMAT_LABELS: Record<
  ServiceFormatCode | 'OTHER',
  string
> = {
  RETAIL: 'Retail Store',
  GROCERY: 'Grocery',
  PHARMACY: 'Pharmacy',
  BAKERY: 'Bakery',
  BUTCHERY: 'Butchery',
  ELECTRONICS: 'Electronics',
  GAS_STATION: 'Gas Station',
  QSR: 'Restaurant / QSR',
  CAFETERIA: 'Cafeteria',
  BARBER: 'Barber',
  SALON_SPA: 'Salon & Spa',
  LAUNDRY: 'Laundry',
  HOTEL: 'Hotel',
  OTHER: 'Other',
};

/** Maps each service format to its allowed order modes */
export const FORMAT_ORDER_MODES: Record<ServiceFormatCode, string[]> = {
  RETAIL: ['TAKEAWAY'],
  GROCERY: ['TAKEAWAY', 'DELIVERY'],
  PHARMACY: ['TAKEAWAY', 'DELIVERY'],
  BAKERY: ['TAKEAWAY', 'DINE_IN'],
  BUTCHERY: ['TAKEAWAY'],
  ELECTRONICS: ['TAKEAWAY'],
  GAS_STATION: ['TAKEAWAY'],
  QSR: ['TAKEAWAY', 'DINE_IN', 'DELIVERY'],
  CAFETERIA: ['TAKEAWAY', 'DINE_IN'],
  BARBER: ['APPOINTMENT'],
  SALON_SPA: ['APPOINTMENT'],
  LAUNDRY: ['SCHEDULED'],
  HOTEL: ['BOOKING'],
  OTHER: ['TAKEAWAY'],
};

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
  @IsIn([
    'TAKEAWAY',
    'DINE_IN',
    'DELIVERY',
    'APPOINTMENT',
    'BOOKING',
    'SCHEDULED',
  ])
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
