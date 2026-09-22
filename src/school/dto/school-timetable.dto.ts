import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TIME_KEYS = 12;
const MAX_TIME_KEY_LENGTH = 32;

/** Blank, or a 24-hour 'HH:MM'. */
function isClockOrBlank(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && CLOCK_RE.test(value.trim());
}

/**
 * A period's `times`: at most twelve shift keys of at most 32 characters,
 * each mapped to `{ start, end }` in HH:MM (either may be blank), or to a
 * bare 'HH:MM' start. The service re-checks the clock; this stops a body of
 * ten thousand keys, or of nested objects, before it is walked at all.
 * Exported for the spec.
 */
export function isPeriodTimes(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_TIME_KEYS) return false;
  return entries.every(([key, t]) => {
    if (key.length > MAX_TIME_KEY_LENGTH) return false;
    if (t === null) return true;
    if (typeof t === 'string') return CLOCK_RE.test(t.trim());
    if (typeof t !== 'object' || Array.isArray(t)) return false;
    const fields = Object.keys(t);
    if (fields.some((f) => f !== 'start' && f !== 'end')) return false;
    const { start, end } = t as { start?: unknown; end?: unknown };
    return isClockOrBlank(start) && isClockOrBlank(end);
  });
}

function IsPeriodTimes(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isPeriodTimes',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'times must map at most 12 shift codes (32 characters each) to { start, end } in HH:MM',
        ...options,
      },
      validator: { validate: (value: unknown) => isPeriodTimes(value) },
    });
  };
}

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
  @IsPeriodTimes()
  times?: Record<
    string,
    { start?: string | null; end?: string | null } | string | null
  >;
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

  @ApiPropertyOptional({
    example: '2026-09-22T08:14:05.123Z',
    description:
      "The document's `updatedAt` as the caller read it. When given, the week " +
      'is replaced only if nobody has saved it since: otherwise 409 { code: ' +
      "'TIMETABLE_CHANGED', details: { current } } with the week as it stands.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string;
}
