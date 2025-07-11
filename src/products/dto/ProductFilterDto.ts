import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type, Expose } from 'class-transformer';

export class ProductFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Expose({ name: 'per_page' })
  perPage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  @Expose({ name: 'tag' })
  tags?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMax?: number;
}