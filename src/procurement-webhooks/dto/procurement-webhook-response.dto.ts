import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProcurementWebhookDeliveryStatus } from '../entities/procurement-webhook-delivery.entity';
import {
  ProcurementWebhookEventType,
  ProcurementWebhookLastDeliveryStatus,
  ProcurementWebhookSubscriptionStatus,
} from '../entities/procurement-webhook-subscription.entity';

export enum ProcurementWebhookResumeRiskSeverity {
  LOW = 'LOW',
  WATCH = 'WATCH',
  FORCE_RESUME_REQUIRED = 'FORCE_RESUME_REQUIRED',
}

export class ProcurementWebhookSubscriptionResumeRiskResponseDto {
  @ApiProperty()
  evaluatedAt!: string;

  @ApiProperty()
  recentTerminalFailureCount!: number;

  @ApiProperty()
  threshold!: number;

  @ApiProperty()
  thresholdWindowHours!: number;

  @ApiProperty()
  forceResumeRequired!: boolean;

  @ApiProperty()
  forceResumeApplied!: boolean;

  @ApiProperty({ enum: ProcurementWebhookResumeRiskSeverity })
  severity!: ProcurementWebhookResumeRiskSeverity;
}

export class ProcurementWebhookSubscriptionResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  endpointUrl!: string;

  @ApiProperty()
  signingSecretConfigured!: boolean;

  @ApiProperty({ enum: ProcurementWebhookEventType, isArray: true })
  eventTypes!: ProcurementWebhookEventType[];

  @ApiProperty({ enum: ProcurementWebhookSubscriptionStatus })
  status!: ProcurementWebhookSubscriptionStatus;

  @ApiProperty({ required: false, nullable: true })
  branchId!: number | null;

  @ApiProperty({ required: false, nullable: true })
  supplierProfileId!: number | null;

  @ApiProperty({ required: false, nullable: true, type: Object })
  metadata!: Record<string, any> | null;

  @ApiProperty({ required: false, nullable: true })
  lastDeliveredAt!: Date | null;

  @ApiProperty({
    required: false,
    nullable: true,
    enum: ProcurementWebhookLastDeliveryStatus,
  })
  lastDeliveryStatus!: ProcurementWebhookLastDeliveryStatus | null;

  @ApiProperty({ required: false, nullable: true })
  createdByUserId!: number | null;

  @ApiProperty({ required: false, nullable: true })
  updatedByUserId!: number | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({
    type: () => ProcurementWebhookSubscriptionResumeRiskResponseDto,
    nullable: true,
  })
  resumeRiskPreview?: ProcurementWebhookSubscriptionResumeRiskResponseDto | null;
}

export class ProcurementWebhookSubscriptionStatusUpdateResponseDto extends ProcurementWebhookSubscriptionResponseDto {
  @ApiPropertyOptional({
    type: ProcurementWebhookSubscriptionResumeRiskResponseDto,
    nullable: true,
  })
  resumeRisk?: ProcurementWebhookSubscriptionResumeRiskResponseDto | null;
}

export class ProcurementWebhookSubscriptionPageResponseDto {
  @ApiProperty({ type: [ProcurementWebhookSubscriptionResponseDto] })
  items!: ProcurementWebhookSubscriptionResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}

export class ProcurementWebhookDeliveryResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  subscriptionId!: number;

  @ApiProperty({ enum: ProcurementWebhookEventType })
  eventType!: ProcurementWebhookEventType;

  @ApiProperty()
  eventKey!: string;

  @ApiProperty()
  requestUrl!: string;

  @ApiProperty({ type: Object })
  requestHeaders!: Record<string, any>;

  @ApiProperty({ type: Object })
  requestBody!: Record<string, any>;

  @ApiProperty({ required: false, nullable: true })
  branchId!: number | null;

  @ApiProperty({ required: false, nullable: true })
  supplierProfileId!: number | null;

  @ApiProperty({ required: false, nullable: true })
  purchaseOrderId!: number | null;

  @ApiProperty({ enum: ProcurementWebhookDeliveryStatus })
  status!: ProcurementWebhookDeliveryStatus;

  @ApiProperty()
  attemptCount!: number;

  @ApiProperty({ required: false, nullable: true })
  responseStatus!: number | null;

  @ApiProperty({ required: false, nullable: true })
  responseBody!: string | null;

  @ApiProperty({ required: false, nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ required: false, nullable: true })
  durationMs!: number | null;

  @ApiProperty({ required: false, nullable: true })
  deliveredAt!: Date | null;

  @ApiProperty({ required: false, nullable: true })
  nextRetryAt!: Date | null;

  @ApiProperty({ required: false, nullable: true })
  finalFailureAt!: Date | null;

  @ApiProperty({ required: false, nullable: true })
  replayedFromDeliveryId!: number | null;

  @ApiProperty({ required: false, nullable: true })
  subscriptionName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ProcurementWebhookDeliveryPageResponseDto {
  @ApiProperty({ type: [ProcurementWebhookDeliveryResponseDto] })
  items!: ProcurementWebhookDeliveryResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}

export class ProcurementWebhookHealthEventTypeCountResponseDto {
  @ApiProperty({ enum: ProcurementWebhookEventType })
  eventType!: ProcurementWebhookEventType;

  @ApiProperty()
  count!: number;
}

export class ProcurementWebhookHealthSeverityCountResponseDto {
  @ApiProperty({ enum: ProcurementWebhookResumeRiskSeverity })
  severity!: ProcurementWebhookResumeRiskSeverity;

  @ApiProperty()
  count!: number;
}

export enum ProcurementWebhookHealthTrendDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  FLAT = 'FLAT',
}

export class ProcurementWebhookHealthSeverityTrendResponseDto {
  @ApiProperty({ enum: ProcurementWebhookResumeRiskSeverity })
  severity!: ProcurementWebhookResumeRiskSeverity;

  @ApiProperty()
  currentCount!: number;

  @ApiProperty()
  currentPercentage!: number;

  @ApiProperty()
  previousCount!: number;

  @ApiProperty()
  previousPercentage!: number;

  @ApiProperty()
  delta!: number;

  @ApiProperty()
  deltaPercentage!: number;

  @ApiProperty({ enum: ProcurementWebhookHealthTrendDirection })
  trendDirection!: ProcurementWebhookHealthTrendDirection;
}

export class ProcurementWebhookAutoPausedSubscriptionResponseDto {
  @ApiProperty()
  subscriptionId!: number;

  @ApiProperty()
  subscriptionName!: string;

  @ApiProperty()
  pausedAt!: string;

  @ApiProperty()
  triggerDeliveryId!: number;

  @ApiProperty()
  terminalFailureCount!: number;

  @ApiProperty()
  threshold!: number;

  @ApiProperty()
  thresholdWindowHours!: number;
}

export enum ProcurementWebhookFailureTimelineState {
  RETRY_ELIGIBLE = 'RETRY_ELIGIBLE',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  TERMINAL_FAILURE = 'TERMINAL_FAILURE',
}

export class ProcurementWebhookFailureTimelineEntryResponseDto {
  @ApiProperty()
  deliveryId!: number;

  @ApiProperty({ enum: ProcurementWebhookEventType })
  eventType!: ProcurementWebhookEventType;

  @ApiProperty({ enum: ProcurementWebhookFailureTimelineState })
  state!: ProcurementWebhookFailureTimelineState;

  @ApiProperty()
  attemptCount!: number;

  @ApiProperty()
  occurredAt!: string;

  @ApiProperty({ required: false, nullable: true })
  nextRetryAt!: string | null;

  @ApiProperty({ required: false, nullable: true })
  finalFailureAt!: string | null;

  @ApiProperty({ required: false, nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ required: false, nullable: true })
  responseStatus!: number | null;
}

export enum ProcurementWebhookReplayReadinessStatus {
  EMPTY = 'EMPTY',
  READY = 'READY',
  HIGH_VOLUME = 'HIGH_VOLUME',
}

