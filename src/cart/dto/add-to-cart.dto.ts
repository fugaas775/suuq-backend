import { IsInt, IsPositive, IsOptional, IsObject } from 'class-validator';

export class AddToCartDto {
  @IsInt()
  productId!: number;

  @IsInt()
  @IsPositive()
  quantity: number = 1;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;
}

