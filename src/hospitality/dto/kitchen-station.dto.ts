import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * A cap, not a guess. The routing list is one menu category per entry and the
 * biggest format ships thirteen; a payload claiming hundreds is a bug or an
 * abuse, and this blob is read on every till that prints.
 */
const MAX_CATEGORIES = 64;

export class ListKitchenStationsQueryDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'ACTIVE', description: 'ACTIVE | INACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateKitchenStationDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({
    example: 'GRILL',
    description:
      'Stable handle, unique per branch. Derived from `name` when omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @ApiProperty({ example: 'Grill' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    example: ['BURGERS', 'PIZZA', 'CHICKEN'],
    description: 'Menu categories whose items this station prepares.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CATEGORIES)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  categories?: string[];

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateKitchenStationDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'Hot grill' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: ['BURGERS', 'PIZZA'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CATEGORIES)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  categories?: string[];

  @ApiPropertyOptional({ example: 'INACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}

class ReorderEntryDto {
  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  id!: number;

  @ApiProperty({ example: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

/**
 * Reorder in ONE request rather than N PATCHes — dragging a station up moves
 * every station between it and its destination, and a half-applied reorder is a
 * printer that hands out tickets in an order nobody chose.
 */
export class ReorderKitchenStationsDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ type: [ReorderEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderEntryDto)
  order!: ReorderEntryDto[];
}
