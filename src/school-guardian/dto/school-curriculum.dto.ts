import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CURRICULUM_RESOURCE_KINDS } from '../entities/school-curriculum-resource.entity';

const URL_OPTIONS = { require_protocol: true, protocols: ['http', 'https'] };

export class ListSchoolCurriculumQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

export class CreateSchoolCurriculumResourceDto {
  @IsIn(CURRICULUM_RESOURCE_KINDS as unknown as string[])
  kind!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  series?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(14)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(14, { each: true })
  grades!: number[];

  @IsString()
  @IsUrl(URL_OPTIONS)
  @MaxLength(2000)
  studentUrl!: string;

  @IsOptional()
  @IsString()
  @IsUrl(URL_OPTIONS)
  @MaxLength(2000)
  teacherUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  questions?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

/** Every field optional; '' on `series`, `teacherUrl`, `note` clears it, null on `questions` clears it. */
export class UpdateSchoolCurriculumResourceDto {
  @IsOptional()
  @IsIn(CURRICULUM_RESOURCE_KINDS as unknown as string[])
  kind?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  series?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(14)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(14, { each: true })
  grades?: number[];

  @IsOptional()
  @IsString()
  @IsUrl(URL_OPTIONS)
  @MaxLength(2000)
  studentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  teacherUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  questions?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
