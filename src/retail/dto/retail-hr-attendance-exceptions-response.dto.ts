import { ApiProperty } from '@nestjs/swagger';
import { BranchStaffRole } from '../../branch-staff/entities/branch-staff-assignment.entity';
import {
  RetailHrAttendanceExceptionPriorityFilter,
  RetailHrAttendanceExceptionQueueFilter,
} from './retail-hr-attendance-exceptions-query.dto';
import { RetailHrAttendancePermissionsResponseDto } from './retail-hr-attendance-response.dto';

export class RetailHrAttendanceExceptionActionResponseDto {
  @ApiProperty()
  type!: string;

  @ApiProperty()
  method!: string;

  @ApiProperty()
  path!: string;

  @ApiProperty({ type: Object, nullable: true })
  body!: Record<string, any> | null;

  @ApiProperty()
  enabled!: boolean;
}

export class RetailHrAttendanceExceptionsSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  totalExceptionCount!: number;

  @ApiProperty()
  filteredExceptionCount!: number;

  @ApiProperty()
  absentCount!: number;

  @ApiProperty()
  lateCount!: number;

  @ApiProperty()
  overtimeCount!: number;

  @ApiProperty()
  criticalCount!: number;

  @ApiProperty()
  highCount!: number;

  @ApiProperty()
  normalCount!: number;

  @ApiProperty({ nullable: true })
  lastActivityAt!: Date | null;

  @ApiProperty({ type: RetailHrAttendancePermissionsResponseDto })
  permissions!: RetailHrAttendancePermissionsResponseDto;
}

export class RetailHrAttendanceExceptionItemResponseDto {
  @ApiProperty()
  userId!: number;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: BranchStaffRole })
  role!: BranchStaffRole;

  @ApiProperty({ enum: RetailHrAttendanceExceptionQueueFilter })
  queueType!: RetailHrAttendanceExceptionQueueFilter;

  @ApiProperty({ enum: RetailHrAttendanceExceptionPriorityFilter })
  priority!: RetailHrAttendanceExceptionPriorityFilter;

  @ApiProperty()
  priorityReason!: string;

  @ApiProperty({ nullable: true })
  latestCheckInAt!: Date | null;

  @ApiProperty({ nullable: true })
  latestCheckOutAt!: Date | null;

  @ApiProperty({ nullable: true })
  workedHours!: number | null;

  @ApiProperty()
  lateMinutes!: number;

  @ApiProperty()
  overtimeHours!: number;

  @ApiProperty({ type: [RetailHrAttendanceExceptionActionResponseDto] })
  actions!: RetailHrAttendanceExceptionActionResponseDto[];
}

export class RetailHrAttendanceExceptionsResponseDto {
  @ApiProperty({ type: RetailHrAttendanceExceptionsSummaryResponseDto })
  summary!: RetailHrAttendanceExceptionsSummaryResponseDto;

  @ApiProperty({ type: [RetailHrAttendanceExceptionActionResponseDto] })
  actions!: RetailHrAttendanceExceptionActionResponseDto[];

  @ApiProperty({ type: [RetailHrAttendanceExceptionItemResponseDto] })
  items!: RetailHrAttendanceExceptionItemResponseDto[];
}
