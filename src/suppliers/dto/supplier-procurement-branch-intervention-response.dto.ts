import { ApiProperty } from '@nestjs/swagger';
import { SupplierOnboardingStatus } from '../entities/supplier-profile.entity';
import { SupplierProcurementBranchInterventionAction } from './act-on-supplier-procurement-branch-intervention.dto';
import {
  SupplierProcurementDashboardBranchRollupSortBy,
  SupplierProcurementDashboardSupplierRollupSortBy,
} from './supplier-procurement-branch-intervention-dashboard-query.dto';
import {
  SupplierProcurementBranchInterventionAgeBucket,
  SupplierProcurementBranchInterventionSortBy as SupplierProcurementInterventionSortBy,
} from './supplier-procurement-branch-intervention-query.dto';
import { SupplierProcurementScorecardAppliedFiltersResponseDto } from './supplier-procurement-scorecard-response.dto';

export class SupplierProcurementBranchInterventionAppliedFiltersResponseDto extends SupplierProcurementScorecardAppliedFiltersResponseDto {
  @ApiProperty({
    enum: SupplierProcurementBranchInterventionAction,
    isArray: true,
  })
  latestActions!: SupplierProcurementBranchInterventionAction[];

  @ApiProperty({
    enum: SupplierProcurementBranchInterventionAgeBucket,
    isArray: true,
  })
  actionAgeBuckets!: SupplierProcurementBranchInterventionAgeBucket[];

  @ApiProperty({ enum: SupplierProcurementInterventionSortBy })
  sortBy!: SupplierProcurementInterventionSortBy;

  @ApiProperty({ type: [Number] })
  assigneeUserIds!: number[];

  @ApiProperty()
  includeUntriaged!: boolean;
}

export enum SupplierProcurementOverviewAlertLevel {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum SupplierProcurementOverviewSeverityTrend {
  IMPROVING = 'IMPROVING',
  STABLE = 'STABLE',
  ESCALATING = 'ESCALATING',
}

export enum SupplierProcurementOverviewAlertStatusTransition {
  APPEARED = 'APPEARED',
  CLEARED = 'CLEARED',
  ESCALATED = 'ESCALATED',
  IMPROVED = 'IMPROVED',
  UNCHANGED = 'UNCHANGED',
}

export class SupplierProcurementBranchInterventionEntryResponseDto {
  @ApiProperty()
  supplierProfileId!: number;

  @ApiProperty()
  companyName!: string;

  @ApiProperty({ enum: SupplierOnboardingStatus })
  onboardingStatus!: SupplierOnboardingStatus;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty({
    enum: SupplierProcurementBranchInterventionAction,
    nullable: true,
  })
  latestAction!: SupplierProcurementBranchInterventionAction | null;

  @ApiProperty({ nullable: true })
  latestActionAt!: string | null;

  @ApiProperty({ nullable: true })
  latestActionActorEmail!: string | null;

  @ApiProperty({ nullable: true })
  latestAssigneeUserId!: number | null;

  @ApiProperty()
  interventionPriorityScore!: number;

  @ApiProperty({ enum: ['IMPROVING', 'STABLE', 'WORSENING'] })
  trendDirection!: 'IMPROVING' | 'STABLE' | 'WORSENING';

  @ApiProperty()
  procurementScore!: number;

  @ApiProperty()
  baselineProcurementScore!: number;

  @ApiProperty()
  scoreDeltaFrom90d!: number;

  @ApiProperty()
  fillRatePercent!: number;

  @ApiProperty()
  baselineFillRatePercent!: number;

  @ApiProperty()
  fillRateDeltaFrom90d!: number;

  @ApiProperty()
  orderCount!: number;

  @ApiProperty()
  discrepancyEventCount!: number;

  @ApiProperty()
  openDiscrepancyCount!: number;

  @ApiProperty()
  pendingAcknowledgementCount!: number;

  @ApiProperty()
  pendingShipmentCount!: number;

  @ApiProperty()
  pendingReceiptAcknowledgementCount!: number;

