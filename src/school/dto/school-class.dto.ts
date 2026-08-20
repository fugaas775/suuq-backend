import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ListSchoolClassesQueryDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'ACTIVE', description: 'ACTIVE | INACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    example: '3aad',
    description: 'Only the sections of this grade. Matched case-insensitively.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  gradeCode?: string;
}

export class CreateSchoolClassDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ example: '1aad' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @ApiPropertyOptional({ example: 'Grade 1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: '3aad',
    description:
      'The grade this class is a section of. Required whenever `section` is given.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  gradeCode?: string | null;

  @ApiPropertyOptional({
    example: 'A',
    description: 'Section within the grade. Unique per grade, per branch.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  section?: string | null;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    example: 3245,
    description:
      'Product whose price is this class’s fee. Null = not yet priced.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  feeProductId?: number | null;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity?: number | null;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateSchoolClassDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: '1aad' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code?: string;

  @ApiPropertyOptional({ example: 'Grade 1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string | null;

  @ApiPropertyOptional({
    example: '3aad',
    description:
      'The grade this class is a section of. Required whenever `section` is given.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  gradeCode?: string | null;

  @ApiPropertyOptional({
    example: 'A',
    description: 'Section within the grade. Unique per grade, per branch.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  section?: string | null;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: 3245 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  feeProductId?: number | null;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity?: number | null;

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
 * Reorder in ONE request rather than N PATCHes.
 *
 * Dragging a class up moves every class between it and its destination, so a
 * per-row PATCH would fire a dozen writes for one gesture and leave the list
 * half-reordered if the tablet dropped its connection mid-way.
 */
export class ReorderSchoolClassesDto {
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
