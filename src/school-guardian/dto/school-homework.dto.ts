import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ListSchoolHomeworkQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  classCode?: string;

  /** '1' — only what the signed-in teacher set. */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  mine?: string;

  /** '1' — taken-down entries too (the author's own history). */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  all?: string;
}

export class CreateSchoolHomeworkDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  classCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  /** YYYY-MM-DD. */
  @IsOptional()
  @IsString()
  @Matches(DAY)
  dueOn?: string;
}

export class UpdateSchoolHomeworkDto {
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  /** '' clears it. */
  @IsOptional()
  @IsString()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/)
  dueOn?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