export enum ProcurementWebhookReplayOperationScope {
  SINGLE_DELIVERY = 'SINGLE_DELIVERY',
  BULK_TERMINAL_FAILURES = 'BULK_TERMINAL_FAILURES',
}

export enum ProcurementWebhookReplayExecutionMode {
  SINGLE_DELIVERY = 'SINGLE_DELIVERY',
  EXPLICIT_DELIVERY_IDS = 'EXPLICIT_DELIVERY_IDS',
  FILTERED_PAGE = 'FILTERED_PAGE',
  PREVIEW_CONFIRMED_PAGE = 'PREVIEW_CONFIRMED_PAGE',
}

export class ProcurementWebhookSubscriptionReplayReadinessResponseDto {
  @ApiProperty({ enum: ProcurementWebhookReplayReadinessStatus })
  status!: ProcurementWebhookReplayReadinessStatus;

  @ApiProperty()
  eligibleTerminalFailureCount!: number;

  @ApiProperty({ required: false, nullable: true })
  latestTerminalFailureAt!: string | null;

  @ApiProperty({ required: false, nullable: true })
  oldestTerminalFailureAt!: string | null;

  @ApiProperty()
  recommendedReplayLimit!: number;

  @ApiProperty({ type: [ProcurementWebhookHealthEventTypeCountResponseDto] })
  terminalFailureEventTypeCounts!: ProcurementWebhookHealthEventTypeCountResponseDto[];
}

export class ProcurementWebhookSubscriptionDeliveryMixResponseDto {
  @ApiProperty()
  recentDeliveryCount!: number;

  @ApiProperty()
  recentSucceededCount!: number;

  @ApiProperty()
  recentFailedCount!: number;

  @ApiProperty()
  recentPendingCount!: number;

  @ApiProperty()
  recentTerminalFailureCount!: number;

  @ApiProperty()
  recentSuccessRate!: number;
}

export class ProcurementWebhookSubscriptionRemediationActionResponseDto {
  @ApiProperty()
  action!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ required: false, nullable: true })
  actorId!: number | null;

  @ApiProperty({ required: false, nullable: true })
  actorEmail!: string | null;

  @ApiProperty({ required: false, nullable: true })
  reason!: string | null;

  @ApiProperty({ required: false, nullable: true })
  note!: string | null;

  @ApiProperty({ required: false, nullable: true })
  status!: string | null;

  @ApiProperty({ required: false, nullable: true })
  forceResume!: boolean | null;

  @ApiProperty({ required: false, nullable: true })
  triggerDeliveryId!: number | null;

  @ApiProperty({ required: false, nullable: true })
  terminalFailureCount!: number | null;

  @ApiProperty({ required: false, nullable: true })
  deliveryId!: number | null;

  @ApiProperty({ required: false, nullable: true })
  requestedCount!: number | null;

  @ApiProperty({ required: false, nullable: true })
  matchedTerminalFailureCount!: number | null;

  @ApiProperty({ required: false, nullable: true })
  replayedCount!: number | null;

  @ApiProperty({ required: false, nullable: true })
  skippedCount!: number | null;

  @ApiProperty({
    required: false,
    nullable: true,
    enum: ProcurementWebhookReplayOperationScope,
  })
  replayScope!: ProcurementWebhookReplayOperationScope | null;

  @ApiProperty({
    required: false,
    nullable: true,
    enum: ProcurementWebhookReplayExecutionMode,
  })
  replayExecutionMode!: ProcurementWebhookReplayExecutionMode | null;

  @ApiProperty({ required: false, nullable: true })
  previewConfirmed!: boolean | null;

  @ApiProperty({ required: false, nullable: true })
  previewCursor!: string | null;

  @ApiProperty({ required: false, nullable: true })
  previewMatchedTerminalFailureCount!: number | null;

  @ApiProperty({ required: false, nullable: true })
  previewConfirmationIssuedAt!: string | null;

  @ApiProperty({ required: false, nullable: true })
  previewConfirmationExpiresAt!: string | null;
}

