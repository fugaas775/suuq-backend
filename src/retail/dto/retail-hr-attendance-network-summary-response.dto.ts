import { ApiProperty } from '@nestjs/swagger';

export class RetailHrAttendanceNetworkActionResponseDto {
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

export class RetailHrAttendanceNetworkAlertResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: ['INFO', 'WATCH', 'CRITICAL'] })
  severity!: 'INFO' | 'WATCH' | 'CRITICAL';

  @ApiProperty()
  title!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ nullable: true })
  metric!: number | null;

  @ApiProperty({ nullable: true })
  action!: string | null;
}

export class RetailHrAttendanceNetworkBranchResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  highestRisk!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  highestRiskReason!: string;

  @ApiProperty()
  activeStaffCount!: number;

  @ApiProperty()
  checkedInStaffCount!: number;

  @ApiProperty()
  onDutyCount!: number;

  @ApiProperty()
  absentCount!: number;

  @ApiProperty()
  lateCheckInCount!: number;

  @ApiProperty()
  overtimeActiveCount!: number;

  @ApiProperty()
  attendanceRate!: number;

  @ApiProperty()
  averageWorkedHours!: number;

  @ApiProperty({ nullable: true })
  lastActivityAt!: Date | null;

  @ApiProperty({ type: [RetailHrAttendanceNetworkActionResponseDto] })
  actions!: RetailHrAttendanceNetworkActionResponseDto[];
}

export class RetailHrAttendanceNetworkSummaryResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

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
  lateCheckInCount!: number;

  @ApiProperty()
  overtimeActiveCount!: number;

  @ApiProperty()
  averageAttendanceRate!: number;

  @ApiProperty()
  criticalBranchCount!: number;

  @ApiProperty()
  highBranchCount!: number;

  @ApiProperty()
  normalBranchCount!: number;

  @ApiProperty({ type: [RetailHrAttendanceNetworkAlertResponseDto] })
  alerts!: RetailHrAttendanceNetworkAlertResponseDto[];

  @ApiProperty({ type: [RetailHrAttendanceNetworkBranchResponseDto] })
  branches!: RetailHrAttendanceNetworkBranchResponseDto[];
}
