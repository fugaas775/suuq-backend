import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_DAYS = [0, 1, 2, 3, 4, 5, 6];

export class CreateBranchShiftDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'startTime must be HH:MM (24-hour)' })
  startTime!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'endTime must be HH:MM (24-hour)' })
  endTime!: string;

  /**
   * Days of week: 0 = Sunday, 1 = Monday, … 6 = Saturday.
   */
  @IsArray()
  @ArrayUnique()
  @IsIn(VALID_DAYS, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value.map(Number) : []))
  daysOfWeek!: number[];
}

export class UpdateBranchShiftDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'startTime must be HH:MM (24-hour)' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'endTime must be HH:MM (24-hour)' })
  endTime?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(VALID_DAYS, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value.map(Number) : []))
  daysOfWeek?: number[];
}

export class AssignShiftStaffDto {
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  userId!: number;
}
