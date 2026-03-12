import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

class CreatePurchaseOrderItemDto {
  @Type(() => Number)
  @IsNumber()
  productId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  supplierOfferId?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  orderedQuantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreatePurchaseOrderDto {
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @Type(() => Number)
  @IsNumber()
  supplierProfileId!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  expectedDeliveryDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items!: CreatePurchaseOrderItemDto[];
}
