import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ProductAliasType } from '../entities/product-alias.entity';

export class ListProductAliasesQueryDto {
  @Type(() => Number)
  @IsNumber()
  tenantId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  partnerCredentialId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  productId?: number;

  @IsOptional()
  @IsEnum(ProductAliasType)
  aliasType?: ProductAliasType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