export enum ProcurementWebhookSubscriptionRemediationActionType {
  STATUS_UPDATE = 'STATUS_UPDATE',
  AUTO_PAUSED = 'AUTO_PAUSED',
  REPLAY_OPERATION = 'REPLAY_OPERATION',
}

export class ProcurementWebhookSubscriptionRemediationActionPageResponseDto {
  @ApiProperty({
    type: [ProcurementWebhookSubscriptionRemediationActionResponseDto],
  })
  items!: ProcurementWebhookSubscriptionRemediationActionResponseDto[];

  @ApiProperty({ required: false, nullable: true })
  total!: number | null;

  @ApiProperty({ required: false, nullable: true })
  page!: number | null;

  @ApiProperty()
  perPage!: number;

  @ApiProperty({ required: false, nullable: true })
  totalPages!: number | null;

  @ApiProperty({ required: false, nullable: true })
  appliedCursor!: string | null;

  @ApiProperty({ required: false, nullable: true })
  nextCursor!: string | null;
}

export class ProcurementWebhookSubscriptionRemediationSummaryResponseDto {
  @ApiProperty()
  totalCount!: number;

  @ApiProperty()
  statusUpdateCount!: number;

  @ApiProperty()
  autoPausedCount!: number;

  @ApiProperty()
  replayOperationCount!: number;

  @ApiProperty()
  previewConfirmedReplayCount!: number;

  @ApiProperty()
  bulkTerminalFailureReplayCount!: number;

  @ApiProperty()
  previewConfirmedBulkTerminalFailureReplayCount!: number;
}

export class ProcurementWebhookBulkReplayPreviewResponseDto {
  @ApiProperty()
  requestedCount!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty({ required: false, nullable: true })
  appliedCursor!: string | null;

  @ApiProperty()
  totalMatchedTerminalFailureCount!: number;

  @ApiProperty()
  previewedCount!: number;

  @ApiProperty()
  skippedCount!: number;

  @ApiProperty({ type: [Number] })
  skippedDeliveryIds!: number[];

  @ApiProperty()
  remainingMatchedTerminalFailureCount!: number;

  @ApiProperty()
  hasMoreMatchedDeliveries!: boolean;

  @ApiProperty({ required: false, nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ required: false, nullable: true })
  executionConfirmationToken!: string | null;

  @ApiProperty({ required: false, nullable: true })
  executionConfirmationExpiresAt!: string | null;

  @ApiProperty({ type: [ProcurementWebhookDeliveryResponseDto] })
  candidateDeliveries!: ProcurementWebhookDeliveryResponseDto[];
}

export class ProcurementWebhookSubscriptionDetailResponseDto extends ProcurementWebhookSubscriptionResponseDto {
  @ApiProperty({
    type: ProcurementWebhookSubscriptionResumeRiskResponseDto,
  })
  currentResumeRisk!: ProcurementWebhookSubscriptionResumeRiskResponseDto;

  @ApiProperty({
    type: ProcurementWebhookAutoPausedSubscriptionResponseDto,
    required: false,
    nullable: true,
  })
  latestAutoPause!: ProcurementWebhookAutoPausedSubscriptionResponseDto | null;

  @ApiProperty({ type: [ProcurementWebhookDeliveryResponseDto] })
  recentDeliveries!: ProcurementWebhookDeliveryResponseDto[];

  @ApiProperty({ type: [ProcurementWebhookDeliveryResponseDto] })
  recentTerminalFailures!: ProcurementWebhookDeliveryResponseDto[];

  @ApiProperty({ type: [ProcurementWebhookDeliveryResponseDto] })
  recentSuccessfulDeliveries!: ProcurementWebhookDeliveryResponseDto[];

  @ApiProperty({ type: [ProcurementWebhookFailureTimelineEntryResponseDto] })
  recentFailureTimeline!: ProcurementWebhookFailureTimelineEntryResponseDto[];

  @ApiProperty({
    type: ProcurementWebhookSubscriptionReplayReadinessResponseDto,
  })
  terminalFailureReplayReadiness!: ProcurementWebhookSubscriptionReplayReadinessResponseDto;

