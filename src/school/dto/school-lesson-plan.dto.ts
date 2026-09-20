import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const LESSON_PLAN_STATUSES = [
  'PLANNED',
  'TAUGHT',
  'PARTLY',
  'POSTPONED',
  'CANCELLED',
] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ListSchoolLessonPlansQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsString()
  @Matches(DAY)
  from!: string;

  @IsString()
  @Matches(DAY)
  to!: string;

  /** '1' — the signed-in teacher's own plans (any login with a staff row). */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  mine?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  classCode?: string;
}

/** One lesson's plan — written by the teacher whose lesson it is. */
export class SaveSchoolLessonPlanDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @Matches(DAY)
  lessonDate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  periodCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  classCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  objectives?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  activities?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  materials?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  assessment?: string;
}

/** What became of the lesson — the teacher's own word. */
export class SetSchoolLessonPlanStatusDto {
  @IsInt()
  branchId!: number;

  @IsIn(LESSON_PLAN_STATUSES)
  status!: (typeof LESSON_PLAN_STATUSES)[number];

  @IsOptional()
  @IsString()
  @Matches(DAY)
  taughtOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  statusNote?: string;
}

/** The head's sign-off. */
export class ReviewSchoolLessonPlanDto {
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  reviewComment?: string;
}

export class SchoolLessonPlanSummaryQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsString()
  @Matches(DAY)
  from!: string;

  @IsString()
  @Matches(DAY)
  to!: string;
}
