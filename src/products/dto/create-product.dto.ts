import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, IsIn, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  price!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[]; // Accepts image URLs

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  categoryId?: number;

  @IsNotEmpty()
  @IsString()
  currency!: string; // e.g., 'ETB', 'KES'

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stock_quantity?: number;

  @IsOptional()
  @IsBoolean()
  manage_stock?: boolean;

  @IsOptional()
  @IsIn(['publish', 'draft', 'pending'])
  status?: 'publish' | 'draft' | 'pending';
}