import { IsOptional, IsString, IsNumber, IsArray, IsBoolean, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  readonly name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  readonly price?: number;

  @IsOptional()
  @IsString()
  readonly description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readonly tags?: string[];

  @IsOptional()
  @IsString()
  readonly sku?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  readonly stock_quantity?: number;

  @IsOptional()
  @IsBoolean()
  readonly manage_stock?: boolean;

  @IsOptional()
  @IsIn(['publish', 'draft', 'pending'])
  readonly status?: 'publish' | 'draft' | 'pending';
}