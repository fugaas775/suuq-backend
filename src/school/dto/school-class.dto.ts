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
  ValidateIf,
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

  /** The room the class sits in; null takes it out of its room. */
  @ApiPropertyOptional({ example: 3, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  roomId?: number | null;

  /**
   * The staff row of the class's home room teacher — `pos_branch_employees.id`.
   *
   * The NAME is not accepted here. The service reads it off the employee row,
   * so the id and the name on the class can never disagree, and an office
   * cannot name a home room teacher who is not on the staff list.
   */
  @ApiPropertyOptional({
    example: 30,
    description:
      'Staff row (pos_branch_employees.id) of the home room teacher. Null clears it.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  homeroomEmployeeId?: number | null;

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

  /** The room the class sits in; null takes it out of its room. */
  @ApiPropertyOptional({ example: 3, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  roomId?: number | null;

  /**
   * The staff row of the class's home room teacher — `pos_branch_employees.id`.
   *
   * The NAME is not accepted here. The service reads it off the employee row,
   * so the id and the name on the class can never disagree, and an office
   * cannot name a home room teacher who is not on the staff list.
   */
  @ApiPropertyOptional({
    example: 30,
    description:
      'Staff row (pos_branch_employees.id) of the home room teacher. Null clears it.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  homeroomEmployeeId?: number | null;

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

  // Far above any school's class list (the registry itself lists 500 at
  // most), far below a body that would make one drag a denial of service.
  @ApiProperty({ type: [ReorderEntryDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReorderEntryDto)
  order!: ReorderEntryDto[];
}

/**
 * The caller's OWN classes — the ones they are home room teacher of.
 *
 * The staff row is resolved from the signed-in user server-side, exactly as
 * `GET school/timetable/mine` does: a teacher's lane cannot read the staff
 * list, so it cannot ask "which employee am I" for itself, and letting the
 * client name the employee would let any login claim any teacher's classes.
 */
export class MySchoolClassesQueryDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}