  @ApiProperty()
  averageAcknowledgementHours!: number;

  @ApiProperty()
  averageShipmentLatencyHours!: number;

  @ApiProperty({ enum: SupplierProcurementOverviewAlertLevel })
  alertLevel!: SupplierProcurementOverviewAlertLevel;

  @ApiProperty({ type: [String] })
  topIssues!: string[];

  @ApiProperty({ type: [String] })
  actionHints!: string[];
}

export class SupplierProcurementBranchInterventionAlertCountsResponseDto {
  @ApiProperty()
  normal!: number;

  @ApiProperty()
  warning!: number;

  @ApiProperty()
  critical!: number;
}

export class SupplierProcurementBranchInterventionAlertMixResponseDto {
  @ApiProperty()
  normalPercent!: number;

  @ApiProperty()
  warningPercent!: number;

  @ApiProperty()
  criticalPercent!: number;
}

export class SupplierProcurementBranchInterventionAlertMixDeltaResponseDto {
  @ApiProperty()
  normalPercentDelta!: number;

  @ApiProperty()
  warningPercentDelta!: number;

  @ApiProperty()
  criticalPercentDelta!: number;
}

export class SupplierProcurementBranchInterventionAlertCountsDeltaResponseDto {
  @ApiProperty()
  normalDelta!: number;

  @ApiProperty()
  warningDelta!: number;

  @ApiProperty()
  criticalDelta!: number;
}

export class SupplierProcurementBranchInterventionIssueMixEntryResponseDto {
  @ApiProperty()
  issue!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  percent!: number;
}

export class SupplierProcurementBranchInterventionActionHintMixEntryResponseDto {
  @ApiProperty()
  actionHint!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  percent!: number;
}

export class SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto {
  @ApiProperty()
  issue!: string;

  @ApiProperty()
  currentCount!: number;

  @ApiProperty()
  previousCount!: number;

  @ApiProperty()
  countDelta!: number;

  @ApiProperty()
  currentPercent!: number;

  @ApiProperty()
  previousPercent!: number;

  @ApiProperty()
  percentDelta!: number;
}

export class SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto {
  @ApiProperty()
  actionHint!: string;

  @ApiProperty()
  currentCount!: number;

  @ApiProperty()
  previousCount!: number;

  @ApiProperty()
  countDelta!: number;

  @ApiProperty()
  currentPercent!: number;

  @ApiProperty()
  previousPercent!: number;

  @ApiProperty()
  percentDelta!: number;
}

export class SupplierProcurementBranchInterventionSummaryResponseDto {
  @ApiProperty()
  totalInterventions!: number;

  @ApiProperty()
  assignedCount!: number;

  @ApiProperty()
  untriagedCount!: number;

  @ApiProperty()
  over24hCount!: number;

  @ApiProperty()
  over72hCount!: number;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertCountsResponseDto,
  })
  alertCounts!: SupplierProcurementBranchInterventionAlertCountsResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertMixResponseDto,
  })
  alertMix!: SupplierProcurementBranchInterventionAlertMixResponseDto;

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionIssueMixEntryResponseDto],
  })
  issueMix!: SupplierProcurementBranchInterventionIssueMixEntryResponseDto[];

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionActionHintMixEntryResponseDto],
  })
  actionHintMix!: SupplierProcurementBranchInterventionActionHintMixEntryResponseDto[];
}

export class SupplierProcurementBranchInterventionSupplierRollupResponseDto {
  @ApiProperty()
  supplierProfileId!: number;

  @ApiProperty()
  companyName!: string;

  @ApiProperty()
  branchCount!: number;

  @ApiProperty()
  assignedCount!: number;

  @ApiProperty()
  untriagedCount!: number;

  @ApiProperty()
  over24hCount!: number;

  @ApiProperty()
  over72hCount!: number;

