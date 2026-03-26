import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/roles.enum';
import { Branch } from '../branches/entities/branch.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import { CreateProcurementWebhookSubscriptionDto } from './dto/create-procurement-webhook-subscription.dto';
import { ProcurementWebhookDeliveryQueryDto } from './dto/procurement-webhook-delivery-query.dto';
import {
  ProcurementWebhookBulkReplayResponseDto,
  ProcurementWebhookBulkReplayPreviewResponseDto,
  ProcurementWebhookReplayExecutionMode,
  ProcurementWebhookReplayOperationScope,
  ProcurementWebhookResumeRiskSeverity,
  ProcurementWebhookDeliveryPageResponseDto,
  ProcurementWebhookDeliveryResponseDto,
  ProcurementWebhookFailureTimelineEntryResponseDto,
  ProcurementWebhookFailureTimelineState,
  ProcurementWebhookHealthSeverityCountResponseDto,
  ProcurementWebhookHealthTrendDirection,
  ProcurementWebhookHealthSeverityTrendResponseDto,
  ProcurementWebhookHealthSummaryResponseDto,
  ProcurementWebhookReplayGovernanceSummaryResponseDto,
  ProcurementWebhookHealthTopRiskSubscriptionResponseDto,
  ProcurementWebhookReplayOperationPageResponseDto,
  ProcurementWebhookSubscriptionRemediationActionPageResponseDto,
  ProcurementWebhookSubscriptionRemediationSummaryResponseDto,
  ProcurementWebhookSubscriptionRemediationActionType,
  ProcurementWebhookSubscriptionDeliveryMixResponseDto,
  ProcurementWebhookSubscriptionRemediationActionResponseDto,
  ProcurementWebhookReplayReadinessStatus,
  ProcurementWebhookSubscriptionDetailResponseDto,
  ProcurementWebhookSubscriptionPageResponseDto,
  ProcurementWebhookSubscriptionReplayReadinessResponseDto,
  ProcurementWebhookSubscriptionResumeRiskResponseDto,
  ProcurementWebhookSubscriptionResponseDto,
  ProcurementWebhookSubscriptionStatusUpdateResponseDto,
} from './dto/procurement-webhook-response.dto';
import { ProcurementWebhookRemediationActionQueryDto } from './dto/procurement-webhook-remediation-action-query.dto';
import { ProcurementWebhookReplayOperationQueryDto } from './dto/procurement-webhook-replay-operation-query.dto';
import { ProcurementWebhookReplayOperationSummaryQueryDto } from './dto/procurement-webhook-replay-operation-summary-query.dto';
import { ProcurementWebhookSubscriptionQueryDto } from './dto/procurement-webhook-subscription-query.dto';
import { ProcurementWebhookDeliveryRetryState } from './dto/procurement-webhook-delivery-query.dto';
import { ReplayProcurementWebhookDeliveryDto } from './dto/replay-procurement-webhook-delivery.dto';
import { ReplayTerminalProcurementWebhookDeliveriesDto } from './dto/replay-terminal-procurement-webhook-deliveries.dto';
import { UpdateProcurementWebhookSubscriptionStatusDto } from './dto/update-procurement-webhook-subscription-status.dto';
import {
  ProcurementWebhookDelivery,
  ProcurementWebhookDeliveryStatus,
} from './entities/procurement-webhook-delivery.entity';
import {
  ProcurementWebhookEventType,
  ProcurementWebhookLastDeliveryStatus,
  ProcurementWebhookSubscription,
  ProcurementWebhookSubscriptionStatus,
} from './entities/procurement-webhook-subscription.entity';

type DispatchProcurementWebhookInput = {
  eventType: ProcurementWebhookEventType;
  eventKey: string;
  branchId?: number | null;
  supplierProfileId?: number | null;
  purchaseOrderId?: number | null;
  payload: Record<string, any>;
};

type ReplayTerminalFailureExecutionSignature = {
  deliveryIds: number[] | null;
  subscriptionId: number | null;
  eventType: ProcurementWebhookEventType | null;
  cursor: string | null;
  limit: number;
  totalMatchedTerminalFailureCount: number;
  cursorMatchedTerminalFailureCount: number;
};

type ReplayTerminalFailureExecutionConfirmationPayload = {
  signature: ReplayTerminalFailureExecutionSignature;
  issuedAtMs: number;
  expiresAtMs: number;
};

type ReplayExecutionGovernance = {
  replayScope: ProcurementWebhookReplayOperationScope;
  replayExecutionMode: ProcurementWebhookReplayExecutionMode;
  previewConfirmed: boolean;
  previewCursor: string | null;
  previewMatchedTerminalFailureCount: number | null;
  previewConfirmationIssuedAt: string | null;
  previewConfirmationExpiresAt: string | null;
};

@Injectable()
export class ProcurementWebhooksService {
  private static readonly ADMIN_WEBHOOKS_ROUTE =
    '/admin/b2b/procurement-webhooks';
  private static readonly SUBSCRIPTION_DETAIL_REPLAY_RECOMMENDED_LIMIT = 25;
  private static readonly RETRY_BACKOFF_MINUTES = [5, 30, 120] as const;
  private static readonly MAX_ATTEMPTS =
    ProcurementWebhooksService.RETRY_BACKOFF_MINUTES.length + 1;
  private static readonly HEALTH_SUMMARY_RECENT_FAILURE_LIMIT = 10;
  private static readonly HEALTH_SUMMARY_RECENT_AUTO_PAUSE_LIMIT = 10;
  private static readonly HEALTH_SUMMARY_TOP_RISK_SUBSCRIPTION_LIMIT = 5;
  private static readonly AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD = 3;
  private static readonly AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS = 24;
  private static readonly REPLAY_PREVIEW_CONFIRMATION_TTL_MINUTES = 30;
  private static readonly REPLAY_PREVIEW_CONFIRMATION_SECRET_FALLBACK =
    'procurement-webhook-replay-confirmation-secret';

  private readonly logger = new Logger(ProcurementWebhooksService.name);

