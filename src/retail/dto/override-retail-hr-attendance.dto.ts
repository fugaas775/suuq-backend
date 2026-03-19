import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class OverrideRetailHrAttendanceCheckInDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  @ApiProperty({ example: 27 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetUserId!: number;

  @ApiProperty({ example: '2026-03-19T08:00:00.000Z' })
  @IsDateString()
  checkInAt!: string;

  @ApiPropertyOptional({ example: 'Manager override' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'Backfilled missed kiosk check-in' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class OverrideRetailHrAttendanceCheckOutDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  @ApiProperty({ example: 27 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetUserId!: number;

  @ApiPropertyOptional({ example: 91 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  attendanceLogId?: number;

  @ApiProperty({ example: '2026-03-19T17:00:00.000Z' })
  @IsDateString()
  checkOutAt!: string;

  @ApiPropertyOptional({ example: 'Manager override' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'Forced close after missed check-out' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