  @ApiProperty({ type: ProcurementWebhookBulkReplayPreviewResponseDto })
  terminalFailureReplayPreview!: ProcurementWebhookBulkReplayPreviewResponseDto;

  @ApiProperty({ type: ProcurementWebhookSubscriptionDeliveryMixResponseDto })
  deliveryMix!: ProcurementWebhookSubscriptionDeliveryMixResponseDto;

  @ApiProperty({
    type: [ProcurementWebhookSubscriptionRemediationActionResponseDto],
  })
  recentRemediationActions!: ProcurementWebhookSubscriptionRemediationActionResponseDto[];

  @ApiProperty({
    type: ProcurementWebhookSubscriptionRemediationSummaryResponseDto,
  })
  remediationSummary!: ProcurementWebhookSubscriptionRemediationSummaryResponseDto;

  @ApiProperty()
  hasReplayHistory!: boolean;

  @ApiProperty()
  hasPreviewConfirmedReplayHistory!: boolean;

  @ApiProperty()
  hasAutoPauseHistory!: boolean;

  @ApiProperty({
    type: ProcurementWebhookSubscriptionRemediationActionResponseDto,
    required: false,
    nullable: true,
  })
  latestReplayOperation!: ProcurementWebhookSubscriptionRemediationActionResponseDto | null;

  @ApiProperty()
  route!: string;

  @ApiProperty()
  terminalFailuresRoute!: string;

  @ApiProperty()
  statusUpdateRoute!: string;

  @ApiProperty()
  replayTerminalFailuresRoute!: string;

  @ApiProperty()
  replayTerminalFailuresPreviewRoute!: string;

  @ApiProperty()
  replayOperationsRoute!: string;

  @ApiProperty()
  replayOperationsExportRoute!: string;

  @ApiProperty()
  replayGovernanceSummaryRoute!: string;

  @ApiProperty()
  replayGovernanceSummaryExportRoute!: string;

  @ApiProperty()
  previewConfirmedReplayOperationsRoute!: string;

  @ApiProperty()
  bulkTerminalFailureReplayOperationsRoute!: string;

  @ApiProperty()
  previewConfirmedBulkTerminalFailureReplayOperationsRoute!: string;

  @ApiProperty()
  remediationActionsRoute!: string;

  @ApiProperty()
  replayRemediationActionsRoute!: string;

  @ApiProperty()
  previewConfirmedReplayRemediationActionsRoute!: string;

  @ApiProperty()
  statusRemediationActionsRoute!: string;

  @ApiProperty()
  autoPausedRemediationActionsRoute!: string;

  @ApiProperty()
  bulkTerminalFailureReplayRemediationActionsRoute!: string;

  @ApiProperty()
  previewConfirmedBulkTerminalFailureReplayRemediationActionsRoute!: string;
}

export class ProcurementWebhookReplayOperationResponseDto extends ProcurementWebhookSubscriptionRemediationActionResponseDto {
  @ApiProperty()
  subscriptionId!: number;

  @ApiProperty()
  subscriptionName!: string;

  @ApiProperty()
  route!: string;
}

export class ProcurementWebhookReplayOperationPageResponseDto {
  @ApiProperty({ type: [ProcurementWebhookReplayOperationResponseDto] })
  items!: ProcurementWebhookReplayOperationResponseDto[];

  @ApiProperty({ required: false, nullable: true })
  total!: number | null;

  @ApiProperty({ required: false, nullable: true })
  page!: number | null;

  @ApiProperty()
  perPage!: number;

  @ApiProperty({ required: false, nullable: true })
  totalPages!: number | null;

  @ApiProperty({ required: false, nullable: true })
  appliedCursor!: string | null;

  @ApiProperty({ required: false, nullable: true })
  nextCursor!: string | null;
}

export class ProcurementWebhookReplayGovernanceSummaryResponseDto {
  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  totalReplayOperationCount!: number;

  @ApiProperty()
  previewConfirmedReplayCount!: number;

  @ApiProperty()
  singleDeliveryReplayCount!: number;

