import {
  IsObject,
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsOptional,
  IsIn,
  IsNumber,
  IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

class ShippingAddressDto {
  @IsString() @IsNotEmpty() fullName!: string;
  @IsString() @IsNotEmpty() address!: string;
  @IsString() @IsNotEmpty() city!: string;
  @IsString() @IsNotEmpty() country!: string;
  @IsString() @IsNotEmpty() phoneNumber!: string;
}

class OrderItemDto {
  @IsNumber()
  productId!: number;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;
}

export class CreateOrderDto {
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @IsString()
  @IsOptional()
  couponCode?: string;

  @IsString()
  @IsOptional()
  coupon_code?: string; // Startup compatibility: often sent as snake_case

  @IsString()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(['CART', 'BUY_NOW', 'cart', 'buy_now', 'buynow'])
  checkoutMode?: string;

  @IsString()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn([
    'COD',
    'MPESA',
    'TELEBIRR',
    'BANK_TRANSFER',
    'EBIRR',
    'CREDIT',
    'cod',
    'mpesa',
    'telebirr',
    'bank_transfer',
    'ebirr',
    'credit',
  ])
  paymentMethod!: string;

  // Required for MPESA/TELEBIRR/EBIRR, not needed for COD
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  // Required for Flutter compatibility (mobile money input often sent as mpesaPhone)
  @IsString()
  @IsOptional()
  mpesaPhone?: string;

  // Optional device-line info from mobile app (Android SIM check path)
  @IsString()
  @IsOptional()
  devicePhoneNumber?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsIn(['android', 'ios', 'unknown'])
  devicePlatform?: string;
}
