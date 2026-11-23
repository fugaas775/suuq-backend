import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const STAFF_NOTICE_AUDIENCES = ['ALL', 'PEOPLE'] as const;

export class ListSchoolStaffNoticesQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  /** '1' — the messages that reach the signed-in person. */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  mine?: string;
}

export class SendSchoolStaffNoticeDto {
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  /** ALL — the whole staff list; PEOPLE — the rows named in `employeeIds`. */
  @IsIn(STAFF_NOTICE_AUDIENCES)
  audience!: (typeof STAFF_NOTICE_AUDIENCES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  employeeIds?: number[];
}

export class SetSchoolStaffNoticeActiveDto {
  @IsInt()
  branchId!: number;

  @IsBoolean()
  isActive!: boolean;
}

export class ReadSchoolStaffNoticeDto {
  @IsInt()
  branchId!: number;
}