  @ApiProperty()
  explicitDeliveryReplayCount!: number;

  @ApiProperty()
  filteredPageReplayCount!: number;

  @ApiProperty()
  previewConfirmedPageReplayCount!: number;

  @ApiProperty()
  bulkTerminalFailureReplayCount!: number;

  @ApiProperty()
  previewConfirmedBulkTerminalFailureReplayCount!: number;
}

export class ProcurementWebhookHealthTopRiskSubscriptionResponseDto {
  @ApiProperty()
  subscriptionId!: number;

  @ApiProperty()
  subscriptionName!: string;

  @ApiProperty({ enum: ProcurementWebhookSubscriptionStatus })
  status!: ProcurementWebhookSubscriptionStatus;

  @ApiProperty({ enum: ProcurementWebhookResumeRiskSeverity })
  severity!: ProcurementWebhookResumeRiskSeverity;

  @ApiProperty()
  recentTerminalFailureCount!: number;

  @ApiProperty()
  threshold!: number;

  @ApiProperty()
  thresholdWindowHours!: number;

  @ApiProperty()
  route!: string;

  @ApiProperty()
  terminalFailuresRoute!: string;
}

export class ProcurementWebhookHealthSummaryResponseDto {
  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  autoPauseThreshold!: number;

  @ApiProperty()
  autoPauseThresholdWindowHours!: number;

  @ApiProperty()
  activeSubscriptionCount!: number;

  @ApiProperty()
  pausedSubscriptionCount!: number;

  @ApiProperty()
  autoPausedSubscriptionCount!: number;

  @ApiProperty()
  totalDeliveryCount!: number;

  @ApiProperty()
  pendingDeliveryCount!: number;

  @ApiProperty()
  succeededDeliveryCount!: number;

  @ApiProperty()
  failedDeliveryCount!: number;

  @ApiProperty()
  retryEligibleCount!: number;

  @ApiProperty()
  retryScheduledCount!: number;

  @ApiProperty()
  terminalFailureCount!: number;

  @ApiProperty()
  deliveriesLast24Hours!: number;

  @ApiProperty()
  terminalFailuresLast24Hours!: number;

  @ApiProperty()
  successRateLast24Hours!: number;

  @ApiProperty()
  averageAttemptsForTerminalFailures!: number;

  @ApiProperty({ type: [ProcurementWebhookHealthSeverityCountResponseDto] })
  severityCounts!: ProcurementWebhookHealthSeverityCountResponseDto[];

  @ApiProperty({ type: [ProcurementWebhookHealthSeverityTrendResponseDto] })
  severityTrendDeltas!: ProcurementWebhookHealthSeverityTrendResponseDto[];

  @ApiProperty({
    type: [ProcurementWebhookHealthTopRiskSubscriptionResponseDto],
  })
  topRiskSubscriptions!: ProcurementWebhookHealthTopRiskSubscriptionResponseDto[];

  @ApiProperty({ type: [ProcurementWebhookHealthEventTypeCountResponseDto] })
  eventTypeCounts!: ProcurementWebhookHealthEventTypeCountResponseDto[];

  @ApiProperty({ type: [ProcurementWebhookDeliveryResponseDto] })
  recentTerminalFailures!: ProcurementWebhookDeliveryResponseDto[];

  @ApiProperty({ type: [ProcurementWebhookAutoPausedSubscriptionResponseDto] })
  recentAutoPausedSubscriptions!: ProcurementWebhookAutoPausedSubscriptionResponseDto[];
}

export class ProcurementWebhookBulkReplayResponseDto {
  @ApiProperty()
  requestedCount!: number;

  @ApiProperty()
  matchedTerminalFailureCount!: number;

  @ApiProperty()
  replayedCount!: number;

  @ApiProperty()
  skippedCount!: number;

  @ApiProperty({ type: [Number] })
  skippedDeliveryIds!: number[];

  @ApiProperty({ type: [ProcurementWebhookDeliveryResponseDto] })
  replayedDeliveries!: ProcurementWebhookDeliveryResponseDto[];
}