  constructor(
    @InjectRepository(ProcurementWebhookSubscription)
    private readonly subscriptionsRepository: Repository<ProcurementWebhookSubscription>,
    @InjectRepository(ProcurementWebhookDelivery)
    private readonly deliveriesRepository: Repository<ProcurementWebhookDelivery>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(SupplierProfile)
    private readonly suppliersRepository: Repository<SupplierProfile>,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createSubscription(
    dto: CreateProcurementWebhookSubscriptionDto,
    actor: { id?: number | null; email?: string | null } = {},
  ): Promise<ProcurementWebhookSubscriptionResponseDto> {
    await this.assertSubscriptionTargets(dto.branchId, dto.supplierProfileId);

    if (!dto.eventTypes?.length) {
      throw new BadRequestException(
        'Webhook subscriptions must include at least one procurement event type',
      );
    }

    const subscription = this.subscriptionsRepository.create({
      ...dto,
      status: dto.status ?? ProcurementWebhookSubscriptionStatus.ACTIVE,
      createdByUserId: actor.id ?? null,
      updatedByUserId: actor.id ?? null,
    });
    const saved = await this.subscriptionsRepository.save(subscription);

    await this.auditService.log({
      action: 'procurement_webhook_subscription.create',
      targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
      targetId: saved.id,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      meta: {
        endpointUrl: saved.endpointUrl,
        eventTypes: saved.eventTypes,
        branchId: saved.branchId ?? null,
        supplierProfileId: saved.supplierProfileId ?? null,
        status: saved.status,
      },
    });

    return this.mapSubscriptionResponse(saved);
  }

  async listSubscriptions(
    query: ProcurementWebhookSubscriptionQueryDto = {},
  ): Promise<ProcurementWebhookSubscriptionPageResponseDto> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 200);
    const items = await this.subscriptionsRepository.find({
      relations: { branch: true, supplierProfile: true },
      order: { createdAt: 'DESC' },
    });
    const search = query.search?.trim().toLowerCase() ?? null;
    const filtered = items.filter((subscription) => {
      if (query.status && subscription.status !== query.status) {
        return false;
      }
      if (
        query.eventType &&
        !(subscription.eventTypes ?? []).includes(query.eventType)
      ) {
        return false;
      }
      if (query.branchId != null && subscription.branchId !== query.branchId) {
        return false;
      }
      if (
        query.supplierProfileId != null &&
        subscription.supplierProfileId !== query.supplierProfileId
      ) {
        return false;
      }
      if (
        search &&
        !subscription.name.toLowerCase().includes(search) &&
        !subscription.endpointUrl.toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    });

    const candidateIds = filtered.map((item) => item.id);
    const recentTerminalFailureCounts =
      await this.getRecentTerminalFailureCountsForSubscriptions(candidateIds);
    const riskSnapshots = new Map(
      filtered.map((item) => [
        item.id,
        this.buildResumeRiskSnapshot(
          recentTerminalFailureCounts.get(item.id) ?? 0,
          false,
        ),
      ]),
    );
    const riskFiltered = filtered.filter((item) => {
      const riskSnapshot = riskSnapshots.get(item.id);
      if (!riskSnapshot) {
        return false;
      }

      if (query.forceResumeRequired && !riskSnapshot.forceResumeRequired) {
        return false;
      }

      if (query.severity && riskSnapshot.severity !== query.severity) {
        return false;
      }

      return true;
    });
    const orderedItems = query.sortByFailurePressure
      ? [...riskFiltered].sort((left, right) => {
          const failureCountDiff =
            (recentTerminalFailureCounts.get(right.id) ?? 0) -
            (recentTerminalFailureCounts.get(left.id) ?? 0);
          if (failureCountDiff !== 0) {
            return failureCountDiff;
          }

          return right.createdAt.getTime() - left.createdAt.getTime();
        })
      : riskFiltered;
    const total = orderedItems.length;
    const pageItems = orderedItems.slice((page - 1) * limit, page * limit);
    return {
      items: pageItems.map((item) =>
        this.mapSubscriptionResponse(item, riskSnapshots.get(item.id) ?? null),
      ),
      total,
      page,
      perPage: limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSubscriptionDetail(
    id: number,
  ): Promise<ProcurementWebhookSubscriptionDetailResponseDto> {
    const subscription = await this.subscriptionsRepository.findOne({
      where: { id },
      relations: { branch: true, supplierProfile: true },
    });
    if (!subscription) {
      throw new NotFoundException(
        `Procurement webhook subscription with ID ${id} not found`,
      );
    }

    const [
      recentTerminalFailureCount,
      deliveries,
      terminalFailureCandidates,
      auditLogs,
      remediationSummary,
    ] = await Promise.all([
      this.countRecentTerminalFailuresForSubscription(subscription.id),
      this.deliveriesRepository.find({
        where: { subscriptionId: subscription.id },
        relations: { subscription: true },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: 10,
      }),
      this.deliveriesRepository.find({
        where: {
          subscriptionId: subscription.id,
          status: ProcurementWebhookDeliveryStatus.FAILED,
        },
        relations: { subscription: true },
        order: { finalFailureAt: 'DESC', id: 'DESC' },
      }),
      this.auditService.listForTarget(
        'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
        subscription.id,
        20,
      ),
      this.buildSubscriptionRemediationSummary(subscription.id),
    ]);

    const currentResumeRisk = this.buildResumeRiskSnapshot(
      recentTerminalFailureCount,
      false,
    );
    const latestAutoPauseLog = auditLogs.find((log) =>
      log.action?.startsWith('procurement_webhook_subscription.auto_paused'),
    );
    const latestAutoPause = latestAutoPauseLog
      ? this.mapAutoPausedSubscriptionLog(latestAutoPauseLog, subscription)
      : null;
    const recentRemediationActions = auditLogs
      .filter(
        (log) =>
          log.action === 'procurement_webhook_subscription.status.update' ||
          log.action?.startsWith(
            'procurement_webhook_subscription.auto_paused',
          ) ||
          log.action === 'procurement_webhook_subscription.replay_operation',
      )
      .slice(0, 10)
      .map((log) => this.mapRemediationAction(log));
    const latestReplayOperation =
      recentRemediationActions.find((log) => log.replayScope != null) ?? null;
    const terminalFailuresForReplay = terminalFailureCandidates.filter(
      (delivery) => delivery.finalFailureAt != null,
    );
    const recentFailureTimeline = deliveries
      .filter(
        (delivery) =>
          delivery.status === ProcurementWebhookDeliveryStatus.FAILED,
      )
      .sort((left, right) => {
        const leftTime =
          left.finalFailureAt?.getTime() ??
          left.nextRetryAt?.getTime() ??
          left.createdAt.getTime();
        const rightTime =
          right.finalFailureAt?.getTime() ??
          right.nextRetryAt?.getTime() ??
          right.createdAt.getTime();
        return rightTime - leftTime;
      })
      .slice(0, 10)
      .map((delivery) => this.mapFailureTimelineEntry(delivery));
    const recentTerminalFailures = deliveries
      .filter(
        (delivery) =>
          delivery.status === ProcurementWebhookDeliveryStatus.FAILED &&
          delivery.finalFailureAt != null,
      )
      .sort((left, right) => {
        const leftTime = left.finalFailureAt?.getTime() ?? 0;
        const rightTime = right.finalFailureAt?.getTime() ?? 0;
        return rightTime - leftTime;
      })
      .slice(0, 10)
      .map((delivery) => this.mapDeliveryResponse(delivery));
    const recentSuccessfulDeliveries = deliveries
      .filter(
        (delivery) =>
          delivery.status === ProcurementWebhookDeliveryStatus.SUCCEEDED,
      )
      .slice(0, 10)
      .map((delivery) => this.mapDeliveryResponse(delivery));
    const terminalFailureReplayReadiness =
      this.buildTerminalFailureReplayReadiness(terminalFailuresForReplay);
    const terminalFailureReplayPreview = this.buildReplayTerminalFailurePreview(
      terminalFailuresForReplay,
      {
        pageSize:
          ProcurementWebhooksService.SUBSCRIPTION_DETAIL_REPLAY_RECOMMENDED_LIMIT,
        replaySignature: this.buildReplayTerminalFailureExecutionSignature(
          {
            subscriptionId: subscription.id,
            limit:
              ProcurementWebhooksService.SUBSCRIPTION_DETAIL_REPLAY_RECOMMENDED_LIMIT,
          },
          ProcurementWebhooksService.SUBSCRIPTION_DETAIL_REPLAY_RECOMMENDED_LIMIT,
          terminalFailuresForReplay.length,
          terminalFailuresForReplay.length,
        ),
      },
    );
    const deliveryMix = this.buildSubscriptionDeliveryMix(deliveries);

    return {
      ...this.mapSubscriptionResponse(subscription, currentResumeRisk),
      currentResumeRisk,
      latestAutoPause,
      recentDeliveries: deliveries.map((delivery) =>
        this.mapDeliveryResponse(delivery),
      ),
      recentTerminalFailures,
      recentSuccessfulDeliveries,
      recentFailureTimeline,
      terminalFailureReplayReadiness,
      terminalFailureReplayPreview,
      deliveryMix,
      recentRemediationActions,
      remediationSummary,
      hasReplayHistory: remediationSummary.replayOperationCount > 0,
      hasPreviewConfirmedReplayHistory:
        remediationSummary.previewConfirmedReplayCount > 0,
      hasAutoPauseHistory: remediationSummary.autoPausedCount > 0,
      latestReplayOperation,
      route: this.buildSubscriptionRoute(subscription.id),
      terminalFailuresRoute: this.buildSubscriptionTerminalFailuresRoute(
        subscription.id,
      ),
      statusUpdateRoute: `${ProcurementWebhooksService.ADMIN_WEBHOOKS_ROUTE}/subscriptions/${subscription.id}/status`,
      replayTerminalFailuresRoute: `${ProcurementWebhooksService.ADMIN_WEBHOOKS_ROUTE}/deliveries/replay-terminal-failures?subscriptionId=${subscription.id}`,
      replayTerminalFailuresPreviewRoute: `${ProcurementWebhooksService.ADMIN_WEBHOOKS_ROUTE}/deliveries/replay-terminal-failures/preview?subscriptionId=${subscription.id}`,
      replayOperationsRoute: this.buildSubscriptionReplayOperationsRoute(
        subscription.id,
      ),
      replayOperationsExportRoute:
        this.buildSubscriptionReplayOperationsExportRoute(subscription.id),
      replayGovernanceSummaryRoute:
        this.buildSubscriptionReplayOperationsSummaryRoute(subscription.id),
      replayGovernanceSummaryExportRoute:
        this.buildSubscriptionReplayOperationsSummaryExportRoute(
          subscription.id,
        ),
      previewConfirmedReplayOperationsRoute:
        this.buildSubscriptionReplayOperationsRoute(subscription.id, {
          previewConfirmed: true,
        }),
      bulkTerminalFailureReplayOperationsRoute:
        this.buildSubscriptionReplayOperationsRoute(subscription.id, {
          replayScope:
            ProcurementWebhookReplayOperationScope.BULK_TERMINAL_FAILURES,
        }),
      previewConfirmedBulkTerminalFailureReplayOperationsRoute:
        this.buildSubscriptionReplayOperationsRoute(subscription.id, {
          replayScope:
            ProcurementWebhookReplayOperationScope.BULK_TERMINAL_FAILURES,
          previewConfirmed: true,
        }),
      remediationActionsRoute: this.buildSubscriptionRemediationActionsRoute(
        subscription.id,
      ),
      replayRemediationActionsRoute:
        this.buildSubscriptionRemediationActionsRoute(subscription.id, {
          actionType:
            ProcurementWebhookSubscriptionRemediationActionType.REPLAY_OPERATION,
        }),
      previewConfirmedReplayRemediationActionsRoute:
        this.buildSubscriptionRemediationActionsRoute(subscription.id, {
          actionType:
            ProcurementWebhookSubscriptionRemediationActionType.REPLAY_OPERATION,
          previewConfirmed: true,
        }),
      statusRemediationActionsRoute:
        this.buildSubscriptionRemediationActionsRoute(subscription.id, {
          actionType:
            ProcurementWebhookSubscriptionRemediationActionType.STATUS_UPDATE,
        }),
      autoPausedRemediationActionsRoute:
        this.buildSubscriptionRemediationActionsRoute(subscription.id, {
          actionType:
            ProcurementWebhookSubscriptionRemediationActionType.AUTO_PAUSED,
        }),
      bulkTerminalFailureReplayRemediationActionsRoute:
        this.buildSubscriptionRemediationActionsRoute(subscription.id, {
          actionType:
            ProcurementWebhookSubscriptionRemediationActionType.REPLAY_OPERATION,
          replayScope:
            ProcurementWebhookReplayOperationScope.BULK_TERMINAL_FAILURES,
        }),
      previewConfirmedBulkTerminalFailureReplayRemediationActionsRoute:
        this.buildSubscriptionRemediationActionsRoute(subscription.id, {
          actionType:
            ProcurementWebhookSubscriptionRemediationActionType.REPLAY_OPERATION,
          replayScope:
            ProcurementWebhookReplayOperationScope.BULK_TERMINAL_FAILURES,
          previewConfirmed: true,
        }),
    };
  }

  async listSubscriptionRemediationActions(
    subscriptionId: number,
    query: ProcurementWebhookRemediationActionQueryDto = {},
  ): Promise<ProcurementWebhookSubscriptionRemediationActionPageResponseDto> {
    if (query.cursor && query.page != null) {
      throw new BadRequestException(
        'Subscription remediation action listing does not accept page and cursor together',
      );
    }
    if (query.cursor) {
      this.parseProcurementWebhookAuditCursor(query.cursor);
    }
    this.assertProcurementWebhookAuditDateRange(query.from, query.to);

    const subscription = await this.subscriptionsRepository.findOne({
      where: { id: subscriptionId },
    });
    if (!subscription) {
      throw new NotFoundException(
        `Procurement webhook subscription with ID ${subscriptionId} not found`,
      );
    }

    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const filters = {
      actions: this.getSubscriptionRemediationActionAuditActions(query),
      actorEmail: query.actorEmail,
      actorId: query.actorId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      metaEquals: {
        ...(query.replayExecutionMode
          ? { replayExecutionMode: query.replayExecutionMode }
          : {}),
        ...(query.replayScope ? { replayScope: query.replayScope } : {}),
        ...(typeof query.previewConfirmed === 'boolean'
          ? { previewConfirmed: query.previewConfirmed }
          : {}),
      },
    };
    const pageResult = query.cursor
      ? null
      : await this.auditService.listForTargetPaged(
          'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
          subscriptionId,
          {
            page,
            limit,
            filters,
          },
        );
    const cursorResult = query.cursor
      ? await this.auditService.listForTargetCursor(
          'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
          subscriptionId,
          {
            after: query.cursor,
            limit,
            filters,
          },
        )
      : null;
    const items = pageResult?.items ?? cursorResult?.items ?? [];

    return {
      items: items.map((item) => this.mapRemediationAction(item)),
      total: pageResult?.total ?? null,
      page: pageResult?.page ?? null,
      perPage: pageResult?.perPage ?? limit,
      totalPages: pageResult?.totalPages ?? null,
      appliedCursor: query.cursor ?? null,
      nextCursor: cursorResult?.nextCursor ?? null,
    };
  }

  async getReplayOperationsSummary(
    query: ProcurementWebhookReplayOperationSummaryQueryDto = {},
  ): Promise<ProcurementWebhookReplayGovernanceSummaryResponseDto> {
    this.assertProcurementWebhookAuditDateRange(query.from, query.to);

    const filters = this.buildReplayOperationAuditFilters(query);
    const targetId = query.subscriptionId;

    const [
      totalReplayOperationCount,
      previewConfirmedReplayCount,
      singleDeliveryReplayCount,
      explicitDeliveryReplayCount,
      filteredPageReplayCount,
      previewConfirmedPageReplayCount,
      bulkTerminalFailureReplayCount,
      previewConfirmedBulkTerminalFailureReplayCount,
    ] = await Promise.all([
      this.countReplayOperationAuditLogs(filters, targetId),
      this.countReplayOperationAuditLogs(
        this.mergeReplayOperationAuditFilters(filters, {
          previewConfirmed: true,
        }),
        targetId,
      ),
      this.countReplayOperationAuditLogs(
        this.mergeReplayOperationAuditFilters(filters, {
          replayExecutionMode:
            ProcurementWebhookReplayExecutionMode.SINGLE_DELIVERY,
        }),
        targetId,
      ),
      this.countReplayOperationAuditLogs(
        this.mergeReplayOperationAuditFilters(filters, {
          replayExecutionMode:
            ProcurementWebhookReplayExecutionMode.EXPLICIT_DELIVERY_IDS,
        }),
        targetId,
      ),
      this.countReplayOperationAuditLogs(
        this.mergeReplayOperationAuditFilters(filters, {
          replayExecutionMode:
            ProcurementWebhookReplayExecutionMode.FILTERED_PAGE,
        }),
        targetId,
      ),
      this.countReplayOperationAuditLogs(
        this.mergeReplayOperationAuditFilters(filters, {
          replayExecutionMode:
            ProcurementWebhookReplayExecutionMode.PREVIEW_CONFIRMED_PAGE,
        }),
        targetId,
      ),
      this.countReplayOperationAuditLogs(
        this.mergeReplayOperationAuditFilters(filters, {
          replayScope:
            ProcurementWebhookReplayOperationScope.BULK_TERMINAL_FAILURES,
        }),
        targetId,
      ),
      this.countReplayOperationAuditLogs(
        this.mergeReplayOperationAuditFilters(filters, {
          replayScope:
            ProcurementWebhookReplayOperationScope.BULK_TERMINAL_FAILURES,
          previewConfirmed: true,
        }),
        targetId,
      ),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      totalReplayOperationCount,
      previewConfirmedReplayCount,
      singleDeliveryReplayCount,
      explicitDeliveryReplayCount,
      filteredPageReplayCount,
      previewConfirmedPageReplayCount,
      bulkTerminalFailureReplayCount,
      previewConfirmedBulkTerminalFailureReplayCount,
    };
  }

  async exportReplayOperationsSummaryCsv(
    query: ProcurementWebhookReplayOperationSummaryQueryDto = {},
  ): Promise<string> {
    const summary = await this.getReplayOperationsSummary(query);
    const header = [
      'generatedAt',
      'subscriptionId',
      'actorId',
      'actorEmail',
      'from',
      'to',
      'totalReplayOperationCount',
      'previewConfirmedReplayCount',
      'singleDeliveryReplayCount',
      'explicitDeliveryReplayCount',
      'filteredPageReplayCount',
      'previewConfirmedPageReplayCount',
      'bulkTerminalFailureReplayCount',
      'previewConfirmedBulkTerminalFailureReplayCount',
    ];
    const row = [
      summary.generatedAt,
      query.subscriptionId ?? '',
      query.actorId ?? '',
      JSON.stringify(query.actorEmail ?? ''),
      JSON.stringify(query.from ?? ''),
      JSON.stringify(query.to ?? ''),
      summary.totalReplayOperationCount,
      summary.previewConfirmedReplayCount,
      summary.singleDeliveryReplayCount,
      summary.explicitDeliveryReplayCount,
      summary.filteredPageReplayCount,
      summary.previewConfirmedPageReplayCount,
      summary.bulkTerminalFailureReplayCount,
      summary.previewConfirmedBulkTerminalFailureReplayCount,
    ];

    return [header.join(','), row.join(',')].join('\n');
  }

  async exportReplayOperationsCsv(
    query: ProcurementWebhookReplayOperationQueryDto = {},
  ): Promise<string> {
    if (query.cursor && query.page != null) {
      throw new BadRequestException(
        'Replay operation export does not accept page and cursor together',
      );
    }
    if (query.cursor) {
      this.parseProcurementWebhookAuditCursor(query.cursor);
    }
    this.assertProcurementWebhookAuditDateRange(query.from, query.to);

    const exportLimit = Math.min(Math.max(query.limit ?? 1000, 1), 10000);
    const filters = this.buildReplayOperationAuditFilters(query);
    const pageResult = query.cursor
      ? null
      : await this.auditService.listAllPaged({
          page: Math.max(query.page ?? 1, 1),
          limit: exportLimit,
          targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
          targetId: query.subscriptionId,
          filters,
        });
    const cursorResult = query.cursor
      ? await this.auditService.listAllCursor({
          after: query.cursor,
          limit: exportLimit,
          targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
          targetId: query.subscriptionId,
          filters,
        })
      : null;
    const items = pageResult?.items ?? cursorResult?.items ?? [];
    const subscriptionIds = Array.from(
      new Set(items.map((item) => item.targetId).filter((value) => value > 0)),
    );
    const subscriptions = subscriptionIds.length
      ? await this.subscriptionsRepository.find({
          where: { id: In(subscriptionIds) },
        })
      : [];
    const subscriptionsById = new Map(
      subscriptions.map((subscription) => [subscription.id, subscription]),
    );
    const rows = items.map((item) => {
      const mapped = this.mapRemediationAction(item);
      return [
        item.targetId,
        JSON.stringify(
          subscriptionsById.get(item.targetId)?.name ??
            `Subscription ${item.targetId}`,
        ),
        JSON.stringify(this.buildSubscriptionRoute(item.targetId)),
        JSON.stringify(mapped.action),
        JSON.stringify(mapped.summary),
        JSON.stringify(mapped.createdAt),
        mapped.actorId ?? '',
        JSON.stringify(mapped.actorEmail ?? ''),
        JSON.stringify(mapped.reason ?? ''),
        JSON.stringify(mapped.note ?? ''),
        JSON.stringify(mapped.replayScope ?? ''),
        JSON.stringify(mapped.replayExecutionMode ?? ''),
        mapped.previewConfirmed == null ? '' : mapped.previewConfirmed,
        mapped.requestedCount ?? '',
        mapped.matchedTerminalFailureCount ?? '',
        mapped.replayedCount ?? '',
        mapped.skippedCount ?? '',
        JSON.stringify(mapped.previewCursor ?? ''),
        mapped.previewMatchedTerminalFailureCount ?? '',
        JSON.stringify(mapped.previewConfirmationIssuedAt ?? ''),
        JSON.stringify(mapped.previewConfirmationExpiresAt ?? ''),
      ].join(',');
    });

    return [
      [
        'subscriptionId',
        'subscriptionName',
        'route',
        'action',
        'summary',
        'createdAt',
        'actorId',
        'actorEmail',
        'reason',
        'note',
        'replayScope',
        'replayExecutionMode',
        'previewConfirmed',
        'requestedCount',
        'matchedTerminalFailureCount',
        'replayedCount',
        'skippedCount',
        'previewCursor',
        'previewMatchedTerminalFailureCount',
        'previewConfirmationIssuedAt',
        'previewConfirmationExpiresAt',
      ].join(','),
      ...rows,
    ].join('\n');
  }

  async updateSubscriptionStatus(
    id: number,
    dto: UpdateProcurementWebhookSubscriptionStatusDto,
    actor: { id?: number | null; email?: string | null } = {},
  ): Promise<ProcurementWebhookSubscriptionStatusUpdateResponseDto> {
    const subscription = await this.subscriptionsRepository.findOne({
      where: { id },
    });
    if (!subscription) {
      throw new NotFoundException(
        `Procurement webhook subscription with ID ${id} not found`,
      );
    }

    let resumeRisk: ProcurementWebhookSubscriptionResumeRiskResponseDto | null =
      null;
    if (
      dto.status === ProcurementWebhookSubscriptionStatus.ACTIVE &&
      subscription.status !== ProcurementWebhookSubscriptionStatus.ACTIVE
    ) {
      const recentTerminalFailureCount =
        await this.countRecentTerminalFailuresForSubscription(subscription.id);
      resumeRisk = this.buildResumeRiskSnapshot(
        recentTerminalFailureCount,
        Boolean(dto.forceResume),
      );
      if (
        recentTerminalFailureCount >=
          ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD &&
        !dto.forceResume
      ) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'PROCUREMENT_WEBHOOK_RESUME_REQUIRES_FORCE',
          message: `Subscription ${subscription.id} still has ${recentTerminalFailureCount} terminal failures in the last ${ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS} hours. Set forceResume=true to resume anyway.`,
          resumeRisk,
        });
      }
    }

    subscription.status = dto.status;
    subscription.updatedByUserId = actor.id ?? null;
    const saved = await this.subscriptionsRepository.save(subscription);

    await this.auditService.log({
      action: 'procurement_webhook_subscription.status.update',
      targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
      targetId: saved.id,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.note ?? null,
      meta: {
        status: saved.status,
        forceResume:
          dto.status === ProcurementWebhookSubscriptionStatus.ACTIVE
            ? Boolean(dto.forceResume)
            : false,
        recentTerminalFailureCount: resumeRisk?.recentTerminalFailureCount ?? 0,
        forceResumeRequired: resumeRisk?.forceResumeRequired ?? false,
      },
    });

    return this.mapSubscriptionStatusUpdateResponse(saved, resumeRisk);
  }

