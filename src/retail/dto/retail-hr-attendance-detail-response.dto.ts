import { ApiProperty } from '@nestjs/swagger';
import { BranchStaffRole } from '../../branch-staff/entities/branch-staff-assignment.entity';
import {
  RetailHrAttendancePermissionsResponseDto,
  RetailHrAttendancePolicyResponseDto,
} from './retail-hr-attendance-response.dto';

export class RetailHrAttendanceDetailActionResponseDto {
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

export class RetailHrAttendanceDetailSummaryResponseDto {
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
  windowHours!: number;

  @ApiProperty()
  currentStatus!: string;

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

  @ApiProperty()
  shiftCount!: number;

  @ApiProperty()
  openShiftCount!: number;

  @ApiProperty({ nullable: true })
  lastActivityAt!: Date | null;

  @ApiProperty({ type: RetailHrAttendancePolicyResponseDto })
  policy!: RetailHrAttendancePolicyResponseDto;

  @ApiProperty({ type: RetailHrAttendancePermissionsResponseDto })
  permissions!: RetailHrAttendancePermissionsResponseDto;
}

export class RetailHrAttendanceDetailLogResponseDto {
  @ApiProperty()
  attendanceLogId!: number;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  checkInAt!: Date;

  @ApiProperty({ nullable: true })
  checkOutAt!: Date | null;

  @ApiProperty({ nullable: true })
  workedHours!: number | null;

  @ApiProperty()
  lateMinutes!: number;

  @ApiProperty()
  overtimeHours!: number;

  @ApiProperty({ nullable: true })
  source!: string | null;

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty()
  isOverride!: boolean;

  @ApiProperty({ nullable: true })
  overrideByUserId!: number | null;

  @ApiProperty({ nullable: true })
  overrideByUserDisplayName!: string | null;

  @ApiProperty({ nullable: true })
  overrideByUserEmail!: string | null;
}

export class RetailHrAttendanceDetailResponseDto {
  @ApiProperty({ type: RetailHrAttendanceDetailSummaryResponseDto })
  summary!: RetailHrAttendanceDetailSummaryResponseDto;

  @ApiProperty({ type: [RetailHrAttendanceDetailActionResponseDto] })
  actions!: RetailHrAttendanceDetailActionResponseDto[];

  @ApiProperty({ type: [RetailHrAttendanceDetailLogResponseDto] })
  logs!: RetailHrAttendanceDetailLogResponseDto[];
}