  @ApiProperty()
  highestPriorityScore!: number;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertCountsResponseDto,
  })
  alertCounts!: SupplierProcurementBranchInterventionAlertCountsResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertMixResponseDto,
  })
  alertMix!: SupplierProcurementBranchInterventionAlertMixResponseDto;

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionIssueMixEntryResponseDto],
  })
  issueMix!: SupplierProcurementBranchInterventionIssueMixEntryResponseDto[];

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionActionHintMixEntryResponseDto],
  })
  actionHintMix!: SupplierProcurementBranchInterventionActionHintMixEntryResponseDto[];

  @ApiProperty({ enum: SupplierProcurementOverviewAlertLevel })
  alertLevel!: SupplierProcurementOverviewAlertLevel;
}

export class SupplierProcurementBranchInterventionBranchRollupResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true })
  branchCode!: string | null;

  @ApiProperty()
  supplierCount!: number;

  @ApiProperty()
  interventionCount!: number;

  @ApiProperty()
  assignedCount!: number;

  @ApiProperty()
  untriagedCount!: number;

  @ApiProperty()
  over24hCount!: number;

  @ApiProperty()
  over72hCount!: number;

  @ApiProperty()
  highestPriorityScore!: number;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertCountsResponseDto,
  })
  alertCounts!: SupplierProcurementBranchInterventionAlertCountsResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertMixResponseDto,
  })
  alertMix!: SupplierProcurementBranchInterventionAlertMixResponseDto;

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionIssueMixEntryResponseDto],
  })
  issueMix!: SupplierProcurementBranchInterventionIssueMixEntryResponseDto[];

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionActionHintMixEntryResponseDto],
  })
  actionHintMix!: SupplierProcurementBranchInterventionActionHintMixEntryResponseDto[];

  @ApiProperty({ enum: SupplierProcurementOverviewAlertLevel })
  alertLevel!: SupplierProcurementOverviewAlertLevel;
}

export class SupplierProcurementBranchInterventionDashboardAppliedFiltersResponseDto extends SupplierProcurementBranchInterventionAppliedFiltersResponseDto {
  @ApiProperty({ enum: SupplierProcurementDashboardSupplierRollupSortBy })
  supplierRollupSortBy!: SupplierProcurementDashboardSupplierRollupSortBy;

  @ApiProperty({ enum: SupplierProcurementDashboardBranchRollupSortBy })
  branchRollupSortBy!: SupplierProcurementDashboardBranchRollupSortBy;

  @ApiProperty({ nullable: true })
  supplierRollupLimit!: number | null;

  @ApiProperty({ nullable: true })
  branchRollupLimit!: number | null;
}

export class SupplierProcurementBranchInterventionDashboardResponseDto {
  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  windowDays!: number;

  @ApiProperty()
  baselineWindowDays!: number;

  @ApiProperty()
  totalBranchesEvaluated!: number;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionSummaryResponseDto,
  })
  summary!: SupplierProcurementBranchInterventionSummaryResponseDto;

  @ApiProperty({ enum: SupplierProcurementOverviewAlertLevel })
  summaryAlertLevel!: SupplierProcurementOverviewAlertLevel;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionDashboardAppliedFiltersResponseDto,
  })
  appliedFilters!: SupplierProcurementBranchInterventionDashboardAppliedFiltersResponseDto;

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionSupplierRollupResponseDto],
  })
  supplierRollups!: SupplierProcurementBranchInterventionSupplierRollupResponseDto[];

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionBranchRollupResponseDto],
  })
  branchRollups!: SupplierProcurementBranchInterventionBranchRollupResponseDto[];
}

export class SupplierProcurementBranchInterventionOverviewComparisonWindowResponseDto {
  @ApiProperty()
  previousFrom!: string;

  @ApiProperty()
  previousTo!: string;
}

export class SupplierProcurementBranchInterventionSummaryDeltaResponseDto {
  @ApiProperty()
  totalInterventionsDelta!: number;

  @ApiProperty()
  assignedCountDelta!: number;

  @ApiProperty()
  untriagedCountDelta!: number;

  @ApiProperty()
  over24hCountDelta!: number;

