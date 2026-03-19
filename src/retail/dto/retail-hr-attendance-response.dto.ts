import { ApiProperty } from '@nestjs/swagger';
import { BranchStaffRole } from '../../branch-staff/entities/branch-staff-assignment.entity';

export class RetailHrAttendancePolicyResponseDto {
  @ApiProperty()
  shiftStartHour!: number;

  @ApiProperty()
  shiftEndHour!: number;

  @ApiProperty()
  gracePeriodMinutes!: number;

  @ApiProperty()
  overtimeThresholdHours!: number;

  @ApiProperty()
  timeZone!: string;
}

export class RetailHrAttendanceItemResponseDto {
  @ApiProperty()
  userId!: number;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: BranchStaffRole })
  role!: BranchStaffRole;

  @ApiProperty()
  attendanceStatus!: string;

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
}

export class RetailHrAttendanceSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  activeStaffCount!: number;

  @ApiProperty()
  checkedInStaffCount!: number;

  @ApiProperty()
  onDutyCount!: number;

  @ApiProperty()
  absentCount!: number;

  @ApiProperty()
  completedShiftCount!: number;

  @ApiProperty()
  lateCheckInCount!: number;

  @ApiProperty()
  overtimeActiveCount!: number;

  @ApiProperty()
  attendanceRate!: number;

  @ApiProperty()
  averageWorkedHours!: number;

  @ApiProperty({ type: RetailHrAttendancePolicyResponseDto })
  policy!: RetailHrAttendancePolicyResponseDto;
}

export class RetailHrAttendanceResponseDto {
  @ApiProperty({ type: RetailHrAttendanceSummaryResponseDto })
  summary!: RetailHrAttendanceSummaryResponseDto;

  @ApiProperty({ type: [RetailHrAttendanceItemResponseDto] })
  items!: RetailHrAttendanceItemResponseDto[];
}

export class RetailHrAttendanceMutationResponseDto {
  @ApiProperty()
  attendanceLogId!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  userId!: number;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: BranchStaffRole })
  role!: BranchStaffRole;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  checkInAt!: Date;

  @ApiProperty({ nullable: true })
  checkOutAt!: Date | null;

  @ApiProperty({ nullable: true })
  workedHours!: number | null;

  @ApiProperty({ nullable: true })
  source!: string | null;

  @ApiProperty({ nullable: true })
  note!: string | null;
}
