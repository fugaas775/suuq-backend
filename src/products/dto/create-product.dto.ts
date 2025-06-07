import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';
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

  // Optionally, add these if supported by your entity/backend
  // @IsOptional()
  // @Type(() => Number)
  // @IsNumber()
  // sale_price?: number;

  // @IsOptional()
  // @IsString()
  // currency?: string;
}