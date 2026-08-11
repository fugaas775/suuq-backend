import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
import { ORDER_MODES } from '../../common/service-formats';
import {
  ConsumerOrderLineDto,
  SERVICE_FORMAT_CODES,
  ServiceFormatCode,
} from './place-consumer-order.dto';

/** Where a delivery is going. Structured, rather than buried in a free-text note. */
export class ConsumerDeliveryAddressDto {
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  city?: string;

  /** "Blue gate, ask for Amina" — the part that actually gets a rider there. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

/**
 * One shop's part of the basket.
 *
 * Carries its own `serviceFormat` and `orderMode` because those are properties
 * of the shop, not of the checkout: a basket can hold a café's dine-in order and
 * a pharmacy's delivery at the same time, and each shop only understands the
 * modes its own format allows.
 */
export class ConsumerOrderGroupSellerDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  branchId!: number;

  @IsString()
  @IsIn(SERVICE_FORMAT_CODES)
  serviceFormat!: ServiceFormatCode;

  @IsString()
  @IsIn(ORDER_MODES)
  orderMode!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ConsumerOrderLineDto)
  lines!: ConsumerOrderLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appointmentTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  tablePreference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  guestCount?: number;
}

/**
 * A checkout on suuq-s.com.
 *
 * The shopper is identified by name and phone only — this is the whole point of
 * a public storefront, and demanding an account here would lose the sale. The
 * order becomes findable again through the short code handed back, not through
 * a login.
 */
export class PlaceConsumerOrderGroupDto {
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  consumerName!: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  consumerPhone!: string;

  /**
   * Capped at 10 shops. One checkout spanning more than that is a script, not a
   * shopper, and every seller costs a real till a real interruption.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ConsumerOrderGroupSellerDto)
  sellers!: ConsumerOrderGroupSellerDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ConsumerDeliveryAddressDto)
  deliveryAddress?: ConsumerDeliveryAddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
