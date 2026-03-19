import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ProductAliasType } from '../entities/product-alias.entity';

export class ProductAliasImportRowDto {
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

  @ApiProperty({ example: 77 })
  @Type(() => Number)
  @IsNumber()
  productId!: number;

  @ApiProperty({ enum: ProductAliasType })
  @IsEnum(ProductAliasType)
  aliasType!: ProductAliasType;

  @ApiProperty({ example: 'POS-SKU-001' })
  @IsString()
  @MaxLength(255)
  aliasValue!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: { source: 'pilot-import' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class ImportProductAliasesDto {
  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsNumber()
  tenantId!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  continueOnError?: boolean;

  @ApiProperty({ type: [ProductAliasImportRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAliasImportRowDto)
  rows!: ProductAliasImportRowDto[];
}

export class ProductAliasImportFailureDto {
  @ApiProperty()
  rowIndex!: number;

  @ApiProperty({ type: Object })
  row!: ProductAliasImportRowDto;

  @ApiProperty()
  error!: string;
}

export class ImportProductAliasesResponseDto {
  @ApiProperty()
  tenantId!: number;

  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  createdCount!: number;

  @ApiProperty()
  failedCount!: number;

  @ApiProperty({ type: [Number] })
  createdAliasIds!: number[];

  @ApiProperty({ type: [ProductAliasImportFailureDto] })
  failures!: ProductAliasImportFailureDto[];
}
