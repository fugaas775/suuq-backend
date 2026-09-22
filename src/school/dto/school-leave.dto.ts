import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsCalendarDay } from '../../common/validators/is-calendar-day.validator';
import { LEAVE_DECISIONS, LEAVE_TYPES } from '../school-leave.policy';

const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export class ListSchoolLeaveQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  /** '1' — the signed-in person's own requests (any login with a staff row). */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  mine?: string;

  @IsOptional()
  @IsIn(LEAVE_STATUSES)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  /** Requests covering this one day. */
  @IsOptional()
  @IsString()
  @IsCalendarDay()
  on?: string;

  /** Requests overlapping this range (both or neither). */
  @IsOptional()
  @IsString()
  @IsCalendarDay()
  from?: string;

  @IsOptional()
  @IsString()
  @IsCalendarDay()
  to?: string;
}

/** A request for leave — one's own, or by the office for somebody else. */
export class CreateSchoolLeaveDto {
  @IsInt()
  branchId!: number;

  /** Absent = the signed-in person's own staff row. */
  @IsOptional()
  @IsInt()
  employeeId?: number;

  @IsIn(LEAVE_TYPES)
  leaveType!: (typeof LEAVE_TYPES)[number];

  @IsString()
  @IsCalendarDay()
  startDate!: string;

  @IsString()
  @IsCalendarDay()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** The head's decision. */
export class DecideSchoolLeaveDto {
  @IsInt()
  branchId!: number;

  @IsIn(LEAVE_DECISIONS)
  decision!: (typeof LEAVE_DECISIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  coverNote?: string;
}

export class CancelSchoolLeaveDto {
  @IsInt()
  branchId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export class SchoolLeaveSummaryQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsString()
  @IsCalendarDay()
  from!: string;

  @IsString()
  @IsCalendarDay()
  to!: string;
}
