import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCalendarDay } from '../../common/validators/is-calendar-day.validator';
import {
  WARNING_CATEGORIES,
  WARNING_LEVELS,
} from '../school-staff-warning.policy';

export class ListSchoolStaffWarningsQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  /** '1' — the signed-in person's own warnings. */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  mine?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'WITHDRAWN'])
  status?: string;
}

export class IssueSchoolStaffWarningDto {
  @IsInt()
  branchId!: number;

  @IsInt()
  employeeId!: number;

  @IsIn(WARNING_LEVELS)
  level!: (typeof WARNING_LEVELS)[number];

  @IsIn(WARNING_CATEGORIES)
  category!: (typeof WARNING_CATEGORIES)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  expectation?: string;

  @IsOptional()
  @IsString()
  @IsCalendarDay()
  issuedOn?: string;

  /** Absent = the level's default; '' = stands until withdrawn. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  expiresOn?: string;
}

export class WithdrawSchoolStaffWarningDto {
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export class AcknowledgeSchoolStaffWarningDto {
  @IsInt()
  branchId!: number;
}

export class SchoolStaffWarningSummaryQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}
