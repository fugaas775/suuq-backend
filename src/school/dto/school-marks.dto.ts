import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SchoolMarkEntryDto {
  @IsInt()
  folioId!: number;

  /** null clears this assessment for this pupil. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  score?: number | null;
}

/**
 * One mark sheet: a term, a subject, an assessment, a score per pupil — the
 * shape a teacher marks in. Merged into each pupil's academic record at the
 * assessment level, so a sheet for Mid-exam 1 never touches Final-exam 1.
 */
export class SaveSchoolMarksDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  term!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  assessment!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  outOf?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SchoolMarkEntryDto)
  entries!: SchoolMarkEntryDto[];
}

/** One assessment of one subject, as the office files it. */
export class SchoolMarkReportAssessmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsNumber()
  @Min(0)
  @Max(1000)
  score!: number;

  /** What this assessment was marked out of; the subject's out-of sums them. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  outOf?: number;
}

/**
 * One subject of one term. It REPLACES the stored subject of the same name
 * (case-folded); every other subject on the report is left alone.
 */
export class SchoolMarkReportSubjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  localName?: string;

  /** The school's own total; omitted or null ⇒ the sum of the assessments. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  total?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  outOf?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SchoolMarkReportAssessmentDto)
  assessments?: SchoolMarkReportAssessmentDto[];
}

/** One pupil's one term, as the office corrects or imports it. */
export class SchoolMarkReportEntryDto {
  @IsInt()
  folioId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  term!: string;

  /** Defaults to the pupil's class on the folio. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  className?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => SchoolMarkReportSubjectDto)
  subjects?: SchoolMarkReportSubjectDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  removeSubjects?: string[];

  /** Set when present; null clears. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  position?: string | null;

  /** Set when present; null clears. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;

  /** Drop this term from the pupil's record altogether. */
  @IsOptional()
  @IsBoolean()
  removeTerm?: boolean;
}

/**
 * The office's marks write: per pupil, per term, per subject — merged into
 * each record under a row lock, touching nothing but the academic record.
 */
export class SaveSchoolMarkReportsDto {
  @IsInt()
  branchId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SchoolMarkReportEntryDto)
  entries!: SchoolMarkReportEntryDto[];
}
