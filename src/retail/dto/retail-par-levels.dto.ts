import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class RetailParLevelsQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 100, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class RetailParLevelDto {
  @ApiProperty()
  productId!: number;

  @ApiProperty()
  parLevel!: number;

  @ApiProperty()
  reorderPoint!: number;

  @ApiProperty()
  currentQuantity!: number;

  @ApiProperty()
  availableToSell!: number;
}

export class RetailParLevelsResponseDto {
  @ApiProperty({ type: [RetailParLevelDto] })
  items!: RetailParLevelDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}

export class RetailParLevelInputDto {
  @ApiProperty({ example: 103 })
  @Type(() => Number)
  @IsInt()
  productId!: number;

  @ApiProperty({ example: 24, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  parLevel!: number;

  @ApiProperty({ example: 6, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderPoint!: number;
}

export class RetailUpdateParLevelsDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ type: [RetailParLevelInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => RetailParLevelInputDto)
  levels!: RetailParLevelInputDto[];
}

export class RetailUpdateParLevelsResponseDto {
  @ApiProperty()
  updated!: number;

  @ApiProperty({ type: [RetailParLevelDto] })
  items!: RetailParLevelDto[];
}
