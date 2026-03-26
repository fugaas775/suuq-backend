import { ApiProperty } from '@nestjs/swagger';
import { BranchStaffRole } from '../../branch-staff/entities/branch-staff-assignment.entity';
import {
  RetailHrAttendanceExceptionPriorityFilter,
  RetailHrAttendanceExceptionQueueFilter,
} from './retail-hr-attendance-exceptions-query.dto';
import { RetailHrAttendancePermissionsResponseDto } from './retail-hr-attendance-response.dto';

export class RetailHrAttendanceComplianceCountEntryResponseDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  count!: number;
}

export class RetailHrAttendanceComplianceSummaryMetricsResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  filteredBranchCount!: number;

  @ApiProperty()
  windowHours!: number;

  @ApiProperty()
  totalStaffCount!: number;

  @ApiProperty()
  filteredStaffCount!: number;

  @ApiProperty()
  totalExceptionCount!: number;

  @ApiProperty()
  filteredExceptionCount!: number;

  @ApiProperty({ nullable: true })
  lastActivityAt!: Date | null;

  @ApiProperty({ type: RetailHrAttendancePermissionsResponseDto })
  permissions!: RetailHrAttendancePermissionsResponseDto;
}

export class RetailHrAttendanceComplianceBranchSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty()
  filteredStaffCount!: number;

  @ApiProperty()
  filteredExceptionCount!: number;

  @ApiProperty({ nullable: true })
  lastActivityAt!: Date | null;

  @ApiProperty({ type: [RetailHrAttendanceComplianceCountEntryResponseDto] })
  statusCounts!: RetailHrAttendanceComplianceCountEntryResponseDto[];

  @ApiProperty({ type: [RetailHrAttendanceComplianceCountEntryResponseDto] })
  queueTypeCounts!: RetailHrAttendanceComplianceCountEntryResponseDto[];

  @ApiProperty({ type: [RetailHrAttendanceComplianceCountEntryResponseDto] })
  priorityCounts!: RetailHrAttendanceComplianceCountEntryResponseDto[];
}

export class RetailHrAttendanceComplianceTopStaffExceptionResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty()
  userId!: number;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: BranchStaffRole })
  role!: BranchStaffRole;

  @ApiProperty()
  currentStatus!: string;

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
}

export class RetailHrAttendanceComplianceSummaryResponseDto {
  @ApiProperty({ type: RetailHrAttendanceComplianceSummaryMetricsResponseDto })
  summary!: RetailHrAttendanceComplianceSummaryMetricsResponseDto;

  @ApiProperty({ type: [RetailHrAttendanceComplianceCountEntryResponseDto] })
  statusCounts!: RetailHrAttendanceComplianceCountEntryResponseDto[];

  @ApiProperty({ type: [RetailHrAttendanceComplianceCountEntryResponseDto] })
  queueTypeCounts!: RetailHrAttendanceComplianceCountEntryResponseDto[];

  @ApiProperty({ type: [RetailHrAttendanceComplianceCountEntryResponseDto] })
  priorityCounts!: RetailHrAttendanceComplianceCountEntryResponseDto[];

  @ApiProperty({ type: [RetailHrAttendanceComplianceBranchSummaryResponseDto] })
  branches!: RetailHrAttendanceComplianceBranchSummaryResponseDto[];

  @ApiProperty({
    type: [RetailHrAttendanceComplianceTopStaffExceptionResponseDto],
  })
  topStaffExceptions!: RetailHrAttendanceComplianceTopStaffExceptionResponseDto[];
}
