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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn([
    'COD',
    'MPESA',
    'TELEBIRR',
    'BANK_TRANSFER',
    'cod',
    'mpesa',
    'telebirr',
    'bank_transfer',
  ])
  paymentMethod!: string;

  // Required for MPESA/TELEBIRR, not needed for COD
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}
