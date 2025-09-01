import {
  IsObject,
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsOptional,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

class ShippingAddressDto {
  @IsString() @IsNotEmpty() fullName!: string;
  @IsString() @IsNotEmpty() address!: string;
  @IsString() @IsNotEmpty() city!: string;
  @IsString() @IsNotEmpty() country!: string;
  @IsString() @IsNotEmpty() phoneNumber!: string;
}

export class CreateOrderDto {
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @IsString()
  @IsIn(['COD', 'MPESA', 'TELEBIRR'])
  paymentMethod!: string;

  // Required for MPESA/TELEBIRR, not needed for COD
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}
