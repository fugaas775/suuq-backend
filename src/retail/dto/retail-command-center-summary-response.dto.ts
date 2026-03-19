import { ApiProperty } from '@nestjs/swagger';
import { RetailModule } from '../entities/tenant-module-entitlement.entity';

export class RetailCommandCenterSummaryAlertResponseDto {
  @ApiProperty({ enum: RetailModule })
  module!: RetailModule;

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

export class RetailCommandCenterSummaryActionResponseDto {
  @ApiProperty()
  type!: string;

  @ApiProperty()
  method!: string;

  @ApiProperty()
  path!: string;

  @ApiProperty()
  enabled!: boolean;
}

export class RetailCommandCenterSummaryMetricResponseDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  value!: number;
}

export class RetailCommandCenterSummaryBranchPreviewResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  statusReason!: string;

  @ApiProperty({ nullable: true })
  actionPath!: string | null;
}

export class RetailCommandCenterModuleTrendResponseDto {
  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'], nullable: true })
  previousStatus!: 'CRITICAL' | 'HIGH' | 'NORMAL' | null;

  @ApiProperty({ nullable: true })
  statusDelta!: number | null;

  @ApiProperty({ enum: ['WORSENING', 'STABLE', 'IMPROVING'] })
  direction!: 'WORSENING' | 'STABLE' | 'IMPROVING';

  @ApiProperty({ nullable: true })
  previousAlertCount!: number | null;

  @ApiProperty({ nullable: true })
  previousHeadlineMetricKey!: string | null;

  @ApiProperty({ nullable: true })
  previousHeadlineMetricValue!: number | null;

  @ApiProperty({ nullable: true })
  headlineMetricDelta!: number | null;
}

export class RetailCommandCenterModuleSummaryResponseDto {
  @ApiProperty({ enum: RetailModule })
  module!: RetailModule;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  status!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  statusReason!: string;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  alertCount!: number;

  @ApiProperty({
    type: RetailCommandCenterSummaryAlertResponseDto,
    nullable: true,
  })
  topAlert!: RetailCommandCenterSummaryAlertResponseDto | null;

  @ApiProperty({ type: [RetailCommandCenterSummaryMetricResponseDto] })
  metrics!: RetailCommandCenterSummaryMetricResponseDto[];

  @ApiProperty({ type: [RetailCommandCenterSummaryActionResponseDto] })
  actions!: RetailCommandCenterSummaryActionResponseDto[];

  @ApiProperty({ type: [RetailCommandCenterSummaryBranchPreviewResponseDto] })
  branchPreviews!: RetailCommandCenterSummaryBranchPreviewResponseDto[];

  @ApiProperty({ type: RetailCommandCenterModuleTrendResponseDto })
  trend!: RetailCommandCenterModuleTrendResponseDto;
}

export class RetailCommandCenterSummaryResponseDto {
  @ApiProperty()
  anchorBranchId!: number;

  @ApiProperty({ nullable: true })
  retailTenantId!: number | null;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  enabledModuleCount!: number;

  @ApiProperty()
  criticalModuleCount!: number;

  @ApiProperty()
  highModuleCount!: number;

  @ApiProperty()
  normalModuleCount!: number;

  @ApiProperty({ type: [RetailCommandCenterSummaryAlertResponseDto] })
  alerts!: RetailCommandCenterSummaryAlertResponseDto[];

  @ApiProperty({ type: [RetailCommandCenterModuleSummaryResponseDto] })
  modules!: RetailCommandCenterModuleSummaryResponseDto[];
}

export class RetailCommandCenterReportSnapshotFilterResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchLimit!: number;

  @ApiProperty({ enum: RetailModule, nullable: true })
  module!: RetailModule | null;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'], nullable: true })
  status!: 'CRITICAL' | 'HIGH' | 'NORMAL' | null;

  @ApiProperty({ nullable: true })
  hasAlertsOnly!: boolean | null;

  @ApiProperty({ enum: ['INFO', 'WATCH', 'CRITICAL'], nullable: true })
  alertSeverity!: 'INFO' | 'WATCH' | 'CRITICAL' | null;
}

export class RetailCommandCenterReportSnapshotResponseDto {
  @ApiProperty()
  snapshotKey!: string;

  @ApiProperty()
  generatedAt!: Date;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({ type: RetailCommandCenterReportSnapshotFilterResponseDto })
  filters!: RetailCommandCenterReportSnapshotFilterResponseDto;

  @ApiProperty({ type: RetailCommandCenterSummaryResponseDto })
  summary!: RetailCommandCenterSummaryResponseDto;
}