  async listDeliveries(
    query: ProcurementWebhookDeliveryQueryDto = {},
  ): Promise<ProcurementWebhookDeliveryPageResponseDto> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 200);
    const qb = this.deliveriesRepository
      .createQueryBuilder('delivery')
      .leftJoinAndSelect('delivery.subscription', 'subscription')
      .orderBy('delivery.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('delivery.status = :status', { status: query.status });
    }
    if (query.eventType) {
      qb.andWhere('delivery.eventType = :eventType', {
        eventType: query.eventType,
      });
    }
    if (query.subscriptionId != null) {
      qb.andWhere('delivery.subscriptionId = :subscriptionId', {
        subscriptionId: query.subscriptionId,
      });
    }
    if (
      query.retryState === ProcurementWebhookDeliveryRetryState.RETRY_ELIGIBLE
    ) {
      qb.andWhere('delivery.status = :retryEligibleStatus', {
        retryEligibleStatus: ProcurementWebhookDeliveryStatus.FAILED,
      });
      qb.andWhere('delivery.nextRetryAt IS NOT NULL');
      qb.andWhere('delivery.nextRetryAt <= :retryEligibleNow', {
        retryEligibleNow: new Date(),
      });
      qb.andWhere('delivery.finalFailureAt IS NULL');
    }
    if (
      query.retryState === ProcurementWebhookDeliveryRetryState.RETRY_SCHEDULED
    ) {
      qb.andWhere('delivery.status = :retryScheduledStatus', {
        retryScheduledStatus: ProcurementWebhookDeliveryStatus.FAILED,
      });
      qb.andWhere('delivery.nextRetryAt IS NOT NULL');
      qb.andWhere('delivery.nextRetryAt > :retryScheduledNow', {
        retryScheduledNow: new Date(),
      });
      qb.andWhere('delivery.finalFailureAt IS NULL');
    }
    if (
      query.retryState === ProcurementWebhookDeliveryRetryState.TERMINAL_FAILURE
    ) {
      qb.andWhere('delivery.status = :retryTerminalStatus', {
        retryTerminalStatus: ProcurementWebhookDeliveryStatus.FAILED,
      });
      qb.andWhere('delivery.finalFailureAt IS NOT NULL');
    }
    if (query.nextRetryFrom) {
      qb.andWhere('delivery.nextRetryAt >= :nextRetryFrom', {
        nextRetryFrom: new Date(query.nextRetryFrom),
      });
    }
    if (query.nextRetryTo) {
      qb.andWhere('delivery.nextRetryAt <= :nextRetryTo', {
        nextRetryTo: new Date(query.nextRetryTo),
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((item) => this.mapDeliveryResponse(item)),
      total,
      page,
      perPage: limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listReplayOperations(
    query: ProcurementWebhookReplayOperationQueryDto = {},
  ): Promise<ProcurementWebhookReplayOperationPageResponseDto> {
    if (query.cursor && query.page != null) {
      throw new BadRequestException(
        'Replay operation listing does not accept page and cursor together',
      );
    }
    if (query.cursor) {
      this.parseProcurementWebhookAuditCursor(query.cursor);
    }
    this.assertProcurementWebhookAuditDateRange(query.from, query.to);

    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const filters = this.buildReplayOperationAuditFilters(query);
    const pageResult = query.cursor
      ? null
      : await this.auditService.listAllPaged({
          page,
          limit,
          targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
          targetId: query.subscriptionId,
          filters,
        });
    const cursorResult = query.cursor
      ? await this.auditService.listAllCursor({
          after: query.cursor,
          limit,
          targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
          targetId: query.subscriptionId,
          filters,
        })
      : null;
    const items = pageResult?.items ?? cursorResult?.items ?? [];
    const subscriptionIds = Array.from(
      new Set(items.map((item) => item.targetId).filter((value) => value > 0)),
    );
    const subscriptions = subscriptionIds.length
      ? await this.subscriptionsRepository.find({
          where: { id: In(subscriptionIds) },
        })
      : [];
    const subscriptionsById = new Map(
      subscriptions.map((subscription) => [subscription.id, subscription]),
    );

    return {
      items: items.map((item) => ({
        ...this.mapRemediationAction(item),
        subscriptionId: item.targetId,
        subscriptionName:
          subscriptionsById.get(item.targetId)?.name ??
          `Subscription ${item.targetId}`,
        route: this.buildSubscriptionRoute(item.targetId),
      })),
      total: pageResult?.total ?? null,
      page: pageResult?.page ?? null,
      perPage: pageResult?.perPage ?? limit,
      totalPages: pageResult?.totalPages ?? null,
      appliedCursor: query.cursor ?? null,
      nextCursor: cursorResult?.nextCursor ?? null,
    };
  }

  async getHealthSummary(): Promise<ProcurementWebhookHealthSummaryResponseDto> {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const previous24HoursStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const [subscriptions, deliveries] = await Promise.all([
      this.subscriptionsRepository.find(),
      this.deliveriesRepository.find({
        relations: { subscription: true },
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
    ]);
    const pausedSubscriptionIds = subscriptions
      .filter(
        (subscription) =>
          subscription.status === ProcurementWebhookSubscriptionStatus.PAUSED,
      )
      .map((subscription) => subscription.id);
    const autoPauseAuditLogs = await this.auditService.listForTargets(
      'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
      pausedSubscriptionIds,
      {
        limit: 100,
        actionPrefix: 'procurement_webhook_subscription.auto_paused',
      },
    );
    const subscriptionsById = new Map(
      subscriptions.map((subscription) => [subscription.id, subscription]),
    );
    const latestAutoPauseBySubscriptionId = new Map<number, any>();

    for (const log of autoPauseAuditLogs) {
      const existing = latestAutoPauseBySubscriptionId.get(log.targetId);
      if (!existing || existing.createdAt < log.createdAt) {
        latestAutoPauseBySubscriptionId.set(log.targetId, log);
      }
    }

    const recentAutoPausedSubscriptions = Array.from(
      latestAutoPauseBySubscriptionId.values(),
    )
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      )
      .slice(
        0,
        ProcurementWebhooksService.HEALTH_SUMMARY_RECENT_AUTO_PAUSE_LIMIT,
      )
      .map((log) => {
        const subscription = subscriptionsById.get(log.targetId);
        return {
          subscriptionId: log.targetId,
          subscriptionName:
            subscription?.name ?? `Subscription ${log.targetId}`,
          pausedAt: new Date(log.createdAt).toISOString(),
          triggerDeliveryId: Number(log.meta?.triggerDeliveryId ?? 0),
          terminalFailureCount: Number(log.meta?.terminalFailureCount ?? 0),
          threshold: Number(
            log.meta?.threshold ??
              ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD,
          ),
          thresholdWindowHours: Number(
            log.meta?.thresholdWindowHours ??
              ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS,
          ),
        };
      });

    const recentDeliveries = deliveries.filter(
      (delivery) => delivery.createdAt >= last24Hours,
    );
    const recentTerminalFailureCountsBySubscription = new Map<number, number>();
    const previousTerminalFailureCountsBySubscription = new Map<
      number,
      number
    >();
    const terminalFailures = deliveries.filter(
      (delivery) =>
        delivery.status === ProcurementWebhookDeliveryStatus.FAILED &&
        delivery.finalFailureAt != null,
    );
    const terminalFailuresLast24Hours = terminalFailures.filter(
      (delivery) =>
        delivery.finalFailureAt != null &&
        delivery.finalFailureAt >= last24Hours,
    );
    for (const delivery of terminalFailuresLast24Hours) {
      recentTerminalFailureCountsBySubscription.set(
        delivery.subscriptionId,
        (recentTerminalFailureCountsBySubscription.get(
          delivery.subscriptionId,
        ) ?? 0) + 1,
      );
    }
    const terminalFailuresPrevious24Hours = terminalFailures.filter(
      (delivery) =>
        delivery.finalFailureAt != null &&
        delivery.finalFailureAt >= previous24HoursStart &&
        delivery.finalFailureAt < last24Hours,
    );
    for (const delivery of terminalFailuresPrevious24Hours) {
      previousTerminalFailureCountsBySubscription.set(
        delivery.subscriptionId,
        (previousTerminalFailureCountsBySubscription.get(
          delivery.subscriptionId,
        ) ?? 0) + 1,
      );
    }
    const retryEligibleCount = deliveries.filter(
      (delivery) =>
        delivery.status === ProcurementWebhookDeliveryStatus.FAILED &&
        delivery.nextRetryAt != null &&
        delivery.nextRetryAt <= now &&
        delivery.finalFailureAt == null,
    ).length;
    const retryScheduledCount = deliveries.filter(
      (delivery) =>
        delivery.status === ProcurementWebhookDeliveryStatus.FAILED &&
        delivery.nextRetryAt != null &&
        delivery.nextRetryAt > now &&
        delivery.finalFailureAt == null,
    ).length;
    const recentSuccessCount = recentDeliveries.filter(
      (delivery) =>
        delivery.status === ProcurementWebhookDeliveryStatus.SUCCEEDED,
    ).length;
    const eventTypeCounts = Object.values(ProcurementWebhookEventType).map(
      (eventType) => ({
        eventType,
        count: deliveries.filter((delivery) => delivery.eventType === eventType)
          .length,
      }),
    );
    const averageAttemptsForTerminalFailures =
      terminalFailures.length > 0
        ? Number(
            (
              terminalFailures.reduce(
                (sum, delivery) => sum + Math.max(delivery.attemptCount, 0),
                0,
              ) / terminalFailures.length
            ).toFixed(2),
          )
        : 0;
    const severityCounts: ProcurementWebhookHealthSeverityCountResponseDto[] =
      Object.values(ProcurementWebhookResumeRiskSeverity).map((severity) => ({
        severity,
        count: subscriptions.filter((subscription) => {
          const riskSnapshot = this.buildResumeRiskSnapshot(
            recentTerminalFailureCountsBySubscription.get(subscription.id) ?? 0,
            false,
          );
          return riskSnapshot.severity === severity;
        }).length,
      }));
    const severityTrendDeltas: ProcurementWebhookHealthSeverityTrendResponseDto[] =
      Object.values(ProcurementWebhookResumeRiskSeverity).map((severity) => {
        const currentCount = subscriptions.filter((subscription) => {
          const riskSnapshot = this.buildResumeRiskSnapshot(
            recentTerminalFailureCountsBySubscription.get(subscription.id) ?? 0,
            false,
          );
          return riskSnapshot.severity === severity;
        }).length;
        const currentPercentage =
          subscriptions.length > 0
            ? Number(((currentCount / subscriptions.length) * 100).toFixed(2))
            : 0;
        const previousCount = subscriptions.filter((subscription) => {
          const riskSnapshot = this.buildResumeRiskSnapshot(
            previousTerminalFailureCountsBySubscription.get(subscription.id) ??
              0,
            false,
          );
          return riskSnapshot.severity === severity;
        }).length;
        const previousPercentage =
          subscriptions.length > 0
            ? Number(((previousCount / subscriptions.length) * 100).toFixed(2))
            : 0;

        return {
          severity,
          currentCount,
          currentPercentage,
          previousCount,
          previousPercentage,
          delta: currentCount - previousCount,
          deltaPercentage: Number(
            (currentPercentage - previousPercentage).toFixed(2),
          ),
          trendDirection: this.getTrendDirection(currentCount - previousCount),
        };
      });
    const topRiskSubscriptions: ProcurementWebhookHealthTopRiskSubscriptionResponseDto[] =
      subscriptions
        .map((subscription) => {
          const riskSnapshot = this.buildResumeRiskSnapshot(
            recentTerminalFailureCountsBySubscription.get(subscription.id) ?? 0,
            false,
          );

          return {
            subscriptionId: subscription.id,
            subscriptionName: subscription.name,
            status: subscription.status,
            severity: riskSnapshot.severity,
            recentTerminalFailureCount: riskSnapshot.recentTerminalFailureCount,
            threshold: riskSnapshot.threshold,
            thresholdWindowHours: riskSnapshot.thresholdWindowHours,
            route: this.buildSubscriptionRoute(subscription.id),
            terminalFailuresRoute: this.buildSubscriptionTerminalFailuresRoute(
              subscription.id,
            ),
          };
        })
        .sort((left, right) => {
          const severityRankDiff =
            this.getResumeRiskSeverityRank(right.severity) -
            this.getResumeRiskSeverityRank(left.severity);
          if (severityRankDiff !== 0) {
            return severityRankDiff;
          }

          const failureCountDiff =
            right.recentTerminalFailureCount - left.recentTerminalFailureCount;
          if (failureCountDiff !== 0) {
            return failureCountDiff;
          }

          return right.subscriptionId - left.subscriptionId;
        })
        .slice(
          0,
          ProcurementWebhooksService.HEALTH_SUMMARY_TOP_RISK_SUBSCRIPTION_LIMIT,
        );

    return {
      generatedAt: now.toISOString(),
      autoPauseThreshold:
        ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD,
      autoPauseThresholdWindowHours:
        ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS,
      activeSubscriptionCount: subscriptions.filter(
        (subscription) =>
          subscription.status === ProcurementWebhookSubscriptionStatus.ACTIVE,
      ).length,
      pausedSubscriptionCount: subscriptions.filter(
        (subscription) =>
          subscription.status === ProcurementWebhookSubscriptionStatus.PAUSED,
      ).length,
      autoPausedSubscriptionCount: latestAutoPauseBySubscriptionId.size,
      totalDeliveryCount: deliveries.length,
      pendingDeliveryCount: deliveries.filter(
        (delivery) =>
          delivery.status === ProcurementWebhookDeliveryStatus.PENDING,
      ).length,
      succeededDeliveryCount: deliveries.filter(
        (delivery) =>
          delivery.status === ProcurementWebhookDeliveryStatus.SUCCEEDED,
      ).length,
      failedDeliveryCount: deliveries.filter(
        (delivery) =>
          delivery.status === ProcurementWebhookDeliveryStatus.FAILED,
      ).length,
      retryEligibleCount,
      retryScheduledCount,
      terminalFailureCount: terminalFailures.length,
      deliveriesLast24Hours: recentDeliveries.length,
      terminalFailuresLast24Hours: terminalFailuresLast24Hours.length,
      successRateLast24Hours:
        recentDeliveries.length > 0
          ? Number(
              ((recentSuccessCount / recentDeliveries.length) * 100).toFixed(2),
            )
          : 0,
      averageAttemptsForTerminalFailures,
      severityCounts,
      severityTrendDeltas,
      topRiskSubscriptions,
      eventTypeCounts,
      recentTerminalFailures: terminalFailures
        .slice()
        .sort((left, right) => {
          const leftTime = left.finalFailureAt?.getTime() ?? 0;
          const rightTime = right.finalFailureAt?.getTime() ?? 0;
          return rightTime - leftTime;
        })
        .slice(
          0,
          ProcurementWebhooksService.HEALTH_SUMMARY_RECENT_FAILURE_LIMIT,
        )
        .map((delivery) => this.mapDeliveryResponse(delivery)),
      recentAutoPausedSubscriptions,
    };
  }

  async replayDelivery(
    id: number,
    dto: ReplayProcurementWebhookDeliveryDto = {},
    actor: { id?: number | null; email?: string | null } = {},
  ): Promise<ProcurementWebhookDeliveryResponseDto> {
    const delivery = await this.deliveriesRepository.findOne({
      where: { id },
      relations: { subscription: true },
    });
    if (!delivery) {
      throw new NotFoundException(
        `Procurement webhook delivery with ID ${id} not found`,
      );
    }

    const replayed = await this.deliverToSubscription(
      delivery.subscription,
      {
        eventType: delivery.eventType,
        eventKey: `${delivery.eventKey}:replay:${Date.now()}`,
        branchId: delivery.branchId ?? null,
        supplierProfileId: delivery.supplierProfileId ?? null,
        purchaseOrderId: delivery.purchaseOrderId ?? null,
        payload: delivery.requestBody,
      },
      delivery.id,
    );

    await this.auditService.log({
      action: 'procurement_webhook_delivery.replay',
      targetType: 'PROCUREMENT_WEBHOOK_DELIVERY',
      targetId: replayed.id,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.note ?? null,
      meta: {
        replayedFromDeliveryId: delivery.id,
        subscriptionId: delivery.subscriptionId,
        eventType: delivery.eventType,
        replayScope: ProcurementWebhookReplayOperationScope.SINGLE_DELIVERY,
        replayExecutionMode:
          ProcurementWebhookReplayExecutionMode.SINGLE_DELIVERY,
      },
    });

    await this.auditService.log({
      action: 'procurement_webhook_subscription.replay_operation',
      targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
      targetId: delivery.subscriptionId,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.note ?? null,
      meta: {
        replayScope: ProcurementWebhookReplayOperationScope.SINGLE_DELIVERY,
        replayExecutionMode:
          ProcurementWebhookReplayExecutionMode.SINGLE_DELIVERY,
        deliveryId: delivery.id,
        replayedFromDeliveryId: delivery.id,
        requestedCount: 1,
        matchedTerminalFailureCount: 1,
        replayedCount: 1,
        skippedCount: 0,
        subscriptionId: delivery.subscriptionId,
        eventType: delivery.eventType,
        previewConfirmed: false,
        previewCursor: null,
        previewMatchedTerminalFailureCount: null,
        previewConfirmationIssuedAt: null,
        previewConfirmationExpiresAt: null,
      },
    });

    return this.mapDeliveryResponse(
      replayed,
      delivery.subscription?.name ?? null,
    );
  }

  async replayTerminalFailures(
    dto: ReplayTerminalProcurementWebhookDeliveriesDto = {},
    actor: { id?: number | null; email?: string | null } = {},
  ): Promise<ProcurementWebhookBulkReplayResponseDto> {
    const {
      requestedCount,
      replaySignature,
      totalMatchedTerminalFailureCount,
      pagedDeliveries,
    } = await this.getReplayTerminalFailureCandidates(dto);
    const governance = this.assertReplayTerminalFailureExecutionAllowed(
      dto,
      replaySignature,
      totalMatchedTerminalFailureCount,
    );
    const replayedDeliveries: ProcurementWebhookDeliveryResponseDto[] = [];
    const skippedDeliveryIds: number[] = [];

    for (const delivery of pagedDeliveries) {
      if (!delivery.subscription) {
        skippedDeliveryIds.push(delivery.id);
        continue;
      }

      const replayed = await this.deliverToSubscription(
        delivery.subscription,
        {
          eventType: delivery.eventType,
          eventKey: `${delivery.eventKey}:bulk-replay:${Date.now()}`,
          branchId: delivery.branchId ?? null,
          supplierProfileId: delivery.supplierProfileId ?? null,
          purchaseOrderId: delivery.purchaseOrderId ?? null,
          payload: delivery.requestBody,
        },
        delivery.id,
      );

      await this.auditService.log({
        action: 'procurement_webhook_delivery.replay',
        targetType: 'PROCUREMENT_WEBHOOK_DELIVERY',
        targetId: replayed.id,
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? null,
        reason: dto.note ?? null,
        meta: {
          replayedFromDeliveryId: delivery.id,
          subscriptionId: delivery.subscriptionId,
          eventType: delivery.eventType,
          replayMode: 'BULK_TERMINAL_FAILURE_REPLAY',
          replayScope: governance.replayScope,
          replayExecutionMode: governance.replayExecutionMode,
          previewConfirmed: governance.previewConfirmed,
          previewCursor: governance.previewCursor,
          previewMatchedTerminalFailureCount:
            governance.previewMatchedTerminalFailureCount,
          previewConfirmationIssuedAt: governance.previewConfirmationIssuedAt,
          previewConfirmationExpiresAt: governance.previewConfirmationExpiresAt,
        },
      });

      replayedDeliveries.push(
        this.mapDeliveryResponse(replayed, delivery.subscription.name ?? null),
      );
    }

    await this.auditService.log({
      action: 'procurement_webhook_delivery.bulk_replay_terminal_failures',
      targetType: 'PROCUREMENT_WEBHOOK_DELIVERY',
      targetId: null,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.note ?? null,
      meta: {
        requestedCount,
        matchedTerminalFailureCount: pagedDeliveries.length,
        replayedCount: replayedDeliveries.length,
        skippedCount: skippedDeliveryIds.length,
        skippedDeliveryIds,
        subscriptionId: dto.subscriptionId ?? null,
        eventType: dto.eventType ?? null,
        replayScope: governance.replayScope,
        replayExecutionMode: governance.replayExecutionMode,
        previewConfirmed: governance.previewConfirmed,
        previewCursor: governance.previewCursor,
        previewMatchedTerminalFailureCount:
          governance.previewMatchedTerminalFailureCount,
        previewConfirmationIssuedAt: governance.previewConfirmationIssuedAt,
        previewConfirmationExpiresAt: governance.previewConfirmationExpiresAt,
        totalMatchedTerminalFailureCount,
      },
    });

    if (dto.subscriptionId != null) {
      await this.auditService.log({
        action: 'procurement_webhook_subscription.replay_operation',
        targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
        targetId: dto.subscriptionId,
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? null,
        reason: dto.note ?? null,
        meta: {
          replayScope: governance.replayScope,
          replayExecutionMode: governance.replayExecutionMode,
          requestedCount,
          matchedTerminalFailureCount: pagedDeliveries.length,
          replayedCount: replayedDeliveries.length,
          skippedCount: skippedDeliveryIds.length,
          skippedDeliveryIds,
          subscriptionId: dto.subscriptionId,
          eventType: dto.eventType ?? null,
          previewConfirmed: governance.previewConfirmed,
          previewCursor: governance.previewCursor,
          previewMatchedTerminalFailureCount:
            governance.previewMatchedTerminalFailureCount,
          previewConfirmationIssuedAt: governance.previewConfirmationIssuedAt,
          previewConfirmationExpiresAt: governance.previewConfirmationExpiresAt,
          totalMatchedTerminalFailureCount,
        },
      });
    }

    return {
      requestedCount,
      matchedTerminalFailureCount: pagedDeliveries.length,
      replayedCount: replayedDeliveries.length,
      skippedCount: skippedDeliveryIds.length,
      skippedDeliveryIds,
      replayedDeliveries,
    };
  }

  async previewReplayTerminalFailures(
    dto: ReplayTerminalProcurementWebhookDeliveriesDto = {},
  ): Promise<ProcurementWebhookBulkReplayPreviewResponseDto> {
    const {
      requestedCount,
      pageSize,
      appliedCursor,
      cursorMatchedTerminalFailureCount,
      replaySignature,
      pagedDeliveries,
      totalMatchedTerminalFailureCount,
    } = await this.getReplayTerminalFailureCandidates(dto);
    return this.buildReplayTerminalFailurePreview(pagedDeliveries, {
      requestedCount,
      pageSize,
      appliedCursor,
      cursorMatchedTerminalFailureCount,
      replaySignature,
      totalMatchedTerminalFailureCount,
    });
  }

  async dispatchProcurementEvent(
    input: DispatchProcurementWebhookInput,
  ): Promise<void> {
    const subscriptions = await this.subscriptionsRepository.find({
      where: { status: ProcurementWebhookSubscriptionStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });

    const matchingSubscriptions = subscriptions.filter((subscription) => {
      if (!(subscription.eventTypes ?? []).includes(input.eventType)) {
        return false;
      }
      if (
        subscription.branchId != null &&
        subscription.branchId !== (input.branchId ?? null)
      ) {
        return false;
      }
      if (
        subscription.supplierProfileId != null &&
        subscription.supplierProfileId !== (input.supplierProfileId ?? null)
      ) {
        return false;
      }
      return true;
    });

    await Promise.allSettled(
      matchingSubscriptions.map((subscription) =>
        this.deliverToSubscription(subscription, input),
      ),
    );
  }

  async retryFailedDeliveries(limit = 50): Promise<{
    attempted: number;
    succeeded: number;
    failed: number;
  }> {
    const deliveries = await this.deliveriesRepository.find({
      where: {
        status: ProcurementWebhookDeliveryStatus.FAILED,
        nextRetryAt: LessThanOrEqual(new Date()),
      },
      relations: { subscription: true },
      order: { nextRetryAt: 'ASC', id: 'ASC' },
      take: Math.min(Math.max(limit, 1), 200),
    });

    let succeeded = 0;
    let failed = 0;

    for (const delivery of deliveries) {
      if (
        !delivery.subscription ||
        delivery.subscription.status !==
          ProcurementWebhookSubscriptionStatus.ACTIVE
      ) {
        continue;
      }

      const retried = await this.retryExistingDelivery(
        delivery,
        delivery.subscription,
      );
      if (retried.status === ProcurementWebhookDeliveryStatus.SUCCEEDED) {
        succeeded += 1;
      } else {
        failed += 1;
      }
    }

    return {
      attempted: deliveries.length,
      succeeded,
      failed,
    };
  }

  private async deliverToSubscription(
    subscription: ProcurementWebhookSubscription,
    input: DispatchProcurementWebhookInput,
    replayedFromDeliveryId?: number,
  ): Promise<ProcurementWebhookDelivery> {
    const delivery = await this.deliveriesRepository.save(
      this.deliveriesRepository.create({
        subscriptionId: subscription.id,
        eventType: input.eventType,
        eventKey: input.eventKey,
        requestUrl: subscription.endpointUrl,
        requestHeaders: {},
        requestBody: input.payload,
        branchId: input.branchId ?? null,
        supplierProfileId: input.supplierProfileId ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        status: ProcurementWebhookDeliveryStatus.PENDING,
        attemptCount: 1,
        replayedFromDeliveryId: replayedFromDeliveryId ?? null,
      }),
    );

    return this.executeDeliveryAttempt(delivery, subscription, 1);
  }

  private async retryExistingDelivery(
    delivery: ProcurementWebhookDelivery,
    subscription: ProcurementWebhookSubscription,
  ): Promise<ProcurementWebhookDelivery> {
    const nextAttempt = Math.max(delivery.attemptCount, 1) + 1;
    return this.executeDeliveryAttempt(delivery, subscription, nextAttempt);
  }

  private async executeDeliveryAttempt(
    delivery: ProcurementWebhookDelivery,
    subscription: ProcurementWebhookSubscription,
    attemptCount: number,
  ): Promise<ProcurementWebhookDelivery> {
    const timestamp = new Date().toISOString();
    const serializedPayload = JSON.stringify(delivery.requestBody);
    const signature = createHmac('sha256', subscription.signingSecret)
      .update(`${timestamp}.${serializedPayload}`)
      .digest('hex');

    const headers = {
      'content-type': 'application/json',
      'user-agent': 'suuq-procurement-webhooks/1.0',
      'x-suuq-event': delivery.eventType,
      'x-suuq-event-key': delivery.eventKey,
      'x-suuq-timestamp': timestamp,
      'x-suuq-delivery-attempt': String(attemptCount),
      'x-suuq-signature': `sha256=${signature}`,
    };

    delivery.requestUrl = subscription.endpointUrl;
    delivery.requestHeaders = headers;
    delivery.attemptCount = attemptCount;
    delivery.nextRetryAt = null;
    delivery.finalFailureAt = null;

    const startedAt = Date.now();

    try {
      const response = await axios.post(
        subscription.endpointUrl,
        delivery.requestBody,
        {
          headers,
          timeout: 10000,
          validateStatus: () => true,
        },
      );
      const isSuccess = response.status >= 200 && response.status < 300;
      delivery.status = isSuccess
        ? ProcurementWebhookDeliveryStatus.SUCCEEDED
        : ProcurementWebhookDeliveryStatus.FAILED;
      delivery.responseStatus = response.status;
      delivery.responseBody = this.stringifyResponseBody(response.data);
      delivery.errorMessage = isSuccess
        ? null
        : `Webhook endpoint returned status ${response.status}`;
    } catch (error) {
      delivery.status = ProcurementWebhookDeliveryStatus.FAILED;
      delivery.errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown webhook delivery error';
    }

    delivery.durationMs = Date.now() - startedAt;
    delivery.deliveredAt = new Date();

    if (delivery.status === ProcurementWebhookDeliveryStatus.FAILED) {
      const nextRetryAt = this.computeNextRetryAt(attemptCount);
      if (nextRetryAt) {
        delivery.nextRetryAt = nextRetryAt;
      } else {
        delivery.finalFailureAt = delivery.deliveredAt;
      }
    }

    const saved = await this.deliveriesRepository.save(delivery);

    subscription.lastDeliveredAt = saved.deliveredAt;
    subscription.lastDeliveryStatus =
      saved.status === ProcurementWebhookDeliveryStatus.SUCCEEDED
        ? ProcurementWebhookLastDeliveryStatus.SUCCEEDED
        : ProcurementWebhookLastDeliveryStatus.FAILED;
    await this.subscriptionsRepository.save(subscription);

    if (
      saved.status === ProcurementWebhookDeliveryStatus.FAILED &&
      saved.finalFailureAt != null
    ) {
      await this.dispatchTerminalFailureAlert(saved, subscription);
      await this.maybeAutoPauseSubscription(saved, subscription);
    }

    return saved;
  }

  private async dispatchTerminalFailureAlert(
    delivery: ProcurementWebhookDelivery,
    subscription: ProcurementWebhookSubscription,
  ): Promise<void> {
    const title = 'Procurement webhook delivery permanently failed';
    const body = `${subscription.name} exhausted retries for ${delivery.eventType}.`;
    const data = {
      category: 'procurement_webhook_terminal_failure',
      route: '/admin/b2b/procurement-webhooks',
      deliveryId: delivery.id,
      subscriptionId: subscription.id,
      subscriptionName: subscription.name,
      eventType: delivery.eventType,
      eventKey: delivery.eventKey,
      purchaseOrderId: delivery.purchaseOrderId ?? '',
      branchId: delivery.branchId ?? '',
      supplierProfileId: delivery.supplierProfileId ?? '',
      finalFailureAt: delivery.finalFailureAt?.toISOString() ?? '',
      lastResponseStatus: delivery.responseStatus ?? '',
      errorMessage: delivery.errorMessage ?? '',
    };

    const results = await Promise.allSettled([
      this.notificationsService.broadcastToRole({
        role: UserRole.ADMIN,
        title,
        body,
        type: NotificationType.ADMIN_BROADCAST,
        data,
      }),
      this.notificationsService.broadcastToRole({
        role: UserRole.SUPER_ADMIN,
        title,
        body,
        type: NotificationType.ADMIN_BROADCAST,
        data,
      }),
    ]);

    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      this.logger.warn(
        `Failed to queue ${failures.length} procurement webhook terminal failure alert(s) for delivery ${delivery.id}`,
      );
    }
  }

  private async maybeAutoPauseSubscription(
    delivery: ProcurementWebhookDelivery,
    subscription: ProcurementWebhookSubscription,
  ): Promise<void> {
    if (subscription.status !== ProcurementWebhookSubscriptionStatus.ACTIVE) {
      return;
    }

    const thresholdWindowStart = new Date(
      (delivery.finalFailureAt ?? new Date()).getTime() -
        ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS *
          60 *
          60 *
          1000,
    );
    const recentTerminalFailureCount =
      await this.countRecentTerminalFailuresForSubscription(
        subscription.id,
        thresholdWindowStart,
      );

    if (
      recentTerminalFailureCount <
      ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD
    ) {
      return;
    }

    subscription.status = ProcurementWebhookSubscriptionStatus.PAUSED;
    const savedSubscription =
      await this.subscriptionsRepository.save(subscription);

    await this.auditService.log({
      action: 'procurement_webhook_subscription.auto_paused',
      targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
      targetId: savedSubscription.id,
      actorId: null,
      actorEmail: null,
      meta: {
        triggerDeliveryId: delivery.id,
        terminalFailureCount: recentTerminalFailureCount,
        threshold:
          ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD,
        thresholdWindowHours:
          ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS,
        eventType: delivery.eventType,
      },
    });

    const title = 'Procurement webhook subscription auto-paused';
    const body = `${savedSubscription.name} was paused after repeated terminal delivery failures.`;
    const data = {
      category: 'procurement_webhook_subscription_auto_paused',
      route: '/admin/b2b/procurement-webhooks',
      subscriptionId: savedSubscription.id,
      subscriptionName: savedSubscription.name,
      triggerDeliveryId: delivery.id,
      terminalFailureCount: recentTerminalFailureCount,
      threshold:
        ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD,
      thresholdWindowHours:
        ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS,
    };

    const results = await Promise.allSettled([
      this.notificationsService.broadcastToRole({
        role: UserRole.ADMIN,
        title,
        body,
        type: NotificationType.ADMIN_BROADCAST,
        data,
      }),
      this.notificationsService.broadcastToRole({
        role: UserRole.SUPER_ADMIN,
        title,
        body,
        type: NotificationType.ADMIN_BROADCAST,
        data,
      }),
    ]);

    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      this.logger.warn(
        `Failed to queue ${failures.length} procurement webhook auto-pause alert(s) for subscription ${savedSubscription.id}`,
      );
    }
  }

  private async countRecentTerminalFailuresForSubscription(
    subscriptionId: number,
    thresholdWindowStart = new Date(
      Date.now() -
        ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS *
          60 *
          60 *
          1000,
    ),
  ): Promise<number> {
    return this.deliveriesRepository.count({
      where: {
        subscriptionId,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        finalFailureAt: MoreThanOrEqual(thresholdWindowStart),
      },
    });
  }

  private async getRecentTerminalFailureCountsForSubscriptions(
    subscriptionIds: number[],
    thresholdWindowStart = new Date(
      Date.now() -
        ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS *
          60 *
          60 *
          1000,
    ),
  ): Promise<Map<number, number>> {
    if (!subscriptionIds.length) {
      return new Map<number, number>();
    }

    const recentFailures = await this.deliveriesRepository.find({
      where: {
        subscriptionId: In(subscriptionIds),
        status: ProcurementWebhookDeliveryStatus.FAILED,
        finalFailureAt: MoreThanOrEqual(thresholdWindowStart),
      },
    });

    const counts = new Map<number, number>();
    for (const failure of recentFailures) {
      counts.set(
        failure.subscriptionId,
        (counts.get(failure.subscriptionId) ?? 0) + 1,
      );
    }

    return counts;
  }

  private async getReplayTerminalFailureCandidates(
    dto: ReplayTerminalProcurementWebhookDeliveriesDto = {},
  ): Promise<{
    requestedCount: number;
    pageSize: number;
    appliedCursor: string | null;
    cursorMatchedTerminalFailureCount: number;
    replaySignature: ReplayTerminalFailureExecutionSignature;
    pagedDeliveries: ProcurementWebhookDelivery[];
    totalMatchedTerminalFailureCount: number;
  }> {
    const limit = Math.min(Math.max(dto.limit ?? 25, 1), 100);
    const explicitIds = dto.deliveryIds?.length
      ? Array.from(new Set(dto.deliveryIds))
      : null;
    const cursor = this.parseReplayTerminalFailurePreviewCursor(dto.cursor);
    const deliveries = await this.deliveriesRepository.find({
      where: {
        status: ProcurementWebhookDeliveryStatus.FAILED,
        ...(explicitIds ? { id: In(explicitIds) } : {}),
        ...(dto.subscriptionId != null
          ? { subscriptionId: dto.subscriptionId }
          : {}),
        ...(dto.eventType ? { eventType: dto.eventType } : {}),
      },
      relations: { subscription: true },
      order: { finalFailureAt: 'DESC', id: 'DESC' },
    });
    const terminalFailureDeliveries = deliveries
      .filter((delivery) => delivery.finalFailureAt != null)
      .sort((left, right) => {
        const leftTime = left.finalFailureAt?.getTime() ?? 0;
        const rightTime = right.finalFailureAt?.getTime() ?? 0;
        if (rightTime !== leftTime) {
          return rightTime - leftTime;
        }
        return right.id - left.id;
      });
    const pagedDeliveries = cursor
      ? terminalFailureDeliveries.filter((delivery) => {
          const finalFailureAtMs = delivery.finalFailureAt?.getTime() ?? 0;
          if (finalFailureAtMs < cursor.finalFailureAtMs) {
            return true;
          }
          if (finalFailureAtMs > cursor.finalFailureAtMs) {
            return false;
          }
          return delivery.id < cursor.id;
        })
      : terminalFailureDeliveries;
    const replaySignature = this.buildReplayTerminalFailureExecutionSignature(
      dto,
      limit,
      terminalFailureDeliveries.length,
      pagedDeliveries.length,
    );

    return {
      requestedCount: explicitIds?.length ?? limit,
      pageSize: limit,
      appliedCursor: dto.cursor ?? null,
      cursorMatchedTerminalFailureCount: pagedDeliveries.length,
      replaySignature,
      pagedDeliveries: pagedDeliveries.slice(0, limit),
      totalMatchedTerminalFailureCount: terminalFailureDeliveries.length,
    };
  }

  private buildReplayTerminalFailurePreview(
    deliveries: ProcurementWebhookDelivery[],
    options: {
      requestedCount?: number;
      pageSize?: number;
      appliedCursor?: string | null;
      cursorMatchedTerminalFailureCount?: number;
      replaySignature?: ReplayTerminalFailureExecutionSignature;
      totalMatchedTerminalFailureCount?: number;
    } = {},
  ): ProcurementWebhookBulkReplayPreviewResponseDto {
    const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100);
    const sortedDeliveries = deliveries
      .filter((delivery) => delivery.finalFailureAt != null)
      .slice()
      .sort((left, right) => {
        const leftTime = left.finalFailureAt?.getTime() ?? 0;
        const rightTime = right.finalFailureAt?.getTime() ?? 0;
        if (rightTime !== leftTime) {
          return rightTime - leftTime;
        }
        return right.id - left.id;
      });
    const candidateDeliveries: ProcurementWebhookDeliveryResponseDto[] = [];
    const skippedDeliveryIds: number[] = [];

    for (const delivery of sortedDeliveries.slice(0, pageSize)) {
      if (!delivery.subscription) {
        skippedDeliveryIds.push(delivery.id);
        continue;
      }

      candidateDeliveries.push(
        this.mapDeliveryResponse(delivery, delivery.subscription.name ?? null),
      );
    }

    const totalMatchedTerminalFailureCount = Math.max(
      options.totalMatchedTerminalFailureCount ?? sortedDeliveries.length,
      sortedDeliveries.length,
    );
    const cursorMatchedTerminalFailureCount = Math.max(
      options.cursorMatchedTerminalFailureCount ?? sortedDeliveries.length,
      sortedDeliveries.length,
    );
    const remainingMatchedTerminalFailureCount = Math.max(
      cursorMatchedTerminalFailureCount -
        sortedDeliveries.slice(0, pageSize).length,
      0,
    );
    const hasMoreMatchedDeliveries = remainingMatchedTerminalFailureCount > 0;
    const currentPageDeliveries = sortedDeliveries.slice(0, pageSize);
    const lastMatchedDelivery =
      currentPageDeliveries[currentPageDeliveries.length - 1] ?? null;

    return {
      requestedCount: options.requestedCount ?? pageSize,
      pageSize,
      appliedCursor: options.appliedCursor ?? null,
      totalMatchedTerminalFailureCount,
      previewedCount: candidateDeliveries.length,
      skippedCount: skippedDeliveryIds.length,
      skippedDeliveryIds,
      remainingMatchedTerminalFailureCount,
      hasMoreMatchedDeliveries,
      nextCursor:
        hasMoreMatchedDeliveries && lastMatchedDelivery
          ? this.encodeReplayTerminalFailurePreviewCursor(lastMatchedDelivery)
          : null,
      executionConfirmationToken:
        sortedDeliveries.length > 0 && options.replaySignature
          ? this.encodeReplayTerminalFailureExecutionConfirmationToken(
              options.replaySignature,
            )
          : null,
      executionConfirmationExpiresAt:
        sortedDeliveries.length > 0 && options.replaySignature
          ? new Date(
              Date.now() +
                ProcurementWebhooksService.REPLAY_PREVIEW_CONFIRMATION_TTL_MINUTES *
                  60 *
                  1000,
            ).toISOString()
          : null,
      candidateDeliveries,
    };
  }

  private assertReplayTerminalFailureExecutionAllowed(
    dto: ReplayTerminalProcurementWebhookDeliveriesDto,
    replaySignature: ReplayTerminalFailureExecutionSignature,
    totalMatchedTerminalFailureCount: number,
  ): ReplayExecutionGovernance {
    if (
      totalMatchedTerminalFailureCount <=
        ProcurementWebhooksService.SUBSCRIPTION_DETAIL_REPLAY_RECOMMENDED_LIMIT ||
      (dto.deliveryIds?.length ?? 0) > 0
    ) {
      return {
        replayScope:
          ProcurementWebhookReplayOperationScope.BULK_TERMINAL_FAILURES,
        replayExecutionMode: dto.deliveryIds?.length
          ? ProcurementWebhookReplayExecutionMode.EXPLICIT_DELIVERY_IDS
          : ProcurementWebhookReplayExecutionMode.FILTERED_PAGE,
        previewConfirmed: false,
        previewCursor: dto.cursor ?? null,
        previewMatchedTerminalFailureCount:
          replaySignature.cursorMatchedTerminalFailureCount,
        previewConfirmationIssuedAt: null,
        previewConfirmationExpiresAt: null,
      };
    }

    if (!dto.previewConfirmationToken) {
      throw new BadRequestException({
        code: 'PROCUREMENT_WEBHOOK_REPLAY_REQUIRES_PREVIEW_CONFIRMATION',
        message:
          'High-volume procurement webhook replay requires explicit delivery IDs or a confirmed replay preview page.',
        totalMatchedTerminalFailureCount,
        recommendedReplayLimit:
          ProcurementWebhooksService.SUBSCRIPTION_DETAIL_REPLAY_RECOMMENDED_LIMIT,
      });
    }

    const confirmationPayload =
      this.parseReplayTerminalFailureExecutionConfirmationToken(
        dto.previewConfirmationToken,
      );

    if (confirmationPayload.expiresAtMs < Date.now()) {
      throw new BadRequestException({
        code: 'PROCUREMENT_WEBHOOK_REPLAY_PREVIEW_CONFIRMATION_EXPIRED',
        message:
          'Replay preview confirmation token has expired. Generate a fresh preview before executing replay.',
        totalMatchedTerminalFailureCount,
        recommendedReplayLimit:
          ProcurementWebhooksService.SUBSCRIPTION_DETAIL_REPLAY_RECOMMENDED_LIMIT,
        previewConfirmationExpiresAt: new Date(
          confirmationPayload.expiresAtMs,
        ).toISOString(),
      });
    }

    if (
      JSON.stringify(confirmationPayload.signature) !==
      JSON.stringify(replaySignature)
    ) {
      throw new BadRequestException({
        code: 'PROCUREMENT_WEBHOOK_REPLAY_PREVIEW_CONFIRMATION_MISMATCH',
        message:
          'Replay preview confirmation token does not match the requested replay page.',
        totalMatchedTerminalFailureCount,
        recommendedReplayLimit:
          ProcurementWebhooksService.SUBSCRIPTION_DETAIL_REPLAY_RECOMMENDED_LIMIT,
      });
    }

    return {
      replayScope:
        ProcurementWebhookReplayOperationScope.BULK_TERMINAL_FAILURES,
      replayExecutionMode:
        ProcurementWebhookReplayExecutionMode.PREVIEW_CONFIRMED_PAGE,
      previewConfirmed: true,
      previewCursor: dto.cursor ?? null,
      previewMatchedTerminalFailureCount:
        replaySignature.cursorMatchedTerminalFailureCount,
      previewConfirmationIssuedAt: new Date(
        confirmationPayload.issuedAtMs,
      ).toISOString(),
      previewConfirmationExpiresAt: new Date(
        confirmationPayload.expiresAtMs,
      ).toISOString(),
    };
  }

  private encodeReplayTerminalFailurePreviewCursor(
    delivery: ProcurementWebhookDelivery,
  ): string {
    return Buffer.from(
      JSON.stringify({
        finalFailureAtMs: delivery.finalFailureAt?.getTime() ?? 0,
        id: delivery.id,
      }),
      'utf8',
    ).toString('base64');
  }

  private parseReplayTerminalFailurePreviewCursor(
    cursor?: string,
  ): { finalFailureAtMs: number; id: number } | null {
    if (!cursor) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as { finalFailureAtMs?: unknown; id?: unknown };

      if (
        !Number.isFinite(parsed.finalFailureAtMs) ||
        !Number.isInteger(parsed.id) ||
        Number(parsed.id) <= 0
      ) {
        throw new Error('invalid');
      }

      return {
        finalFailureAtMs: Number(parsed.finalFailureAtMs),
        id: Number(parsed.id),
      };
    } catch {
      throw new BadRequestException(
        'Invalid procurement webhook replay preview cursor',
      );
    }
  }

  private parseProcurementWebhookAuditCursor(
    cursor?: string,
  ): { createdAt: string; id: number } | null {
    if (!cursor) {
      return null;
    }

    try {
      const [createdAt, idValue, extra] = Buffer.from(cursor, 'base64url')
        .toString('utf8')
        .split('|');

      const id = Number(idValue);
      const createdAtMs = createdAt ? new Date(createdAt).getTime() : NaN;

      if (
        !createdAt ||
        extra != null ||
        Number.isNaN(createdAtMs) ||
        !Number.isInteger(id) ||
        id <= 0
      ) {
        throw new Error('invalid');
      }

      return { createdAt, id };
    } catch {
      throw new BadRequestException(
        'Invalid procurement webhook replay operations cursor',
      );
    }
  }

  private assertProcurementWebhookAuditDateRange(
    from?: string,
    to?: string,
  ): void {
    if (!from || !to) {
      return;
    }

    if (new Date(from).getTime() > new Date(to).getTime()) {
      throw new BadRequestException(
        'Procurement webhook audit filters require from to be earlier than or equal to to',
      );
    }
  }

  private buildReplayTerminalFailureExecutionSignature(
    dto: ReplayTerminalProcurementWebhookDeliveriesDto,
    normalizedLimit: number,
    totalMatchedTerminalFailureCount: number,
    cursorMatchedTerminalFailureCount: number,
  ): ReplayTerminalFailureExecutionSignature {
    return {
      deliveryIds: dto.deliveryIds?.length
        ? Array.from(new Set(dto.deliveryIds)).sort(
            (left, right) => left - right,
          )
        : null,
      subscriptionId: dto.subscriptionId ?? null,
      eventType: dto.eventType ?? null,
      cursor: dto.cursor ?? null,
      limit: normalizedLimit,
      totalMatchedTerminalFailureCount,
      cursorMatchedTerminalFailureCount,
    };
  }

  private encodeReplayTerminalFailureExecutionConfirmationToken(
    signature: ReplayTerminalFailureExecutionSignature,
  ): string {
    const issuedAtMs = Date.now();
    const payload = Buffer.from(
      JSON.stringify({
        signature,
        issuedAtMs,
        expiresAtMs:
          issuedAtMs +
          ProcurementWebhooksService.REPLAY_PREVIEW_CONFIRMATION_TTL_MINUTES *
            60 *
            1000,
      } satisfies ReplayTerminalFailureExecutionConfirmationPayload),
      'utf8',
    ).toString('base64url');
    const signatureHash = createHmac(
      'sha256',
      this.getReplayTerminalFailureExecutionConfirmationSecret(),
    )
      .update(payload)
      .digest('base64url');

    return `${payload}.${signatureHash}`;
  }

  private parseReplayTerminalFailureExecutionConfirmationToken(
    token: string,
  ): ReplayTerminalFailureExecutionConfirmationPayload {
    try {
      const [payload, providedSignature] = token.split('.', 2);
      if (!payload || !providedSignature) {
        throw new Error('invalid');
      }

      const expectedSignature = createHmac(
        'sha256',
        this.getReplayTerminalFailureExecutionConfirmationSecret(),
      )
        .update(payload)
        .digest('base64url');
      const providedBuffer = Buffer.from(providedSignature, 'utf8');
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      if (
        providedBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(providedBuffer, expectedBuffer)
      ) {
        throw new Error('invalid-signature');
      }

      const parsed = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as ReplayTerminalFailureExecutionConfirmationPayload;

      if (
        !parsed ||
        !parsed.signature ||
        !(
          parsed.signature.deliveryIds == null ||
          Array.isArray(parsed.signature.deliveryIds)
        ) ||
        !Number.isInteger(parsed.signature.limit) ||
        parsed.signature.limit <= 0 ||
        !Number.isFinite(parsed.issuedAtMs) ||
        !Number.isFinite(parsed.expiresAtMs)
      ) {
        throw new Error('invalid');
      }

      return {
        signature: {
          deliveryIds:
            parsed.signature.deliveryIds?.map((value) => Number(value)) ?? null,
          subscriptionId:
            parsed.signature.subscriptionId == null
              ? null
              : Number(parsed.signature.subscriptionId),
          eventType: parsed.signature.eventType ?? null,
          cursor: parsed.signature.cursor ?? null,
          limit: Number(parsed.signature.limit),
          totalMatchedTerminalFailureCount: Number(
            parsed.signature.totalMatchedTerminalFailureCount ?? 0,
          ),
          cursorMatchedTerminalFailureCount: Number(
            parsed.signature.cursorMatchedTerminalFailureCount ?? 0,
          ),
        },
        issuedAtMs: Number(parsed.issuedAtMs),
        expiresAtMs: Number(parsed.expiresAtMs),
      };
    } catch {
      throw new BadRequestException(
        'Invalid procurement webhook replay preview confirmation token',
      );
    }
  }

  private getReplayTerminalFailureExecutionConfirmationSecret(): string {
    return (
      process.env.PROCUREMENT_WEBHOOK_REPLAY_CONFIRMATION_SECRET ||
      process.env.JWT_SECRET ||
      ProcurementWebhooksService.REPLAY_PREVIEW_CONFIRMATION_SECRET_FALLBACK
    );
  }

  private buildResumeRiskSnapshot(
    recentTerminalFailureCount: number,
    forceResumeApplied: boolean,
  ): ProcurementWebhookSubscriptionResumeRiskResponseDto {
    let severity = ProcurementWebhookResumeRiskSeverity.LOW;
    if (
      recentTerminalFailureCount >=
      ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD
    ) {
      severity = ProcurementWebhookResumeRiskSeverity.FORCE_RESUME_REQUIRED;
    } else if (recentTerminalFailureCount > 0) {
      severity = ProcurementWebhookResumeRiskSeverity.WATCH;
    }

    return {
      evaluatedAt: new Date().toISOString(),
      recentTerminalFailureCount,
      threshold:
        ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD,
      thresholdWindowHours:
        ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS,
      forceResumeRequired:
        recentTerminalFailureCount >=
        ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD,
      forceResumeApplied,
      severity,
    };
  }

  private getResumeRiskSeverityRank(
    severity: ProcurementWebhookResumeRiskSeverity,
  ): number {
    switch (severity) {
      case ProcurementWebhookResumeRiskSeverity.FORCE_RESUME_REQUIRED:
        return 3;
      case ProcurementWebhookResumeRiskSeverity.WATCH:
        return 2;
      case ProcurementWebhookResumeRiskSeverity.LOW:
      default:
        return 1;
    }
  }

  private getTrendDirection(
    delta: number,
  ): ProcurementWebhookHealthTrendDirection {
    if (delta > 0) {
      return ProcurementWebhookHealthTrendDirection.UP;
    }

    if (delta < 0) {
      return ProcurementWebhookHealthTrendDirection.DOWN;
    }

    return ProcurementWebhookHealthTrendDirection.FLAT;
  }

  private buildSubscriptionRoute(subscriptionId: number): string {
    return `${ProcurementWebhooksService.ADMIN_WEBHOOKS_ROUTE}?subscriptionId=${subscriptionId}`;
  }

  private buildSubscriptionTerminalFailuresRoute(
    subscriptionId: number,
  ): string {
    return (
      `${ProcurementWebhooksService.ADMIN_WEBHOOKS_ROUTE}/deliveries` +
      `?subscriptionId=${subscriptionId}&retryState=${ProcurementWebhookDeliveryRetryState.TERMINAL_FAILURE}`
    );
  }

  private buildSubscriptionReplayOperationsRoute(
    subscriptionId: number,
    filters: {
      previewConfirmed?: boolean;
      replayScope?: ProcurementWebhookReplayOperationScope;
    } = {},
  ): string {
    const params = new URLSearchParams({
      subscriptionId: String(subscriptionId),
    });

    if (filters.replayScope) {
      params.set('replayScope', filters.replayScope);
    }

    if (typeof filters.previewConfirmed === 'boolean') {
      params.set('previewConfirmed', String(filters.previewConfirmed));
    }

    return `${ProcurementWebhooksService.ADMIN_WEBHOOKS_ROUTE}/replay-operations?${params.toString()}`;
  }

  private buildSubscriptionReplayOperationsExportRoute(
    subscriptionId: number,
  ): string {
    return `${ProcurementWebhooksService.ADMIN_WEBHOOKS_ROUTE}/replay-operations/export?subscriptionId=${subscriptionId}`;
  }

  private buildSubscriptionReplayOperationsSummaryRoute(
    subscriptionId: number,
  ): string {
    return `${ProcurementWebhooksService.ADMIN_WEBHOOKS_ROUTE}/replay-operations/summary?subscriptionId=${subscriptionId}`;
  }

  private buildSubscriptionReplayOperationsSummaryExportRoute(
    subscriptionId: number,
  ): string {
    return `${ProcurementWebhooksService.ADMIN_WEBHOOKS_ROUTE}/replay-operations/summary/export?subscriptionId=${subscriptionId}`;
  }

  private buildSubscriptionRemediationActionsRoute(
    subscriptionId: number,
    filters: {
      actionType?: ProcurementWebhookSubscriptionRemediationActionType;
      replayScope?: ProcurementWebhookReplayOperationScope;
      previewConfirmed?: boolean;
    } = {},
  ): string {
    const params = new URLSearchParams();

    if (filters.actionType) {
      params.set('actionType', filters.actionType);
    }

    if (filters.replayScope) {
      params.set('replayScope', filters.replayScope);
    }

    if (typeof filters.previewConfirmed === 'boolean') {
      params.set('previewConfirmed', String(filters.previewConfirmed));
    }

    const query = params.toString();
    return `${ProcurementWebhooksService.ADMIN_WEBHOOKS_ROUTE}/subscriptions/${subscriptionId}/remediation-actions${query ? `?${query}` : ''}`;
  }

  private buildReplayOperationAuditFilters(query: {
    actorEmail?: string;
    actorId?: number;
    from?: string;
    to?: string;
    replayExecutionMode?: ProcurementWebhookReplayExecutionMode;
    replayScope?: ProcurementWebhookReplayOperationScope;
    previewConfirmed?: boolean;
  }) {
    return {
      actions: ['procurement_webhook_subscription.replay_operation'],
      actorEmail: query.actorEmail,
      actorId: query.actorId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      metaEquals: {
        ...(query.replayExecutionMode
          ? { replayExecutionMode: query.replayExecutionMode }
          : {}),
        ...(query.replayScope ? { replayScope: query.replayScope } : {}),
        ...(typeof query.previewConfirmed === 'boolean'
          ? { previewConfirmed: query.previewConfirmed }
          : {}),
      },
    };
  }

  private mergeReplayOperationAuditFilters(
    filters: ReturnType<
      ProcurementWebhooksService['buildReplayOperationAuditFilters']
    >,
    overrides: {
      replayExecutionMode?: ProcurementWebhookReplayExecutionMode;
      replayScope?: ProcurementWebhookReplayOperationScope;
      previewConfirmed?: boolean;
    },
  ) {
    const existingMetaEquals = filters.metaEquals ?? {};
    return {
      ...filters,
      metaEquals: {
        ...existingMetaEquals,
        ...(overrides.replayExecutionMode
          ? { replayExecutionMode: overrides.replayExecutionMode }
          : {}),
        ...(overrides.replayScope
          ? { replayScope: overrides.replayScope }
          : {}),
        ...(typeof overrides.previewConfirmed === 'boolean'
          ? { previewConfirmed: overrides.previewConfirmed }
          : {}),
      },
    };
  }

  private async countReplayOperationAuditLogs(
    filters: ReturnType<
      ProcurementWebhooksService['buildReplayOperationAuditFilters']
    >,
    subscriptionId?: number,
  ): Promise<number> {
    const result = await this.auditService.listAllPaged({
      page: 1,
      limit: 1,
      targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
      targetId: subscriptionId,
      filters,
    });

    return result.total ?? 0;
  }

  private getSubscriptionRemediationActionAuditActions(
    query: ProcurementWebhookRemediationActionQueryDto,
  ): string[] {
    if (
      query.actionType ===
      ProcurementWebhookSubscriptionRemediationActionType.STATUS_UPDATE
    ) {
      return ['procurement_webhook_subscription.status.update'];
    }

    if (
      query.actionType ===
      ProcurementWebhookSubscriptionRemediationActionType.AUTO_PAUSED
    ) {
      return ['procurement_webhook_subscription.auto_paused'];
    }

    if (
      query.actionType ===
        ProcurementWebhookSubscriptionRemediationActionType.REPLAY_OPERATION ||
      query.replayExecutionMode ||
      query.replayScope ||
      typeof query.previewConfirmed === 'boolean'
    ) {
      return ['procurement_webhook_subscription.replay_operation'];
    }

    return [
      'procurement_webhook_subscription.replay_operation',
      'procurement_webhook_subscription.status.update',
      'procurement_webhook_subscription.auto_paused',
    ];
  }

  private async buildSubscriptionRemediationSummary(
    subscriptionId: number,
  ): Promise<ProcurementWebhookSubscriptionRemediationSummaryResponseDto> {
    const [
      totalCount,
      statusUpdateCount,
      autoPausedCount,
      replayOperationCount,
      previewConfirmedReplayCount,
      bulkTerminalFailureReplayCount,
      previewConfirmedBulkTerminalFailureReplayCount,
    ] = await Promise.all([
      this.countSubscriptionAuditLogs(subscriptionId, {
        actions: [
          'procurement_webhook_subscription.replay_operation',
          'procurement_webhook_subscription.status.update',
          'procurement_webhook_subscription.auto_paused',
        ],
      }),
      this.countSubscriptionAuditLogs(subscriptionId, {
        actions: ['procurement_webhook_subscription.status.update'],
      }),
      this.countSubscriptionAuditLogs(subscriptionId, {
        actions: ['procurement_webhook_subscription.auto_paused'],
      }),
      this.countSubscriptionAuditLogs(subscriptionId, {
        actions: ['procurement_webhook_subscription.replay_operation'],
      }),
      this.countSubscriptionAuditLogs(subscriptionId, {
        actions: ['procurement_webhook_subscription.replay_operation'],
        metaEquals: { previewConfirmed: true },
      }),
      this.countSubscriptionAuditLogs(subscriptionId, {
        actions: ['procurement_webhook_subscription.replay_operation'],
        metaEquals: {
          replayScope:
            ProcurementWebhookReplayOperationScope.BULK_TERMINAL_FAILURES,
        },
      }),
      this.countSubscriptionAuditLogs(subscriptionId, {
        actions: ['procurement_webhook_subscription.replay_operation'],
        metaEquals: {
          replayScope:
            ProcurementWebhookReplayOperationScope.BULK_TERMINAL_FAILURES,
          previewConfirmed: true,
        },
      }),
    ]);

    return {
      totalCount,
      statusUpdateCount,
      autoPausedCount,
      replayOperationCount,
      previewConfirmedReplayCount,
      bulkTerminalFailureReplayCount,
      previewConfirmedBulkTerminalFailureReplayCount,
    };
  }

  private async countSubscriptionAuditLogs(
    subscriptionId: number,
    filters: {
      actions: string[];
      metaEquals?: Record<string, string | number | boolean>;
    },
  ): Promise<number> {
    const result = await this.auditService.listForTargetPaged(
      'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
      subscriptionId,
      {
        page: 1,
        limit: 1,
        filters,
      },
    );

    return result.total ?? 0;
  }

  private mapAutoPausedSubscriptionLog(
    log: {
      targetId: number;
      createdAt: Date;
      meta?: Record<string, any> | null;
    },
    subscription?: ProcurementWebhookSubscription | null,
  ) {
    return {
      subscriptionId: log.targetId,
      subscriptionName: subscription?.name ?? `Subscription ${log.targetId}`,
      pausedAt: new Date(log.createdAt).toISOString(),
      triggerDeliveryId: Number(log.meta?.triggerDeliveryId ?? 0),
      terminalFailureCount: Number(log.meta?.terminalFailureCount ?? 0),
      threshold: Number(
        log.meta?.threshold ??
          ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_THRESHOLD,
      ),
      thresholdWindowHours: Number(
        log.meta?.thresholdWindowHours ??
          ProcurementWebhooksService.AUTO_PAUSE_TERMINAL_FAILURE_WINDOW_HOURS,
      ),
    };
  }

  private computeNextRetryAt(attemptCount: number): Date | null {
    if (attemptCount >= ProcurementWebhooksService.MAX_ATTEMPTS) {
      return null;
    }

    const backoffMinutes =
      ProcurementWebhooksService.RETRY_BACKOFF_MINUTES[attemptCount - 1] ??
      ProcurementWebhooksService.RETRY_BACKOFF_MINUTES[
        ProcurementWebhooksService.RETRY_BACKOFF_MINUTES.length - 1
      ];

    if (!backoffMinutes) {
      return null;
    }

    return new Date(Date.now() + backoffMinutes * 60 * 1000);
  }

  private stringifyResponseBody(body: unknown): string | null {
    if (body == null) {
      return null;
    }
    if (typeof body === 'string') {
      return body;
    }

    try {
      return JSON.stringify(body);
    } catch {
      return String(body);
    }
  }

  private mapSubscriptionResponse(
    subscription: ProcurementWebhookSubscription,
    resumeRiskPreview: ProcurementWebhookSubscriptionResumeRiskResponseDto | null = null,
  ): ProcurementWebhookSubscriptionResponseDto {
    return {
      id: subscription.id,
      name: subscription.name,
      endpointUrl: subscription.endpointUrl,
      signingSecretConfigured: Boolean(subscription.signingSecret),
      eventTypes: subscription.eventTypes ?? [],
      status: subscription.status,
      branchId: subscription.branchId ?? null,
      supplierProfileId: subscription.supplierProfileId ?? null,
      metadata: subscription.metadata ?? null,
      lastDeliveredAt: subscription.lastDeliveredAt ?? null,
      lastDeliveryStatus: subscription.lastDeliveryStatus ?? null,
      createdByUserId: subscription.createdByUserId ?? null,
      updatedByUserId: subscription.updatedByUserId ?? null,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      resumeRiskPreview,
    };
  }

  private mapSubscriptionStatusUpdateResponse(
    subscription: ProcurementWebhookSubscription,
    resumeRisk: ProcurementWebhookSubscriptionResumeRiskResponseDto | null,
  ): ProcurementWebhookSubscriptionStatusUpdateResponseDto {
    return {
      ...this.mapSubscriptionResponse(subscription, resumeRisk),
      resumeRisk,
    };
  }

  private mapDeliveryResponse(
    delivery: ProcurementWebhookDelivery,
    subscriptionNameOverride?: string | null,
  ): ProcurementWebhookDeliveryResponseDto {
    return {
      id: delivery.id,
      subscriptionId: delivery.subscriptionId,
      eventType: delivery.eventType,
      eventKey: delivery.eventKey,
      requestUrl: delivery.requestUrl,
      requestHeaders: delivery.requestHeaders,
      requestBody: delivery.requestBody,
      branchId: delivery.branchId ?? null,
      supplierProfileId: delivery.supplierProfileId ?? null,
      purchaseOrderId: delivery.purchaseOrderId ?? null,
      status: delivery.status,
      attemptCount: delivery.attemptCount,
      responseStatus: delivery.responseStatus ?? null,
      responseBody: delivery.responseBody ?? null,
      errorMessage: delivery.errorMessage ?? null,
      durationMs: delivery.durationMs ?? null,
      deliveredAt: delivery.deliveredAt ?? null,
      nextRetryAt: delivery.nextRetryAt ?? null,
      finalFailureAt: delivery.finalFailureAt ?? null,
      replayedFromDeliveryId: delivery.replayedFromDeliveryId ?? null,
      subscriptionName:
        subscriptionNameOverride ?? delivery.subscription?.name ?? null,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
    };
  }

  private mapFailureTimelineEntry(
    delivery: ProcurementWebhookDelivery,
    now = new Date(),
  ): ProcurementWebhookFailureTimelineEntryResponseDto {
    let state = ProcurementWebhookFailureTimelineState.RETRY_SCHEDULED;
    if (delivery.finalFailureAt != null) {
      state = ProcurementWebhookFailureTimelineState.TERMINAL_FAILURE;
    } else if (delivery.nextRetryAt != null && delivery.nextRetryAt <= now) {
      state = ProcurementWebhookFailureTimelineState.RETRY_ELIGIBLE;
    }

    return {
      deliveryId: delivery.id,
      eventType: delivery.eventType,
      state,
      attemptCount: delivery.attemptCount,
      occurredAt: (
        delivery.finalFailureAt ??
        delivery.deliveredAt ??
        delivery.createdAt
      ).toISOString(),
      nextRetryAt: delivery.nextRetryAt?.toISOString() ?? null,
      finalFailureAt: delivery.finalFailureAt?.toISOString() ?? null,
      errorMessage: delivery.errorMessage ?? null,
      responseStatus: delivery.responseStatus ?? null,
    };
  }

  private buildTerminalFailureReplayReadiness(
    deliveries: ProcurementWebhookDelivery[],
  ): ProcurementWebhookSubscriptionReplayReadinessResponseDto {
    const sortedDeliveries = deliveries
      .filter((delivery) => delivery.finalFailureAt != null)
      .slice()
      .sort(
        (left, right) =>
          (right.finalFailureAt?.getTime() ?? 0) -
          (left.finalFailureAt?.getTime() ?? 0),
      );
    const latestTerminalFailureAt =
      sortedDeliveries[0]?.finalFailureAt?.toISOString() ?? null;
    const oldestTerminalFailureAt =
      sortedDeliveries[
        sortedDeliveries.length - 1
      ]?.finalFailureAt?.toISOString() ?? null;
    const recommendedReplayLimit = Math.min(
      sortedDeliveries.length,
      ProcurementWebhooksService.SUBSCRIPTION_DETAIL_REPLAY_RECOMMENDED_LIMIT,
    );
    let status = ProcurementWebhookReplayReadinessStatus.READY;
    if (sortedDeliveries.length === 0) {
      status = ProcurementWebhookReplayReadinessStatus.EMPTY;
    } else if (
      sortedDeliveries.length >
      ProcurementWebhooksService.SUBSCRIPTION_DETAIL_REPLAY_RECOMMENDED_LIMIT
    ) {
      status = ProcurementWebhookReplayReadinessStatus.HIGH_VOLUME;
    }

    return {
      status,
      eligibleTerminalFailureCount: sortedDeliveries.length,
      latestTerminalFailureAt,
      oldestTerminalFailureAt,
      recommendedReplayLimit,
      terminalFailureEventTypeCounts: Object.values(ProcurementWebhookEventType)
        .map((eventType) => ({
          eventType,
          count: sortedDeliveries.filter(
            (delivery) => delivery.eventType === eventType,
          ).length,
        }))
        .filter((entry) => entry.count > 0),
    };
  }

  private buildSubscriptionDeliveryMix(
    deliveries: ProcurementWebhookDelivery[],
  ): ProcurementWebhookSubscriptionDeliveryMixResponseDto {
    const recentDeliveryCount = deliveries.length;
    const recentSucceededCount = deliveries.filter(
      (delivery) =>
        delivery.status === ProcurementWebhookDeliveryStatus.SUCCEEDED,
    ).length;
    const recentFailedCount = deliveries.filter(
      (delivery) => delivery.status === ProcurementWebhookDeliveryStatus.FAILED,
    ).length;
    const recentPendingCount = deliveries.filter(
      (delivery) =>
        delivery.status === ProcurementWebhookDeliveryStatus.PENDING,
    ).length;
    const recentTerminalFailureCount = deliveries.filter(
      (delivery) =>
        delivery.status === ProcurementWebhookDeliveryStatus.FAILED &&
        delivery.finalFailureAt != null,
    ).length;

    return {
      recentDeliveryCount,
      recentSucceededCount,
      recentFailedCount,
      recentPendingCount,
      recentTerminalFailureCount,
      recentSuccessRate:
        recentDeliveryCount > 0
          ? Number(
              ((recentSucceededCount / recentDeliveryCount) * 100).toFixed(2),
            )
          : 0,
    };
  }

  private mapRemediationAction(log: {
    action: string;
    createdAt: Date;
    actorId?: number | null;
    actorEmail?: string | null;
    reason?: string | null;
    meta?: Record<string, any> | null;
  }): ProcurementWebhookSubscriptionRemediationActionResponseDto {
    const status =
      typeof log.meta?.status === 'string' ? log.meta.status : null;
    const forceResume =
      typeof log.meta?.forceResume === 'boolean' ? log.meta.forceResume : null;
    const triggerDeliveryId = Number.isFinite(log.meta?.triggerDeliveryId)
      ? Number(log.meta?.triggerDeliveryId)
      : null;
    const terminalFailureCount = Number.isFinite(log.meta?.terminalFailureCount)
      ? Number(log.meta?.terminalFailureCount)
      : null;
    const deliveryId = Number.isFinite(log.meta?.deliveryId)
      ? Number(log.meta?.deliveryId)
      : null;
    const requestedCount = Number.isFinite(log.meta?.requestedCount)
      ? Number(log.meta?.requestedCount)
      : null;
    const matchedTerminalFailureCount = Number.isFinite(
      log.meta?.matchedTerminalFailureCount,
    )
      ? Number(log.meta?.matchedTerminalFailureCount)
      : null;
    const replayedCount = Number.isFinite(log.meta?.replayedCount)
      ? Number(log.meta?.replayedCount)
      : null;
    const skippedCount = Number.isFinite(log.meta?.skippedCount)
      ? Number(log.meta?.skippedCount)
      : null;
    const replayScope = Object.values(
      ProcurementWebhookReplayOperationScope,
    ).includes(log.meta?.replayScope as ProcurementWebhookReplayOperationScope)
      ? (log.meta?.replayScope as ProcurementWebhookReplayOperationScope)
      : null;
    const replayExecutionMode = Object.values(
      ProcurementWebhookReplayExecutionMode,
    ).includes(
      log.meta?.replayExecutionMode as ProcurementWebhookReplayExecutionMode,
    )
      ? (log.meta?.replayExecutionMode as ProcurementWebhookReplayExecutionMode)
      : null;
    const previewConfirmed =
      typeof log.meta?.previewConfirmed === 'boolean'
        ? log.meta.previewConfirmed
        : null;
    const previewCursor =
      typeof log.meta?.previewCursor === 'string'
        ? log.meta.previewCursor
        : null;
    const previewMatchedTerminalFailureCount = Number.isFinite(
      log.meta?.previewMatchedTerminalFailureCount,
    )
      ? Number(log.meta?.previewMatchedTerminalFailureCount)
      : null;
    const previewConfirmationIssuedAt =
      typeof log.meta?.previewConfirmationIssuedAt === 'string'
        ? log.meta.previewConfirmationIssuedAt
        : null;
    const previewConfirmationExpiresAt =
      typeof log.meta?.previewConfirmationExpiresAt === 'string'
        ? log.meta.previewConfirmationExpiresAt
        : null;

    let summary = 'Recorded remediation action';
    if (log.action === 'procurement_webhook_subscription.status.update') {
      if (
        status === ProcurementWebhookSubscriptionStatus.ACTIVE &&
        forceResume
      ) {
        summary = 'Force resumed subscription';
      } else if (status === ProcurementWebhookSubscriptionStatus.ACTIVE) {
        summary = 'Resumed subscription';
      } else if (status === ProcurementWebhookSubscriptionStatus.PAUSED) {
        summary = 'Paused subscription';
      } else {
        summary = 'Updated subscription status';
      }
    } else if (
      log.action.startsWith('procurement_webhook_subscription.auto_paused')
    ) {
      summary = 'Auto-paused after repeated terminal failures';
    } else if (
      log.action === 'procurement_webhook_subscription.replay_operation'
    ) {
      if (
        replayScope === ProcurementWebhookReplayOperationScope.SINGLE_DELIVERY
      ) {
        summary = 'Replayed a delivery manually';
      } else if (
        replayExecutionMode ===
        ProcurementWebhookReplayExecutionMode.PREVIEW_CONFIRMED_PAGE
      ) {
        summary = 'Bulk replayed a preview-confirmed terminal failure page';
      } else if (
        replayExecutionMode ===
        ProcurementWebhookReplayExecutionMode.EXPLICIT_DELIVERY_IDS
      ) {
        summary = 'Bulk replayed explicit terminal failure deliveries';
      } else {
        summary = 'Bulk replayed terminal failures';
      }
    }

    return {
      action: log.action,
      summary,
      createdAt: new Date(log.createdAt).toISOString(),
      actorId: log.actorId ?? null,
      actorEmail: log.actorEmail ?? null,
      reason: log.reason ?? null,
      note: log.reason ?? null,
      status,
      forceResume,
      triggerDeliveryId,
      terminalFailureCount,
      deliveryId,
      requestedCount,
      matchedTerminalFailureCount,
      replayedCount,
      skippedCount,
      replayScope,
      replayExecutionMode,
      previewConfirmed,
      previewCursor,
      previewMatchedTerminalFailureCount,
      previewConfirmationIssuedAt,
      previewConfirmationExpiresAt,
    };
  }

  private async assertSubscriptionTargets(
    branchId?: number | null,
    supplierProfileId?: number | null,
  ): Promise<void> {
    if (branchId != null) {
      const branch = await this.branchesRepository.findOne({
        where: { id: branchId },
      });
      if (!branch) {
        throw new NotFoundException(`Branch with ID ${branchId} not found`);
      }
    }

    if (supplierProfileId != null) {
      const supplier = await this.suppliersRepository.findOne({
        where: { id: supplierProfileId },
      });
      if (!supplier) {
        throw new NotFoundException(
          `Supplier profile with ID ${supplierProfileId} not found`,
        );
      }
    }
  }
}
