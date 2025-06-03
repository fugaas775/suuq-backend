import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

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
  @IsNumber()
  categoryId?: number;

  // Optionally, add these if supported by your entity/backend
  // @IsOptional()
  // @IsNumber()
  // sale_price?: number;

  // @IsOptional()
  // @IsString()
  // currency?: string;
}
