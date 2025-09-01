import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';

class CartItemDto {
  @IsNotEmpty()
  @IsNumber()
  productId!: number; // ADDED !

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity!: number; // ADDED !
}

export class SyncCartDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[]; // ADDED !
}

export class AddToCartDto {
  @IsNotEmpty()
  @IsNumber()
  productId!: number; // ADDED !

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity!: number; // ADDED !
}

export class UpdateQuantityDto {
  @IsNotEmpty()
  @IsNumber()
  productId!: number; // ADDED !

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  quantity!: number; // ADDED !
}
