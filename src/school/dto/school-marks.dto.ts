import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
