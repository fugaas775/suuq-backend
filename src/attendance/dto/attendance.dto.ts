import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AttendanceStatus } from '../entities/attendance-mark.entity';

const STATUSES = Object.values(AttendanceStatus);

/**
 * A day, or a range.
 *
 * `date` and `from`/`to` are alternatives rather than a mode flag: the roll
 * sheet asks for one day, the month grid and the report card ask for a span, and
 * a caller that supplies neither gets the branch's whole register — which is
 * what a report card for an unpublished term needs (see the frontend's
 * `termDateRange`, which returns null rather than inventing boundaries).
 */
export class ListAttendanceQueryDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiPropertyOptional({ example: '2026-08-16' })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ example: '4aad' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  classCode?: string;

  @ApiPropertyOptional({ example: '10422', description: 'One subject only.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  subjectRef?: string;
}

class AttendanceEntryDto {
  @ApiProperty({ example: '10422' })
  @IsString()
  @MaxLength(64)
  subjectRef!: string;

  /** Stored beside the mark so the row survives the pupil leaving. */
  @ApiPropertyOptional({ example: 'Faadumo Cali' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subjectName?: string | null;

  /**
   * Null CLEARS the day.
   *
   * An operator undoing a mark they made by mistake is saying "no register was
   * taken for this person", which is not the same as marking them absent. There
   * is no other way to express it — the status enum has no UNMARKED member, on
   * purpose.
   */
  @ApiProperty({
    example: 'PRESENT',
    description: `${STATUSES.join(' | ')} — or null to clear the day.`,
    nullable: true,
  })
  @IsOptional()
  @IsIn([...STATUSES, null])
  status!: AttendanceStatus | null;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minutesLate?: number | null;

  @ApiPropertyOptional({ example: 'At the clinic' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

/**
 * A whole register in one request.
 *
 * A class of 47 marked one PATCH at a time is 47 trips through the guard chain
 * from a tablet on a school's connection, and a run that stops half way leaves a
 * day that is neither taken nor untaken. Same reasoning as the class reorder.
 *
 * The cap is 400 — far above any class or staff room, far below anything that
 * would make one request a denial of service.
 */
export class MarkAttendanceDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ example: '2026-08-16' })
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional({ example: '4aad', description: 'Students only.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  classCode?: string;

  @ApiProperty({ type: [AttendanceEntryDto] })
  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}

/**
 * Carry a class's register across a RENAME.
 *
 * Called by the Seller HQ rename, which already re-tags every enrolled folio.
 * Promotion must never call this: moving a child to next year's class does not
 * change which class took last year's register.
 */
export class ReclassAttendanceDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @ApiProperty({ example: '3a' })
  @IsString()
  @MaxLength(64)
  from!: string;

  @ApiProperty({ example: '3aad' })
  @IsString()
  @MaxLength(64)
  to!: string;
}
