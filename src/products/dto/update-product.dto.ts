import { IsOptional, IsString, IsNumber, IsArray, IsBoolean, IsIn, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

class ImageDto {
  @IsString()
  src: string;
  @IsString()
  thumbnailSrc: string;
  @IsString()
  lowResSrc: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageDto)
  images?: ImageDto[];

  // ✨ FINAL FIX: Add the categoryId property with the @Type decorator
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

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