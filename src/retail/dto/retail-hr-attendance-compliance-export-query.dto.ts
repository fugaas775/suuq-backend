import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  RetailHrAttendanceExceptionPriorityFilter,
  RetailHrAttendanceExceptionQueueFilter,
} from './retail-hr-attendance-exceptions-query.dto';

const toIntArray = ({ value }: { value: unknown }): number[] | undefined => {
  if (value == null) {
    return undefined;
  }

  const raw = Array.isArray(value) ? value : String(value).split(',');
  const parsed = raw
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
  const unique = Array.from(new Set(parsed));

  return unique.length > 0 ? unique : undefined;
};

const toUppercaseStringArray = ({
  value,
}: {
  value: unknown;
}): string[] | undefined => {
  if (value == null) {
    return undefined;
  }

  const raw = Array.isArray(value) ? value : String(value).split(',');
  const parsed = raw
    .map((entry) => String(entry).trim().toUpperCase())
    .filter((entry) => entry.length > 0);
  const unique = Array.from(new Set(parsed));

  return unique.length > 0 ? unique : undefined;
};

export enum RetailHrAttendanceComplianceStatusFilter {
  ABSENT = 'ABSENT',
  COMPLETED = 'COMPLETED',
  LATE = 'LATE',
  ON_DUTY = 'ON_DUTY',
  OVERTIME = 'OVERTIME',
}

export class RetailHrAttendanceComplianceExportQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  @ApiPropertyOptional({ example: 168, minimum: 1, maximum: 720 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  windowHours?: number;

  @ApiPropertyOptional({
    type: String,
    example: '3,4,7',
    description:
      'Optional comma-separated tenant branch ids to include in the export',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Transform(toIntArray)
  @IsInt({ each: true })
  @Min(1, { each: true })
  branchIds?: number[];

  @ApiPropertyOptional({
    type: String,
    example: '11,12,18',
    description:
      'Optional comma-separated staff user ids to include in the export',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Transform(toIntArray)
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds?: number[];

  @ApiPropertyOptional({
    type: String,
    example: 'ABSENT,LATE,OVERTIME',
    description:
      'Optional comma-separated attendance statuses to include in the export',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Transform(toUppercaseStringArray)
  @IsEnum(RetailHrAttendanceComplianceStatusFilter, { each: true })
  statuses?: RetailHrAttendanceComplianceStatusFilter[];

  @ApiPropertyOptional({
    type: String,
    example: 'ABSENT,LATE',
    description:
      'Optional comma-separated exception queue types to include in the export',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Transform(toUppercaseStringArray)
  @IsEnum(RetailHrAttendanceExceptionQueueFilter, { each: true })
  queueTypes?: RetailHrAttendanceExceptionQueueFilter[];

  @ApiPropertyOptional({
    type: String,
    example: 'CRITICAL,HIGH',
    description:
      'Optional comma-separated exception priorities to include in the export',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Transform(toUppercaseStringArray)
  @IsEnum(RetailHrAttendanceExceptionPriorityFilter, { each: true })
  priorities?: RetailHrAttendanceExceptionPriorityFilter[];
}
