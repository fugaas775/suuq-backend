import { IsObject, IsString, IsNotEmpty, ValidateNested, IsOptional } from 'class-validator';
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
  @IsOptional()
  paymentMethodNonce?: string;
}
