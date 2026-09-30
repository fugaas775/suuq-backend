import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { INGREDIENT_UNITS } from '../ingredient-units';

function trimmed(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function toBool(value: unknown) {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return text === 'true' || text === '1';
}

export class ListIngredientsQueryDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => trimmed(value))
  search?: string;
}

export class BranchQueryDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

export class CreateIngredientDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ example: 'Sugar' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }) => trimmed(value))
  name!: string;

  @ApiProperty({ example: 'KG', enum: INGREDIENT_UNITS })
  @Transform(({ value }) =>
    String(value ?? '')
      .trim()
      .toUpperCase(),
  )
  @IsIn(INGREDIENT_UNITS as readonly string[])
  unit!: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimmed(value))
  note?: string | null;

  /** What is on the shelf right now, if anything. Posted as an OPENING movement. */
  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingQuantity?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingUnitCost?: number;

  /** Alternative to a unit cost: what the opening stock cost in total. */
  @ApiPropertyOptional({ example: 2500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingTotalCost?: number;
}

export class UpdateIngredientDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }) => trimmed(value))
  name?: string;

  @ApiPropertyOptional({ enum: INGREDIENT_UNITS })
  @IsOptional()
  @Transform(({ value }) =>
    value == null
      ? value
      : String(value ?? '')
          .trim()
          .toUpperCase(),
  )
  @IsIn(INGREDIENT_UNITS as readonly string[])
  unit?: string;

  /** Send null to clear the threshold. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === null || value === '' ? null : value))
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimmed(value))
  note?: string | null;
}

export const MANUAL_MOVEMENT_TYPES = ['PURCHASE', 'ADJUSTMENT', 'COUNT'] as const;

export class RecordIngredientMovementDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ enum: MANUAL_MOVEMENT_TYPES })
  @Transform(({ value }) =>
    String(value ?? '')
      .trim()
      .toUpperCase(),
  )
  @IsIn(MANUAL_MOVEMENT_TYPES as readonly string[])
  movementType!: (typeof MANUAL_MOVEMENT_TYPES)[number];

  /**
   * PURCHASE: how much came in (> 0).
   * ADJUSTMENT: the signed change (≠ 0) — waste is negative, found stock positive.
   * COUNT: what was counted on the shelf (≥ 0).
   */
  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  quantity!: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalCost?: number;

  @ApiPropertyOptional({ example: 'WASTE' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  reason?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimmed(value))
  note?: string | null;

  @ApiPropertyOptional({ example: '2026-09-30T08:00:00.000Z' })
  @IsOptional()
  @IsString()
  occurredAt?: string;
}

export class IngredientMovementsQueryDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class IngredientUsageQueryDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ example: '2026-09-01T00:00:00.000Z' })
  @IsString()
  from!: string;

  @ApiProperty({ example: '2026-09-30T23:59:59.999Z' })
  @IsString()
  to!: string;
}

export class RecipesQueryDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 4211 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;
}

export class RecipeLineDto {
  @ApiProperty({ example: 7 })
  @Type(() => Number)
  @IsInt()
  ingredientId!: number;

  /** Per ONE sold unit, in the ingredient's unit. */
  @ApiProperty({ example: 0.02 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity!: number;
}

export class ReplaceRecipeDto {
  @ApiProperty({ example: 44 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ type: [RecipeLineDto] })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines!: RecipeLineDto[];
}
