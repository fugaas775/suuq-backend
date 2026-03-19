import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ProductAliasType } from '../entities/product-alias.entity';

export class CreateProductAliasDto {
  @Type(() => Number)
  @IsNumber()
  tenantId!: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({ example: 44 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  partnerCredentialId?: number;

  @Type(() => Number)
  @IsNumber()
  productId!: number;

  @IsEnum(ProductAliasType)
  aliasType!: ProductAliasType;

  @IsString()
  @MaxLength(255)
  aliasValue!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: { source: 'csv-import' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
