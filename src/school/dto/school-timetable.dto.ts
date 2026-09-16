import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GetSchoolTimetableQueryDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

export class SchoolTimetablePeriodDto {
  @ApiProperty({ example: 'P1' })
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  code!: string;

  @ApiPropertyOptional({ example: 'Period 1' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string | null;

  @ApiPropertyOptional({ example: 'LESSON', description: 'LESSON | BREAK' })
  @IsOptional()
  @IsIn(['LESSON', 'BREAK'])
  kind?: 'LESSON' | 'BREAK';

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    example: [1, 2, 3, 4, 5],
    description: 'ISO weekdays this period runs on (1 = Monday).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  days?: number[];

  @ApiPropertyOptional({
    example: {
      AM: { start: '08:00', end: '08:40' },
      PM: { start: '14:00', end: '14:40' },
    },
    description: "Start/end per shift code; '*' for a single-shift school.",
  })
  @IsOptional()
  @IsObject()
  times?: Record<string, { start?: string | null; end?: string | null }>;
}

export class SchoolTimetableShiftDto {
  @ApiProperty({ example: 'AM' })
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  code!: string;

  @ApiPropertyOptional({ example: 'Morning shift (KG–5)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @ApiPropertyOptional({ example: ['KG II', '1aad'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  classCodes?: string[];
}

export class SchoolTimetableSlotDto {
  @ApiProperty({ example: 1, description: 'ISO weekday, 1 = Monday.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  day!: number;

  @ApiProperty({ example: 'P1' })
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  period!: string;

  @ApiProperty({ example: '3aad' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  classCode!: string;

  @ApiProperty({ example: 'Mathematics' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject!: string;

  @ApiPropertyOptional({ example: 'Ibraahim Axmed Cabdille' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  teacherName?: string | null;

  @ApiPropertyOptional({ example: 41, description: 'pos_branch_employees.id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number | null;

  @ApiPropertyOptional({ example: 'Room 4' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  room?: string | null;
}

/**
 * The whole week, replaced in one request — see {@link SchoolTimetable} for
 * why the document is the unit of write.
 */
export class PutSchoolTimetableDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: 'Weekly period schedule 2019 E.C.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @ApiProperty({ type: [SchoolTimetablePeriodDto] })
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => SchoolTimetablePeriodDto)
  periods!: SchoolTimetablePeriodDto[];

  @ApiPropertyOptional({ type: [SchoolTimetableShiftDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => SchoolTimetableShiftDto)
  shifts?: SchoolTimetableShiftDto[];

  @ApiProperty({ type: [SchoolTimetableSlotDto] })
  @IsArray()
  @ArrayMaxSize(4000)
  @ValidateNested({ each: true })
  @Type(() => SchoolTimetableSlotDto)
  slots!: SchoolTimetableSlotDto[];

  @ApiPropertyOptional({ example: 'Two shifts; Friday ends after P4.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}