  @ApiProperty()
  over72hCountDelta!: number;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertMixDeltaResponseDto,
  })
  alertMixDelta!: SupplierProcurementBranchInterventionAlertMixDeltaResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertCountsDeltaResponseDto,
  })
  alertCountsDelta!: SupplierProcurementBranchInterventionAlertCountsDeltaResponseDto;

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto],
  })
  issueMixDelta!: SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto[];

  @ApiProperty({
    type: [
      SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto,
    ],
  })
  actionHintMixDelta!: SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto[];
}

export class SupplierProcurementBranchInterventionSupplierHotspotDeltaResponseDto {
  @ApiProperty()
  branchCountDelta!: number;

  @ApiProperty()
  assignedCountDelta!: number;

  @ApiProperty()
  untriagedCountDelta!: number;

  @ApiProperty()
  over24hCountDelta!: number;

  @ApiProperty()
  over72hCountDelta!: number;

  @ApiProperty()
  highestPriorityScoreDelta!: number;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertMixDeltaResponseDto,
  })
  alertMixDelta!: SupplierProcurementBranchInterventionAlertMixDeltaResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertCountsDeltaResponseDto,
  })
  alertCountsDelta!: SupplierProcurementBranchInterventionAlertCountsDeltaResponseDto;

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto],
  })
  issueMixDelta!: SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto[];

  @ApiProperty({
    type: [
      SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto,
    ],
  })
  actionHintMixDelta!: SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto[];
}

export class SupplierProcurementBranchInterventionBranchHotspotDeltaResponseDto {
  @ApiProperty()
  supplierCountDelta!: number;

  @ApiProperty()
  interventionCountDelta!: number;

  @ApiProperty()
  assignedCountDelta!: number;

  @ApiProperty()
  untriagedCountDelta!: number;

  @ApiProperty()
  over24hCountDelta!: number;

  @ApiProperty()
  over72hCountDelta!: number;

  @ApiProperty()
  highestPriorityScoreDelta!: number;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertMixDeltaResponseDto,
  })
  alertMixDelta!: SupplierProcurementBranchInterventionAlertMixDeltaResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAlertCountsDeltaResponseDto,
  })
  alertCountsDelta!: SupplierProcurementBranchInterventionAlertCountsDeltaResponseDto;

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto],
  })
  issueMixDelta!: SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto[];

  @ApiProperty({
    type: [
      SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto,
    ],
  })
  actionHintMixDelta!: SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto[];
}

export class SupplierProcurementBranchInterventionOverviewAlertStatusesResponseDto {
  @ApiProperty({ enum: SupplierProcurementOverviewAlertLevel })
  summary!: SupplierProcurementOverviewAlertLevel;

  @ApiProperty({ enum: SupplierProcurementOverviewAlertLevel, nullable: true })
  topSupplierHotspot!: SupplierProcurementOverviewAlertLevel | null;

  @ApiProperty({ enum: SupplierProcurementOverviewAlertLevel, nullable: true })
  topBranchHotspot!: SupplierProcurementOverviewAlertLevel | null;
}

export class SupplierProcurementBranchInterventionOverviewSeverityTrendsResponseDto {
  @ApiProperty({ enum: SupplierProcurementOverviewSeverityTrend })
  summary!: SupplierProcurementOverviewSeverityTrend;

  @ApiProperty({
    enum: SupplierProcurementOverviewSeverityTrend,
    nullable: true,
  })
  topSupplierHotspot!: SupplierProcurementOverviewSeverityTrend | null;

  @ApiProperty({
    enum: SupplierProcurementOverviewSeverityTrend,
    nullable: true,
  })
  topBranchHotspot!: SupplierProcurementOverviewSeverityTrend | null;
}

export class SupplierProcurementBranchInterventionOverviewAlertStatusTransitionEntryResponseDto {
  @ApiProperty({ enum: SupplierProcurementOverviewAlertLevel, nullable: true })
  previousAlertLevel!: SupplierProcurementOverviewAlertLevel | null;

  @ApiProperty({ enum: SupplierProcurementOverviewAlertLevel, nullable: true })
  currentAlertLevel!: SupplierProcurementOverviewAlertLevel | null;

