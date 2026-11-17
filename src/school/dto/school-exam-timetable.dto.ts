import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ListSchoolExamTimetablesQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

export class SchoolExamSittingDto {
  @IsString()
  @Matches(DATE)
  date!: string;

  @IsString()
  @Matches(TIME)
  start!: string;

  @IsString()
  @Matches(TIME)
  end!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  classCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  invigilator?: string | null;
}

export class SaveSchoolExamTimetableDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsString()
  @Matches(DATE)
  startsOn!: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED';

  @IsArray()
  @ArrayMaxSize(3000)
  @ValidateNested({ each: true })
  @Type(() => SchoolExamSittingDto)
  sittings!: SchoolExamSittingDto[];

  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string | null;
}