  @ApiProperty({ enum: SupplierProcurementOverviewAlertStatusTransition })
  transition!: SupplierProcurementOverviewAlertStatusTransition;

  @ApiProperty()
  changed!: boolean;
}

export class SupplierProcurementBranchInterventionOverviewAlertStatusTransitionsResponseDto {
  @ApiProperty({
    type: SupplierProcurementBranchInterventionOverviewAlertStatusTransitionEntryResponseDto,
  })
  summary!: SupplierProcurementBranchInterventionOverviewAlertStatusTransitionEntryResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionOverviewAlertStatusTransitionEntryResponseDto,
  })
  topSupplierHotspot!: SupplierProcurementBranchInterventionOverviewAlertStatusTransitionEntryResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionOverviewAlertStatusTransitionEntryResponseDto,
  })
  topBranchHotspot!: SupplierProcurementBranchInterventionOverviewAlertStatusTransitionEntryResponseDto;
}

export class SupplierProcurementBranchInterventionOverviewResponseDto {
  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  windowDays!: number;

  @ApiProperty()
  baselineWindowDays!: number;

  @ApiProperty()
  totalBranchesEvaluated!: number;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionSummaryResponseDto,
  })
  summary!: SupplierProcurementBranchInterventionSummaryResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionDashboardAppliedFiltersResponseDto,
  })
  appliedFilters!: SupplierProcurementBranchInterventionDashboardAppliedFiltersResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionOverviewComparisonWindowResponseDto,
  })
  comparisonWindow!: SupplierProcurementBranchInterventionOverviewComparisonWindowResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionSummaryDeltaResponseDto,
  })
  summaryDelta!: SupplierProcurementBranchInterventionSummaryDeltaResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionOverviewAlertStatusesResponseDto,
  })
  alertStatuses!: SupplierProcurementBranchInterventionOverviewAlertStatusesResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionOverviewSeverityTrendsResponseDto,
  })
  severityTrends!: SupplierProcurementBranchInterventionOverviewSeverityTrendsResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionOverviewAlertStatusTransitionsResponseDto,
  })
  alertStatusTransitions!: SupplierProcurementBranchInterventionOverviewAlertStatusTransitionsResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionSupplierRollupResponseDto,
    nullable: true,
  })
  topSupplierHotspot!: SupplierProcurementBranchInterventionSupplierRollupResponseDto | null;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionSupplierHotspotDeltaResponseDto,
    nullable: true,
  })
  topSupplierHotspotDelta!: SupplierProcurementBranchInterventionSupplierHotspotDeltaResponseDto | null;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionBranchRollupResponseDto,
    nullable: true,
  })
  topBranchHotspot!: SupplierProcurementBranchInterventionBranchRollupResponseDto | null;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionBranchHotspotDeltaResponseDto,
    nullable: true,
  })
  topBranchHotspotDelta!: SupplierProcurementBranchInterventionBranchHotspotDeltaResponseDto | null;
}

export class SupplierProcurementBranchInterventionResponseDto {
  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  windowDays!: number;

  @ApiProperty()
  baselineWindowDays!: number;

  @ApiProperty()
  totalBranchesEvaluated!: number;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionSummaryResponseDto,
  })
  summary!: SupplierProcurementBranchInterventionSummaryResponseDto;

  @ApiProperty({
    type: SupplierProcurementBranchInterventionAppliedFiltersResponseDto,
  })
  appliedFilters!: SupplierProcurementBranchInterventionAppliedFiltersResponseDto;

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionEntryResponseDto],
  })
  interventions!: SupplierProcurementBranchInterventionEntryResponseDto[];

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionSupplierRollupResponseDto],
  })
  supplierRollups!: SupplierProcurementBranchInterventionSupplierRollupResponseDto[];

  @ApiProperty({
    type: [SupplierProcurementBranchInterventionBranchRollupResponseDto],
  })
  branchRollups!: SupplierProcurementBranchInterventionBranchRollupResponseDto[];
}
