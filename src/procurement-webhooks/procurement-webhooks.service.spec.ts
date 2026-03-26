import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { createHmac } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/roles.enum';
import { Branch } from '../branches/entities/branch.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import { ProcurementWebhooksCronService } from './procurement-webhooks-cron.service';
import { ProcurementWebhookDeliveryRetryState } from './dto/procurement-webhook-delivery-query.dto';
import { ProcurementWebhooksService } from './procurement-webhooks.service';
import {
  ProcurementWebhookFailureTimelineState,
  ProcurementWebhookSubscriptionRemediationActionType,
  ProcurementWebhookHealthTrendDirection,
  ProcurementWebhookReplayReadinessStatus,
  ProcurementWebhookResumeRiskSeverity,
} from './dto/procurement-webhook-response.dto';
import {
  ProcurementWebhookDelivery,
  ProcurementWebhookDeliveryStatus,
} from './entities/procurement-webhook-delivery.entity';
import {
  ProcurementWebhookEventType,
  ProcurementWebhookSubscription,
  ProcurementWebhookSubscriptionStatus,
} from './entities/procurement-webhook-subscription.entity';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('ProcurementWebhooksService', () => {
  let service: ProcurementWebhooksService;
  let branchesRepository: { findOne: jest.Mock };
  let suppliersRepository: { findOne: jest.Mock };
  let subscriptionsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let deliveriesRepository: {
    create: jest.Mock;
    count: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let notificationsService: { broadcastToRole: jest.Mock };
  let deliveriesQueryBuilder: {
    leftJoinAndSelect: jest.Mock;
    orderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    andWhere: jest.Mock;
    getManyAndCount: jest.Mock;
  };

  beforeEach(async () => {
    branchesRepository = {
      findOne: jest.fn(),
    };
    suppliersRepository = {
      findOne: jest.fn(),
    };
    subscriptionsRepository = {
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    deliveriesRepository = {
      create: jest.fn((value: any) => value),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(async (value: any) => ({ id: 1, ...value })),
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    deliveriesQueryBuilder = {
      leftJoinAndSelect: jest.fn(),
      orderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      andWhere: jest.fn(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    deliveriesQueryBuilder.leftJoinAndSelect.mockReturnValue(
      deliveriesQueryBuilder,
    );
    deliveriesQueryBuilder.orderBy.mockReturnValue(deliveriesQueryBuilder);
    deliveriesQueryBuilder.skip.mockReturnValue(deliveriesQueryBuilder);
    deliveriesQueryBuilder.take.mockReturnValue(deliveriesQueryBuilder);
    deliveriesQueryBuilder.andWhere.mockReturnValue(deliveriesQueryBuilder);
    deliveriesRepository.createQueryBuilder.mockReturnValue(
      deliveriesQueryBuilder,
    );
    auditService = {
      log: jest.fn(),
      listForTargetPaged: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
      }),
      listForTargetCursor: jest.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
      }),
      listForTargets: jest.fn().mockResolvedValue([]),
      listAllPaged: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
      }),
      listAllCursor: jest.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
      }),
    } as any;
    notificationsService = {
      broadcastToRole: jest
        .fn()
        .mockResolvedValue({ success: true, queued: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementWebhooksService,
        {
          provide: getRepositoryToken(ProcurementWebhookSubscription),
          useValue: subscriptionsRepository,
        },
        {
          provide: getRepositoryToken(ProcurementWebhookDelivery),
          useValue: deliveriesRepository,
        },
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        {
          provide: getRepositoryToken(SupplierProfile),
          useValue: suppliersRepository,
        },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(ProcurementWebhooksService);
    (axios.post as jest.Mock).mockReset();
  });

  it('delivers matching procurement events and records successful delivery logs', async () => {
    subscriptionsRepository.find.mockResolvedValue([
      {
        id: 10,
        name: 'ERP Feed',
        endpointUrl: 'https://partner.example.com/hooks/procurement',
        signingSecret: 'top-secret-key',
        eventTypes: [ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        branchId: 3,
        supplierProfileId: 7,
      },
      {
        id: 11,
        name: 'Paused',
        endpointUrl: 'https://partner.example.com/hooks/paused',
        signingSecret: 'other-secret',
        eventTypes: [ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        branchId: 99,
        supplierProfileId: 7,
      },
    ] as ProcurementWebhookSubscription[]);
    (axios.post as jest.Mock).mockResolvedValue({
      status: 202,
      data: { accepted: true },
    });

    await service.dispatchProcurementEvent({
      eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
      eventKey: 'po:55:status',
      branchId: 3,
      supplierProfileId: 7,
      purchaseOrderId: 55,
      payload: {
        purchaseOrderId: 55,
        currentStatus: 'SHIPPED',
      },
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      'https://partner.example.com/hooks/procurement',
      expect.objectContaining({ purchaseOrderId: 55 }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-suuq-event': ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
          'x-suuq-event-key': 'po:55:status',
          'x-suuq-signature': expect.stringMatching(/^sha256=/),
        }),
      }),
    );
    expect(deliveriesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 10,
        eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
        status: ProcurementWebhookDeliveryStatus.PENDING,
      }),
    );
    expect(subscriptionsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        lastDeliveryStatus: 'SUCCEEDED',
      }),
    );
  });

  it('schedules a retry with backoff when delivery fails', async () => {
    subscriptionsRepository.find.mockResolvedValue([
      {
        id: 10,
        name: 'ERP Feed',
        endpointUrl: 'https://partner.example.com/hooks/procurement',
        signingSecret: 'top-secret-key',
        eventTypes: [ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        branchId: 3,
        supplierProfileId: 7,
      },
    ] as ProcurementWebhookSubscription[]);
    (axios.post as jest.Mock).mockRejectedValue(new Error('timeout'));

    await service.dispatchProcurementEvent({
      eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
      eventKey: 'po:55:status',
      branchId: 3,
      supplierProfileId: 7,
      purchaseOrderId: 55,
      payload: {
        purchaseOrderId: 55,
      },
    });

    expect(deliveriesRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 1,
        errorMessage: 'timeout',
        nextRetryAt: expect.any(Date),
        finalFailureAt: null,
      }),
    );
    expect(notificationsService.broadcastToRole).not.toHaveBeenCalled();
  });

  it('returns sanitized subscription responses without exposing signing secrets', async () => {
    subscriptionsRepository.save.mockResolvedValue({
      id: 12,
      name: 'ERP Feed',
      endpointUrl: 'https://partner.example.com/hooks/procurement',
      signingSecret: 'top-secret-key',
      eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
      status: ProcurementWebhookSubscriptionStatus.ACTIVE,
      branchId: null,
      supplierProfileId: null,
      metadata: null,
      lastDeliveredAt: null,
      lastDeliveryStatus: null,
      createdByUserId: 4,
      updatedByUserId: 4,
      createdAt: new Date('2026-03-20T11:00:00.000Z'),
      updatedAt: new Date('2026-03-20T11:00:00.000Z'),
    });

    const result = await service.createSubscription(
      {
        name: 'ERP Feed',
        endpointUrl: 'https://partner.example.com/hooks/procurement',
        signingSecret: 'top-secret-key',
        eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
      },
      { id: 4, email: 'admin@example.com' },
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 12,
        name: 'ERP Feed',
        endpointUrl: 'https://partner.example.com/hooks/procurement',
        signingSecretConfigured: true,
      }),
    );
    expect(result).not.toHaveProperty('signingSecret');
  });

  it('returns operational detail for a single subscription', async () => {
    subscriptionsRepository.findOne.mockResolvedValue({
      id: 12,
      name: 'ERP Feed',
      endpointUrl: 'https://partner.example.com/hooks/procurement',
      signingSecret: 'top-secret-key',
      eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
      status: ProcurementWebhookSubscriptionStatus.PAUSED,
      branchId: null,
      supplierProfileId: null,
      metadata: null,
      lastDeliveredAt: new Date('2026-03-20T10:30:00.000Z'),
      lastDeliveryStatus: 'FAILED',
      createdByUserId: 4,
      updatedByUserId: 4,
      createdAt: new Date('2026-03-20T09:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:30:00.000Z'),
    });
    deliveriesRepository.count.mockResolvedValue(3);
    deliveriesRepository.find
      .mockResolvedValueOnce([
        {
          id: 90,
          subscriptionId: 12,
          subscription: { id: 12, name: 'ERP Feed' },
          eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
          eventKey: 'intervention:12:assign',
          requestUrl: 'https://partner.example.com/hooks/procurement',
          requestHeaders: {},
          requestBody: { assignment: true },
          status: ProcurementWebhookDeliveryStatus.FAILED,
          attemptCount: 4,
          errorMessage: 'partner timeout',
          responseStatus: 504,
          finalFailureAt: new Date('2026-03-20T10:30:00.000Z'),
          createdAt: new Date('2026-03-20T10:20:00.000Z'),
          updatedAt: new Date('2026-03-20T10:30:00.000Z'),
        },
        {
          id: 88,
          subscriptionId: 12,
          subscription: { id: 12, name: 'ERP Feed' },
          eventType: ProcurementWebhookEventType.RECEIPT_DISCREPANCY_APPROVED,
          eventKey: 'receipt:88',
          requestUrl: 'https://partner.example.com/hooks/procurement',
          requestHeaders: {},
          requestBody: { discrepancyId: 88 },
          status: ProcurementWebhookDeliveryStatus.FAILED,
          attemptCount: 2,
          nextRetryAt: new Date('2099-03-20T10:40:00.000Z'),
          createdAt: new Date('2026-03-20T10:35:00.000Z'),
          updatedAt: new Date('2026-03-20T10:35:00.000Z'),
        },
        {
          id: 89,
          subscriptionId: 12,
          subscription: { id: 12, name: 'ERP Feed' },
          eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
          eventKey: 'po:89:status',
          requestUrl: 'https://partner.example.com/hooks/procurement',
          requestHeaders: {},
          requestBody: { purchaseOrderId: 89 },
          status: ProcurementWebhookDeliveryStatus.SUCCEEDED,
          attemptCount: 1,
          deliveredAt: new Date('2026-03-20T09:50:00.000Z'),
          createdAt: new Date('2026-03-20T09:49:00.000Z'),
          updatedAt: new Date('2026-03-20T09:50:00.000Z'),
        },
      ] as ProcurementWebhookDelivery[])
      .mockResolvedValueOnce([
        {
          id: 90,
          subscriptionId: 12,
          subscription: { id: 12, name: 'ERP Feed' },
          eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
          eventKey: 'intervention:12:assign',
          requestUrl: 'https://partner.example.com/hooks/procurement',
          requestHeaders: {},
          requestBody: { assignment: true },
          status: ProcurementWebhookDeliveryStatus.FAILED,
          attemptCount: 4,
          errorMessage: 'partner timeout',
          responseStatus: 504,
          finalFailureAt: new Date('2026-03-20T10:30:00.000Z'),
          createdAt: new Date('2026-03-20T10:20:00.000Z'),
          updatedAt: new Date('2026-03-20T10:30:00.000Z'),
        },
        {
          id: 87,
          subscriptionId: 12,
          subscription: { id: 12, name: 'ERP Feed' },
          eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
          eventKey: 'po:87:terminal',
          requestUrl: 'https://partner.example.com/hooks/procurement',
          requestHeaders: {},
          requestBody: { purchaseOrderId: 87 },
          status: ProcurementWebhookDeliveryStatus.FAILED,
          attemptCount: 4,
          finalFailureAt: new Date('2026-03-19T08:00:00.000Z'),
          createdAt: new Date('2026-03-19T07:50:00.000Z'),
          updatedAt: new Date('2026-03-19T08:00:00.000Z'),
        },
      ] as ProcurementWebhookDelivery[]);
    (auditService as any).listForTarget = jest.fn().mockResolvedValue([
      {
        targetId: 12,
        action: 'procurement_webhook_subscription.replay_operation',
        actorId: 9,
        actorEmail: 'admin@example.com',
        reason: 'Partner endpoint fixed',
        meta: {
          replayScope: 'BULK_TERMINAL_FAILURES',
          replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
          requestedCount: 2,
          matchedTerminalFailureCount: 2,
          replayedCount: 2,
          skippedCount: 0,
          subscriptionId: 12,
          previewConfirmed: true,
          previewCursor: null,
          previewMatchedTerminalFailureCount: 2,
          previewConfirmationIssuedAt: '2026-03-20T10:42:00.000Z',
          previewConfirmationExpiresAt: '2026-03-20T11:12:00.000Z',
        },
        createdAt: new Date('2026-03-20T10:45:00.000Z'),
      },
      {
        targetId: 12,
        action: 'procurement_webhook_subscription.status.update',
        actorId: 7,
        actorEmail: 'ops@example.com',
        meta: {
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
          forceResume: true,
        },
        createdAt: new Date('2026-03-20T10:40:00.000Z'),
      },
      {
        targetId: 12,
        action: 'procurement_webhook_subscription.auto_paused',
        meta: {
          triggerDeliveryId: 90,
          terminalFailureCount: 3,
          threshold: 3,
          thresholdWindowHours: 24,
        },
        createdAt: new Date('2026-03-20T10:31:00.000Z'),
      },
    ]);
    (auditService as any).listForTargetPaged.mockImplementation(
      async (_targetType: string, _targetId: number, options: any) => {
        const actions = options?.filters?.actions ?? [];
        const metaEquals = options?.filters?.metaEquals ?? {};

        let total = 0;
        if (actions.length === 3) {
          total = 8;
        } else if (
          actions[0] === 'procurement_webhook_subscription.status.update'
        ) {
          total = 3;
        } else if (
          actions[0] === 'procurement_webhook_subscription.auto_paused'
        ) {
          total = 2;
        } else if (
          actions[0] === 'procurement_webhook_subscription.replay_operation'
        ) {
          if (
            metaEquals.replayScope === 'BULK_TERMINAL_FAILURES' &&
            metaEquals.previewConfirmed === true
          ) {
            total = 1;
          } else if (metaEquals.replayScope === 'BULK_TERMINAL_FAILURES') {
            total = 2;
          } else if (metaEquals.previewConfirmed === true) {
            total = 2;
          } else {
            total = 3;
          }
        }

        return {
          items: [],
          total,
          page: 1,
          perPage: 1,
          totalPages: total > 0 ? total : 0,
        };
      },
    );

    const result = await service.getSubscriptionDetail(12);

    expect(result).toEqual(
      expect.objectContaining({
        id: 12,
        name: 'ERP Feed',
        signingSecretConfigured: true,
        currentResumeRisk: expect.objectContaining({
          recentTerminalFailureCount: 3,
          forceResumeRequired: true,
          severity: ProcurementWebhookResumeRiskSeverity.FORCE_RESUME_REQUIRED,
        }),
        latestAutoPause: expect.objectContaining({
          subscriptionId: 12,
          triggerDeliveryId: 90,
          terminalFailureCount: 3,
        }),
        recentDeliveries: [
          expect.objectContaining({ id: 90 }),
          expect.objectContaining({ id: 88 }),
          expect.objectContaining({ id: 89 }),
        ],
        recentTerminalFailures: [expect.objectContaining({ id: 90 })],
        recentSuccessfulDeliveries: [expect.objectContaining({ id: 89 })],
        recentFailureTimeline: [
          expect.objectContaining({
            deliveryId: 88,
            state: ProcurementWebhookFailureTimelineState.RETRY_SCHEDULED,
          }),
          expect.objectContaining({
            deliveryId: 90,
            state: ProcurementWebhookFailureTimelineState.TERMINAL_FAILURE,
            errorMessage: 'partner timeout',
            responseStatus: 504,
          }),
        ],
        terminalFailureReplayReadiness: {
          status: ProcurementWebhookReplayReadinessStatus.READY,
          eligibleTerminalFailureCount: 2,
          latestTerminalFailureAt: '2026-03-20T10:30:00.000Z',
          oldestTerminalFailureAt: '2026-03-19T08:00:00.000Z',
          recommendedReplayLimit: 2,
          terminalFailureEventTypeCounts: [
            {
              eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
              count: 1,
            },
            {
              eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
              count: 1,
            },
          ],
        },
        terminalFailureReplayPreview: expect.objectContaining({
          requestedCount: 25,
          pageSize: 25,
          appliedCursor: null,
          totalMatchedTerminalFailureCount: 2,
          previewedCount: 2,
          skippedCount: 0,
          skippedDeliveryIds: [],
          remainingMatchedTerminalFailureCount: 0,
          hasMoreMatchedDeliveries: false,
          nextCursor: null,
          executionConfirmationToken: expect.any(String),
          executionConfirmationExpiresAt: expect.any(String),
          candidateDeliveries: [
            expect.objectContaining({ id: 90 }),
            expect.objectContaining({ id: 87 }),
          ],
        }),
        deliveryMix: {
          recentDeliveryCount: 3,
          recentSucceededCount: 1,
          recentFailedCount: 2,
          recentPendingCount: 0,
          recentTerminalFailureCount: 1,
          recentSuccessRate: 33.33,
        },
        remediationSummary: {
          totalCount: 8,
          statusUpdateCount: 3,
          autoPausedCount: 2,
          replayOperationCount: 3,
          previewConfirmedReplayCount: 2,
          bulkTerminalFailureReplayCount: 2,
          previewConfirmedBulkTerminalFailureReplayCount: 1,
        },
        hasReplayHistory: true,
        hasPreviewConfirmedReplayHistory: true,
        hasAutoPauseHistory: true,
        recentRemediationActions: [
          {
            action: 'procurement_webhook_subscription.replay_operation',
            summary: 'Bulk replayed a preview-confirmed terminal failure page',
            createdAt: '2026-03-20T10:45:00.000Z',
            actorId: 9,
            actorEmail: 'admin@example.com',
            reason: 'Partner endpoint fixed',
            note: 'Partner endpoint fixed',
            status: null,
            forceResume: null,
            triggerDeliveryId: null,
            terminalFailureCount: null,
            deliveryId: null,
            requestedCount: 2,
            matchedTerminalFailureCount: 2,
            replayedCount: 2,
            skippedCount: 0,
            replayScope: 'BULK_TERMINAL_FAILURES',
            replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
            previewConfirmed: true,
            previewCursor: null,
            previewMatchedTerminalFailureCount: 2,
            previewConfirmationIssuedAt: '2026-03-20T10:42:00.000Z',
            previewConfirmationExpiresAt: '2026-03-20T11:12:00.000Z',
          },
          {
            action: 'procurement_webhook_subscription.status.update',
            summary: 'Force resumed subscription',
            createdAt: '2026-03-20T10:40:00.000Z',
            actorId: 7,
            actorEmail: 'ops@example.com',
            reason: null,
            note: null,
            status: ProcurementWebhookSubscriptionStatus.ACTIVE,
            forceResume: true,
            triggerDeliveryId: null,
            terminalFailureCount: null,
            deliveryId: null,
            requestedCount: null,
            matchedTerminalFailureCount: null,
            replayedCount: null,
            skippedCount: null,
            replayScope: null,
            replayExecutionMode: null,
            previewConfirmed: null,
            previewCursor: null,
            previewMatchedTerminalFailureCount: null,
            previewConfirmationIssuedAt: null,
            previewConfirmationExpiresAt: null,
          },
          {
            action: 'procurement_webhook_subscription.auto_paused',
            summary: 'Auto-paused after repeated terminal failures',
            createdAt: '2026-03-20T10:31:00.000Z',
            actorId: null,
            actorEmail: null,
            reason: null,
            note: null,
            status: null,
            forceResume: null,
            triggerDeliveryId: 90,
            terminalFailureCount: 3,
            deliveryId: null,
            requestedCount: null,
            matchedTerminalFailureCount: null,
            replayedCount: null,
            skippedCount: null,
            replayScope: null,
            replayExecutionMode: null,
            previewConfirmed: null,
            previewCursor: null,
            previewMatchedTerminalFailureCount: null,
            previewConfirmationIssuedAt: null,
            previewConfirmationExpiresAt: null,
          },
        ],
        latestReplayOperation: expect.objectContaining({
          action: 'procurement_webhook_subscription.replay_operation',
          replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
          note: 'Partner endpoint fixed',
          replayedCount: 2,
        }),
        route: '/admin/b2b/procurement-webhooks?subscriptionId=12',
        terminalFailuresRoute:
          '/admin/b2b/procurement-webhooks/deliveries?subscriptionId=12&retryState=TERMINAL_FAILURE',
        statusUpdateRoute:
          '/admin/b2b/procurement-webhooks/subscriptions/12/status',
        replayTerminalFailuresRoute:
          '/admin/b2b/procurement-webhooks/deliveries/replay-terminal-failures?subscriptionId=12',
        replayTerminalFailuresPreviewRoute:
          '/admin/b2b/procurement-webhooks/deliveries/replay-terminal-failures/preview?subscriptionId=12',
        replayOperationsRoute:
          '/admin/b2b/procurement-webhooks/replay-operations?subscriptionId=12',
        replayOperationsExportRoute:
          '/admin/b2b/procurement-webhooks/replay-operations/export?subscriptionId=12',
        replayGovernanceSummaryRoute:
          '/admin/b2b/procurement-webhooks/replay-operations/summary?subscriptionId=12',
        replayGovernanceSummaryExportRoute:
          '/admin/b2b/procurement-webhooks/replay-operations/summary/export?subscriptionId=12',
        previewConfirmedReplayOperationsRoute:
          '/admin/b2b/procurement-webhooks/replay-operations?subscriptionId=12&previewConfirmed=true',
        bulkTerminalFailureReplayOperationsRoute:
          '/admin/b2b/procurement-webhooks/replay-operations?subscriptionId=12&replayScope=BULK_TERMINAL_FAILURES',
        previewConfirmedBulkTerminalFailureReplayOperationsRoute:
          '/admin/b2b/procurement-webhooks/replay-operations?subscriptionId=12&replayScope=BULK_TERMINAL_FAILURES&previewConfirmed=true',
        remediationActionsRoute:
          '/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions',
        replayRemediationActionsRoute:
          '/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions?actionType=REPLAY_OPERATION',
        previewConfirmedReplayRemediationActionsRoute:
          '/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions?actionType=REPLAY_OPERATION&previewConfirmed=true',
        statusRemediationActionsRoute:
          '/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions?actionType=STATUS_UPDATE',
        autoPausedRemediationActionsRoute:
          '/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions?actionType=AUTO_PAUSED',
        bulkTerminalFailureReplayRemediationActionsRoute:
          '/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions?actionType=REPLAY_OPERATION&replayScope=BULK_TERMINAL_FAILURES',
        previewConfirmedBulkTerminalFailureReplayRemediationActionsRoute:
          '/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions?actionType=REPLAY_OPERATION&replayScope=BULK_TERMINAL_FAILURES&previewConfirmed=true',
      }),
    );
  });

  it('marks replay readiness as empty when a subscription has no terminal failures', async () => {
    subscriptionsRepository.findOne.mockResolvedValue({
      id: 21,
      name: 'Healthy Feed',
      endpointUrl: 'https://partner.example.com/hooks/healthy',
      signingSecret: 'healthy-secret',
      eventTypes: [ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED],
      status: ProcurementWebhookSubscriptionStatus.ACTIVE,
      createdAt: new Date('2026-03-20T09:00:00.000Z'),
      updatedAt: new Date('2026-03-20T09:30:00.000Z'),
    });
    deliveriesRepository.count.mockResolvedValue(0);
    deliveriesRepository.find
      .mockResolvedValueOnce([
        {
          id: 210,
          subscriptionId: 21,
          subscription: { id: 21, name: 'Healthy Feed' },
          eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
          eventKey: 'po:210:status',
          requestUrl: 'https://partner.example.com/hooks/healthy',
          requestHeaders: {},
          requestBody: { purchaseOrderId: 210 },
          status: ProcurementWebhookDeliveryStatus.SUCCEEDED,
          attemptCount: 1,
          deliveredAt: new Date('2026-03-20T09:20:00.000Z'),
          createdAt: new Date('2026-03-20T09:19:00.000Z'),
          updatedAt: new Date('2026-03-20T09:20:00.000Z'),
        },
      ] as ProcurementWebhookDelivery[])
      .mockResolvedValueOnce([]);
    (auditService as any).listForTarget = jest.fn().mockResolvedValue([]);
    (auditService as any).listForTargetPaged.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      perPage: 1,
      totalPages: 0,
    });

    const result = await service.getSubscriptionDetail(21);

    expect(result.terminalFailureReplayReadiness).toEqual({
      status: ProcurementWebhookReplayReadinessStatus.EMPTY,
      eligibleTerminalFailureCount: 0,
      latestTerminalFailureAt: null,
      oldestTerminalFailureAt: null,
      recommendedReplayLimit: 0,
      terminalFailureEventTypeCounts: [],
    });
    expect(result.terminalFailureReplayPreview).toEqual({
      requestedCount: 25,
      pageSize: 25,
      appliedCursor: null,
      totalMatchedTerminalFailureCount: 0,
      previewedCount: 0,
      skippedCount: 0,
      skippedDeliveryIds: [],
      remainingMatchedTerminalFailureCount: 0,
      hasMoreMatchedDeliveries: false,
      nextCursor: null,
      executionConfirmationToken: null,
      executionConfirmationExpiresAt: null,
      candidateDeliveries: [],
    });
    expect(result.remediationSummary).toEqual({
      totalCount: 0,
      statusUpdateCount: 0,
      autoPausedCount: 0,
      replayOperationCount: 0,
      previewConfirmedReplayCount: 0,
      bulkTerminalFailureReplayCount: 0,
      previewConfirmedBulkTerminalFailureReplayCount: 0,
    });
    expect(result.hasReplayHistory).toBe(false);
    expect(result.hasPreviewConfirmedReplayHistory).toBe(false);
    expect(result.hasAutoPauseHistory).toBe(false);
    expect(result.latestReplayOperation).toBeNull();
    expect(result.replayOperationsRoute).toBe(
      '/admin/b2b/procurement-webhooks/replay-operations?subscriptionId=21',
    );
    expect(result.replayOperationsExportRoute).toBe(
      '/admin/b2b/procurement-webhooks/replay-operations/export?subscriptionId=21',
    );
    expect(result.replayGovernanceSummaryRoute).toBe(
      '/admin/b2b/procurement-webhooks/replay-operations/summary?subscriptionId=21',
    );
    expect(result.replayGovernanceSummaryExportRoute).toBe(
      '/admin/b2b/procurement-webhooks/replay-operations/summary/export?subscriptionId=21',
    );
    expect(result.previewConfirmedReplayOperationsRoute).toBe(
      '/admin/b2b/procurement-webhooks/replay-operations?subscriptionId=21&previewConfirmed=true',
    );
    expect(result.bulkTerminalFailureReplayOperationsRoute).toBe(
      '/admin/b2b/procurement-webhooks/replay-operations?subscriptionId=21&replayScope=BULK_TERMINAL_FAILURES',
    );
    expect(
      result.previewConfirmedBulkTerminalFailureReplayOperationsRoute,
    ).toBe(
      '/admin/b2b/procurement-webhooks/replay-operations?subscriptionId=21&replayScope=BULK_TERMINAL_FAILURES&previewConfirmed=true',
    );
    expect(result.remediationActionsRoute).toBe(
      '/admin/b2b/procurement-webhooks/subscriptions/21/remediation-actions',
    );
    expect(result.replayRemediationActionsRoute).toBe(
      '/admin/b2b/procurement-webhooks/subscriptions/21/remediation-actions?actionType=REPLAY_OPERATION',
    );
    expect(result.previewConfirmedReplayRemediationActionsRoute).toBe(
      '/admin/b2b/procurement-webhooks/subscriptions/21/remediation-actions?actionType=REPLAY_OPERATION&previewConfirmed=true',
    );
    expect(result.statusRemediationActionsRoute).toBe(
      '/admin/b2b/procurement-webhooks/subscriptions/21/remediation-actions?actionType=STATUS_UPDATE',
    );
    expect(result.autoPausedRemediationActionsRoute).toBe(
      '/admin/b2b/procurement-webhooks/subscriptions/21/remediation-actions?actionType=AUTO_PAUSED',
    );
    expect(result.bulkTerminalFailureReplayRemediationActionsRoute).toBe(
      '/admin/b2b/procurement-webhooks/subscriptions/21/remediation-actions?actionType=REPLAY_OPERATION&replayScope=BULK_TERMINAL_FAILURES',
    );
    expect(
      result.previewConfirmedBulkTerminalFailureReplayRemediationActionsRoute,
    ).toBe(
      '/admin/b2b/procurement-webhooks/subscriptions/21/remediation-actions?actionType=REPLAY_OPERATION&replayScope=BULK_TERMINAL_FAILURES&previewConfirmed=true',
    );
  });

  it('marks replay readiness as high volume and exposes the first preview page for large terminal failure sets', async () => {
    const terminalFailureBaseTime = new Date(
      '2026-03-20T12:00:00.000Z',
    ).getTime();
    const terminalFailures = Array.from({ length: 26 }, (_, index) => ({
      id: 500 - index,
      subscriptionId: 31,
      subscription: { id: 31, name: 'High Volume Feed' },
      eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
      eventKey: `intervention:${500 - index}:status`,
      requestUrl: 'https://partner.example.com/hooks/high-volume',
      requestHeaders: {},
      requestBody: { interventionId: 500 - index },
      branchId: 3,
      supplierProfileId: 7,
      purchaseOrderId: null,
      status: ProcurementWebhookDeliveryStatus.FAILED,
      attemptCount: 4,
      nextRetryAt: null,
      finalFailureAt: new Date(terminalFailureBaseTime - index * 60 * 1000),
      createdAt: new Date(terminalFailureBaseTime - index * 60 * 1000 - 1_000),
      updatedAt: new Date(terminalFailureBaseTime - index * 60 * 1000),
    }));

    subscriptionsRepository.findOne.mockResolvedValue({
      id: 31,
      name: 'High Volume Feed',
      endpointUrl: 'https://partner.example.com/hooks/high-volume',
      signingSecret: 'high-volume-secret',
      eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
      status: ProcurementWebhookSubscriptionStatus.PAUSED,
      createdAt: new Date('2026-03-20T09:00:00.000Z'),
      updatedAt: new Date('2026-03-20T09:30:00.000Z'),
    });
    deliveriesRepository.count.mockResolvedValue(26);
    deliveriesRepository.find
      .mockResolvedValueOnce(
        terminalFailures.slice(0, 10) as ProcurementWebhookDelivery[],
      )
      .mockResolvedValueOnce(terminalFailures as ProcurementWebhookDelivery[]);
    (auditService as any).listForTarget = jest.fn().mockResolvedValue([]);

    const result = await service.getSubscriptionDetail(31);

    expect(result.terminalFailureReplayReadiness).toEqual(
      expect.objectContaining({
        status: ProcurementWebhookReplayReadinessStatus.HIGH_VOLUME,
        eligibleTerminalFailureCount: 26,
        recommendedReplayLimit: 25,
      }),
    );
    expect(result.terminalFailureReplayPreview).toEqual(
      expect.objectContaining({
        requestedCount: 25,
        pageSize: 25,
        totalMatchedTerminalFailureCount: 26,
        previewedCount: 25,
        skippedCount: 0,
        remainingMatchedTerminalFailureCount: 1,
        hasMoreMatchedDeliveries: true,
        nextCursor: expect.any(String),
        executionConfirmationToken: expect.any(String),
        executionConfirmationExpiresAt: expect.any(String),
      }),
    );
    expect(
      result.terminalFailureReplayPreview.candidateDeliveries,
    ).toHaveLength(25);
    expect(result.terminalFailureReplayPreview.candidateDeliveries[0]).toEqual(
      expect.objectContaining({ id: 500 }),
    );
    expect(result.terminalFailureReplayPreview.candidateDeliveries[24]).toEqual(
      expect.objectContaining({ id: 476 }),
    );
  });

  it('throws when a requested subscription detail does not exist', async () => {
    subscriptionsRepository.findOne.mockResolvedValue(null);

    await expect(service.getSubscriptionDetail(999)).rejects.toThrow(
      'Procurement webhook subscription with ID 999 not found',
    );
  });

  it('includes resume risk previews on listed subscriptions based on recent terminal failure pressure', async () => {
    subscriptionsRepository.find.mockResolvedValue([
      {
        id: 12,
        name: 'ERP Feed',
        endpointUrl: 'https://partner.example.com/hooks/procurement',
        signingSecret: 'top-secret-key',
        eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.PAUSED,
        branchId: null,
        supplierProfileId: null,
        metadata: null,
        lastDeliveredAt: null,
        lastDeliveryStatus: null,
        createdByUserId: 4,
        updatedByUserId: 4,
        createdAt: new Date('2026-03-20T11:00:00.000Z'),
        updatedAt: new Date('2026-03-20T11:00:00.000Z'),
      },
      {
        id: 13,
        name: 'Healthy Feed',
        endpointUrl: 'https://partner.example.com/hooks/healthy',
        signingSecret: 'healthy-secret',
        eventTypes: [ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        branchId: null,
        supplierProfileId: null,
        metadata: null,
        lastDeliveredAt: null,
        lastDeliveryStatus: null,
        createdByUserId: 5,
        updatedByUserId: 5,
        createdAt: new Date('2026-03-20T12:00:00.000Z'),
        updatedAt: new Date('2026-03-20T12:00:00.000Z'),
      },
    ] as ProcurementWebhookSubscription[]);
    deliveriesRepository.find.mockResolvedValue([
      { subscriptionId: 12 },
      { subscriptionId: 12 },
      { subscriptionId: 12 },
      { subscriptionId: 13 },
    ]);

    const result = await service.listSubscriptions({ page: 1, limit: 20 });

    expect(result.items).toHaveLength(2);
    const healthyFeed = result.items.find((item) => item.id === 13);
    const pausedFeed = result.items.find((item) => item.id === 12);

    expect(healthyFeed).toEqual(
      expect.objectContaining({
        id: 13,
        resumeRiskPreview: expect.objectContaining({
          recentTerminalFailureCount: 1,
          threshold: 3,
          thresholdWindowHours: 24,
          forceResumeRequired: false,
          forceResumeApplied: false,
          severity: ProcurementWebhookResumeRiskSeverity.WATCH,
        }),
      }),
    );
    expect(pausedFeed).toEqual(
      expect.objectContaining({
        id: 12,
        resumeRiskPreview: expect.objectContaining({
          recentTerminalFailureCount: 3,
          threshold: 3,
          thresholdWindowHours: 24,
          forceResumeRequired: true,
          forceResumeApplied: false,
          severity: ProcurementWebhookResumeRiskSeverity.FORCE_RESUME_REQUIRED,
        }),
      }),
    );
    expect(deliveriesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subscriptionId: expect.anything(),
          status: ProcurementWebhookDeliveryStatus.FAILED,
          finalFailureAt: expect.anything(),
        }),
      }),
    );
  });

  it('filters listed subscriptions to only those requiring force resume when requested', async () => {
    subscriptionsRepository.find.mockResolvedValue([
      {
        id: 12,
        name: 'ERP Feed',
        endpointUrl: 'https://partner.example.com/hooks/procurement',
        signingSecret: 'top-secret-key',
        eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.PAUSED,
        branchId: null,
        supplierProfileId: null,
        metadata: null,
        lastDeliveredAt: null,
        lastDeliveryStatus: null,
        createdByUserId: 4,
        updatedByUserId: 4,
        createdAt: new Date('2026-03-20T11:00:00.000Z'),
        updatedAt: new Date('2026-03-20T11:00:00.000Z'),
      },
      {
        id: 13,
        name: 'Healthy Feed',
        endpointUrl: 'https://partner.example.com/hooks/healthy',
        signingSecret: 'healthy-secret',
        eventTypes: [ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        branchId: null,
        supplierProfileId: null,
        metadata: null,
        lastDeliveredAt: null,
        lastDeliveryStatus: null,
        createdByUserId: 5,
        updatedByUserId: 5,
        createdAt: new Date('2026-03-20T12:00:00.000Z'),
        updatedAt: new Date('2026-03-20T12:00:00.000Z'),
      },
    ] as ProcurementWebhookSubscription[]);
    deliveriesRepository.find.mockResolvedValue([
      { subscriptionId: 12 },
      { subscriptionId: 12 },
      { subscriptionId: 12 },
      { subscriptionId: 13 },
    ]);

    const result = await service.listSubscriptions({
      page: 1,
      limit: 20,
      forceResumeRequired: true,
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 12,
        resumeRiskPreview: expect.objectContaining({
          recentTerminalFailureCount: 3,
          forceResumeRequired: true,
          severity: ProcurementWebhookResumeRiskSeverity.FORCE_RESUME_REQUIRED,
        }),
      }),
    );
  });

  it('sorts listed subscriptions by terminal failure pressure when requested', async () => {
    subscriptionsRepository.find.mockResolvedValue([
      {
        id: 12,
        name: 'ERP Feed',
        endpointUrl: 'https://partner.example.com/hooks/procurement',
        signingSecret: 'top-secret-key',
        eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.PAUSED,
        branchId: null,
        supplierProfileId: null,
        metadata: null,
        lastDeliveredAt: null,
        lastDeliveryStatus: null,
        createdByUserId: 4,
        updatedByUserId: 4,
        createdAt: new Date('2026-03-20T11:00:00.000Z'),
        updatedAt: new Date('2026-03-20T11:00:00.000Z'),
      },
      {
        id: 13,
        name: 'Healthy Feed',
        endpointUrl: 'https://partner.example.com/hooks/healthy',
        signingSecret: 'healthy-secret',
        eventTypes: [ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        branchId: null,
        supplierProfileId: null,
        metadata: null,
        lastDeliveredAt: null,
        lastDeliveryStatus: null,
        createdByUserId: 5,
        updatedByUserId: 5,
        createdAt: new Date('2026-03-20T12:00:00.000Z'),
        updatedAt: new Date('2026-03-20T12:00:00.000Z'),
      },
      {
        id: 14,
        name: 'At Risk Feed',
        endpointUrl: 'https://partner.example.com/hooks/risky',
        signingSecret: 'risk-secret',
        eventTypes: [ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.PAUSED,
        branchId: null,
        supplierProfileId: null,
        metadata: null,
        lastDeliveredAt: null,
        lastDeliveryStatus: null,
        createdByUserId: 6,
        updatedByUserId: 6,
        createdAt: new Date('2026-03-20T13:00:00.000Z'),
        updatedAt: new Date('2026-03-20T13:00:00.000Z'),
      },
    ] as ProcurementWebhookSubscription[]);
    deliveriesRepository.find.mockResolvedValue([
      { subscriptionId: 12 },
      { subscriptionId: 12 },
      { subscriptionId: 12 },
      { subscriptionId: 13 },
      { subscriptionId: 14 },
      { subscriptionId: 14 },
    ]);

    const result = await service.listSubscriptions({
      page: 1,
      limit: 20,
      sortByFailurePressure: true,
    });

    expect(result.items.map((item) => item.id)).toEqual([12, 14, 13]);
    expect(result.items[0]?.resumeRiskPreview).toEqual(
      expect.objectContaining({
        recentTerminalFailureCount: 3,
        forceResumeRequired: true,
        severity: ProcurementWebhookResumeRiskSeverity.FORCE_RESUME_REQUIRED,
      }),
    );
    expect(result.items[1]?.resumeRiskPreview).toEqual(
      expect.objectContaining({
        recentTerminalFailureCount: 2,
        forceResumeRequired: false,
        severity: ProcurementWebhookResumeRiskSeverity.WATCH,
      }),
    );
  });

  it('filters listed subscriptions by requested resume risk severity', async () => {
    subscriptionsRepository.find.mockResolvedValue([
      {
        id: 12,
        name: 'ERP Feed',
        endpointUrl: 'https://partner.example.com/hooks/procurement',
        signingSecret: 'top-secret-key',
        eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.PAUSED,
        branchId: null,
        supplierProfileId: null,
        metadata: null,
        lastDeliveredAt: null,
        lastDeliveryStatus: null,
        createdByUserId: 4,
        updatedByUserId: 4,
        createdAt: new Date('2026-03-20T11:00:00.000Z'),
        updatedAt: new Date('2026-03-20T11:00:00.000Z'),
      },
      {
        id: 13,
        name: 'Healthy Feed',
        endpointUrl: 'https://partner.example.com/hooks/healthy',
        signingSecret: 'healthy-secret',
        eventTypes: [ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        branchId: null,
        supplierProfileId: null,
        metadata: null,
        lastDeliveredAt: null,
        lastDeliveryStatus: null,
        createdByUserId: 5,
        updatedByUserId: 5,
        createdAt: new Date('2026-03-20T12:00:00.000Z'),
        updatedAt: new Date('2026-03-20T12:00:00.000Z'),
      },
      {
        id: 14,
        name: 'At Risk Feed',
        endpointUrl: 'https://partner.example.com/hooks/risky',
        signingSecret: 'risk-secret',
        eventTypes: [ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.PAUSED,
        branchId: null,
        supplierProfileId: null,
        metadata: null,
        lastDeliveredAt: null,
        lastDeliveryStatus: null,
        createdByUserId: 6,
        updatedByUserId: 6,
        createdAt: new Date('2026-03-20T13:00:00.000Z'),
        updatedAt: new Date('2026-03-20T13:00:00.000Z'),
      },
    ] as ProcurementWebhookSubscription[]);
    deliveriesRepository.find.mockResolvedValue([
      { subscriptionId: 12 },
      { subscriptionId: 12 },
      { subscriptionId: 12 },
      { subscriptionId: 13 },
      { subscriptionId: 14 },
      { subscriptionId: 14 },
    ]);

    const result = await service.listSubscriptions({
      page: 1,
      limit: 20,
      severity: ProcurementWebhookResumeRiskSeverity.WATCH,
      sortByFailurePressure: true,
    });

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual([14, 13]);
    expect(result.items[0]?.resumeRiskPreview).toEqual(
      expect.objectContaining({
        severity: ProcurementWebhookResumeRiskSeverity.WATCH,
        recentTerminalFailureCount: 2,
      }),
    );
    expect(result.items[1]?.resumeRiskPreview).toEqual(
      expect.objectContaining({
        severity: ProcurementWebhookResumeRiskSeverity.WATCH,
        recentTerminalFailureCount: 1,
      }),
    );
  });

  it('blocks resuming a subscription while terminal failure pressure is still above threshold unless forced', async () => {
    deliveriesRepository.count.mockResolvedValue(3);
    subscriptionsRepository.findOne.mockResolvedValue({
      id: 12,
      name: 'ERP Feed',
      endpointUrl: 'https://partner.example.com/hooks/procurement',
      signingSecret: 'top-secret-key',
      eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
      status: ProcurementWebhookSubscriptionStatus.PAUSED,
      createdAt: new Date('2026-03-20T11:00:00.000Z'),
      updatedAt: new Date('2026-03-20T11:00:00.000Z'),
    });

    let error: BadRequestException | null = null;
    try {
      await service.updateSubscriptionStatus(
        12,
        { status: ProcurementWebhookSubscriptionStatus.ACTIVE },
        { id: 4, email: 'admin@example.com' },
      );
    } catch (caught) {
      error = caught as BadRequestException;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error?.message).toContain('Set forceResume=true to resume anyway.');
    expect(error?.getResponse()).toEqual(
      expect.objectContaining({
        code: 'PROCUREMENT_WEBHOOK_RESUME_REQUIRES_FORCE',
        resumeRisk: expect.objectContaining({
          recentTerminalFailureCount: 3,
          threshold: 3,
          thresholdWindowHours: 24,
          forceResumeRequired: true,
          forceResumeApplied: false,
          severity: ProcurementWebhookResumeRiskSeverity.FORCE_RESUME_REQUIRED,
        }),
      }),
    );

    expect(subscriptionsRepository.save).not.toHaveBeenCalled();
  });

  it('allows force-resuming a subscription and audits the override', async () => {
    deliveriesRepository.count.mockResolvedValue(3);
    subscriptionsRepository.findOne.mockResolvedValue({
      id: 12,
      name: 'ERP Feed',
      endpointUrl: 'https://partner.example.com/hooks/procurement',
      signingSecret: 'top-secret-key',
      eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
      status: ProcurementWebhookSubscriptionStatus.PAUSED,
      createdAt: new Date('2026-03-20T11:00:00.000Z'),
      updatedAt: new Date('2026-03-20T11:00:00.000Z'),
    });
    subscriptionsRepository.save.mockResolvedValue({
      id: 12,
      name: 'ERP Feed',
      endpointUrl: 'https://partner.example.com/hooks/procurement',
      signingSecret: 'top-secret-key',
      eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
      status: ProcurementWebhookSubscriptionStatus.ACTIVE,
      createdByUserId: 4,
      updatedByUserId: 4,
      createdAt: new Date('2026-03-20T11:00:00.000Z'),
      updatedAt: new Date('2026-03-20T11:05:00.000Z'),
    });

    const result = await service.updateSubscriptionStatus(
      12,
      {
        status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        forceResume: true,
        note: 'Partner confirmed fix',
      },
      { id: 4, email: 'admin@example.com' },
    );

    expect(result.status).toBe(ProcurementWebhookSubscriptionStatus.ACTIVE);
    expect(result.resumeRisk).toEqual(
      expect.objectContaining({
        recentTerminalFailureCount: 3,
        threshold: 3,
        thresholdWindowHours: 24,
        forceResumeRequired: true,
        forceResumeApplied: true,
        severity: ProcurementWebhookResumeRiskSeverity.FORCE_RESUME_REQUIRED,
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'procurement_webhook_subscription.status.update',
        targetId: 12,
        actorId: 4,
        actorEmail: 'admin@example.com',
        reason: 'Partner confirmed fix',
        meta: expect.objectContaining({
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
          forceResume: true,
          recentTerminalFailureCount: 3,
          forceResumeRequired: true,
        }),
      }),
    );
  });

  it('replays a stored delivery and audits the replay', async () => {
    deliveriesRepository.findOne.mockResolvedValue({
      id: 77,
      subscriptionId: 10,
      eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
      eventKey: 'intervention:7:3:assign',
      branchId: 3,
      supplierProfileId: 7,
      purchaseOrderId: null,
      requestBody: {
        supplierProfileId: 7,
        branchId: 3,
        action: 'ASSIGN',
      },
      subscription: {
        id: 10,
        name: 'ERP Feed',
        endpointUrl: 'https://partner.example.com/hooks/procurement',
        signingSecret: 'top-secret-key',
        eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
        status: ProcurementWebhookSubscriptionStatus.ACTIVE,
      },
    } as ProcurementWebhookDelivery);
    (axios.post as jest.Mock).mockResolvedValue({
      status: 200,
      data: { ok: true },
    });

    const result = await service.replayDelivery(
      77,
      { note: 'Partner remediated endpoint' },
      {
        id: 9,
        email: 'admin@example.com',
      },
    );

    expect(result.replayedFromDeliveryId).toBe(77);
    expect(result.subscriptionName).toBe('ERP Feed');
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'procurement_webhook_delivery.replay',
        actorId: 9,
        actorEmail: 'admin@example.com',
        reason: 'Partner remediated endpoint',
        meta: expect.objectContaining({ replayedFromDeliveryId: 77 }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'procurement_webhook_subscription.replay_operation',
        targetId: 10,
        actorId: 9,
        actorEmail: 'admin@example.com',
        reason: 'Partner remediated endpoint',
        meta: expect.objectContaining({
          replayScope: 'SINGLE_DELIVERY',
          replayExecutionMode: 'SINGLE_DELIVERY',
          deliveryId: 77,
        }),
      }),
    );
  });

  it('previews bulk terminal failure replay candidates without dispatching webhooks', async () => {
    deliveriesRepository.find.mockResolvedValue([
      {
        id: 92,
        subscriptionId: 10,
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: 'intervention:92:status',
        requestUrl: 'https://partner.example.com/hooks/procurement',
        requestHeaders: {},
        requestBody: { interventionId: 92 },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: null,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: new Date('2026-03-20T12:00:00.000Z'),
        createdAt: new Date('2026-03-20T11:00:00.000Z'),
        updatedAt: new Date('2026-03-20T12:00:00.000Z'),
        subscription: {
          id: 10,
          name: 'ERP Feed',
          endpointUrl: 'https://partner.example.com/hooks/procurement',
          signingSecret: 'top-secret-key',
          eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        },
      },
      {
        id: 91,
        subscriptionId: 11,
        eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
        eventKey: 'po:91:status',
        requestUrl: 'https://partner.example.com/hooks/missing',
        requestHeaders: {},
        requestBody: { purchaseOrderId: 91 },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: 91,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: new Date('2026-03-20T11:00:00.000Z'),
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T11:00:00.000Z'),
        subscription: null,
      },
      {
        id: 90,
        subscriptionId: 10,
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: 'intervention:90:status',
        requestUrl: 'https://partner.example.com/hooks/procurement',
        requestHeaders: {},
        requestBody: { interventionId: 90 },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: null,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: new Date('2026-03-20T10:00:00.000Z'),
        createdAt: new Date('2026-03-20T09:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        subscription: {
          id: 10,
          name: 'ERP Feed',
          endpointUrl: 'https://partner.example.com/hooks/procurement',
          signingSecret: 'top-secret-key',
          eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        },
      },
    ] as ProcurementWebhookDelivery[]);

    const result = await service.previewReplayTerminalFailures({ limit: 2 });

    expect(result).toEqual(
      expect.objectContaining({
        requestedCount: 2,
        pageSize: 2,
        appliedCursor: null,
        totalMatchedTerminalFailureCount: 3,
        previewedCount: 1,
        skippedCount: 1,
        skippedDeliveryIds: [91],
        remainingMatchedTerminalFailureCount: 1,
        hasMoreMatchedDeliveries: true,
        nextCursor: expect.any(String),
        executionConfirmationToken: expect.any(String),
        executionConfirmationExpiresAt: expect.any(String),
        candidateDeliveries: [
          expect.objectContaining({
            id: 92,
            subscriptionName: 'ERP Feed',
          }),
        ],
      }),
    );
    expect(axios.post).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();

    const nextPage = await service.previewReplayTerminalFailures({
      limit: 2,
      cursor: result.nextCursor ?? undefined,
    });

    expect(nextPage).toEqual(
      expect.objectContaining({
        requestedCount: 2,
        pageSize: 2,
        appliedCursor: result.nextCursor,
        totalMatchedTerminalFailureCount: 3,
        previewedCount: 1,
        skippedCount: 0,
        skippedDeliveryIds: [],
        remainingMatchedTerminalFailureCount: 0,
        hasMoreMatchedDeliveries: false,
        nextCursor: null,
        executionConfirmationToken: expect.any(String),
        executionConfirmationExpiresAt: expect.any(String),
        candidateDeliveries: [
          expect.objectContaining({
            id: 90,
            subscriptionName: 'ERP Feed',
          }),
        ],
      }),
    );
  });

  it('rejects high-volume bulk replay without explicit delivery ids or preview confirmation', async () => {
    const terminalFailureBaseTime = new Date(
      '2026-03-20T12:00:00.000Z',
    ).getTime();
    deliveriesRepository.find.mockResolvedValue(
      Array.from({ length: 26 }, (_, index) => ({
        id: 700 - index,
        subscriptionId: 31,
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: `intervention:${700 - index}:status`,
        requestUrl: 'https://partner.example.com/hooks/high-volume',
        requestHeaders: {},
        requestBody: { interventionId: 700 - index },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: null,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: new Date(terminalFailureBaseTime - index * 60 * 1000),
        createdAt: new Date(terminalFailureBaseTime - index * 60 * 1000 - 1000),
        updatedAt: new Date(terminalFailureBaseTime - index * 60 * 1000),
        subscription: {
          id: 31,
          name: 'High Volume Feed',
          endpointUrl: 'https://partner.example.com/hooks/high-volume',
          signingSecret: 'high-volume-secret',
          eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        },
      })) as ProcurementWebhookDelivery[],
    );

    await expect(
      service.replayTerminalFailures(
        { subscriptionId: 31, limit: 25 },
        { id: 7, email: 'ops@example.com' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROCUREMENT_WEBHOOK_REPLAY_REQUIRES_PREVIEW_CONFIRMATION',
        totalMatchedTerminalFailureCount: 26,
        recommendedReplayLimit: 25,
      }),
    });
    expect(axios.post).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('allows high-volume bulk replay when using a confirmed preview page token', async () => {
    const terminalFailureBaseTime = new Date(
      '2026-03-20T12:00:00.000Z',
    ).getTime();
    deliveriesRepository.find.mockResolvedValue(
      Array.from({ length: 26 }, (_, index) => ({
        id: 800 - index,
        subscriptionId: 41,
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: `intervention:${800 - index}:status`,
        requestUrl: 'https://partner.example.com/hooks/high-volume',
        requestHeaders: {},
        requestBody: { interventionId: 800 - index },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: null,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: new Date(terminalFailureBaseTime - index * 60 * 1000),
        createdAt: new Date(terminalFailureBaseTime - index * 60 * 1000 - 1000),
        updatedAt: new Date(terminalFailureBaseTime - index * 60 * 1000),
        subscription: {
          id: 41,
          name: 'High Volume Feed',
          endpointUrl: 'https://partner.example.com/hooks/high-volume',
          signingSecret: 'high-volume-secret',
          eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        },
      })) as ProcurementWebhookDelivery[],
    );
    (axios.post as jest.Mock).mockResolvedValue({
      status: 200,
      data: { ok: true },
    });

    const preview = await service.previewReplayTerminalFailures({
      subscriptionId: 41,
      limit: 25,
    });
    const result = await service.replayTerminalFailures(
      {
        subscriptionId: 41,
        limit: 25,
        previewConfirmationToken:
          preview.executionConfirmationToken ?? undefined,
      },
      { id: 7, email: 'ops@example.com' },
    );

    expect(preview.executionConfirmationToken).toEqual(expect.any(String));
    expect(preview.executionConfirmationExpiresAt).toEqual(expect.any(String));
    expect(result).toEqual(
      expect.objectContaining({
        requestedCount: 25,
        matchedTerminalFailureCount: 25,
        replayedCount: 25,
        skippedCount: 0,
      }),
    );
    expect(axios.post).toHaveBeenCalledTimes(25);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'procurement_webhook_subscription.replay_operation',
        targetId: 41,
        meta: expect.objectContaining({
          replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
          previewConfirmed: true,
          totalMatchedTerminalFailureCount: 26,
        }),
      }),
    );
  });

  it('rejects expired high-volume preview confirmation tokens', async () => {
    const terminalFailureBaseTime = new Date(
      '2026-03-20T12:00:00.000Z',
    ).getTime();
    deliveriesRepository.find.mockResolvedValue(
      Array.from({ length: 26 }, (_, index) => ({
        id: 900 - index,
        subscriptionId: 51,
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: `intervention:${900 - index}:status`,
        requestUrl: 'https://partner.example.com/hooks/high-volume',
        requestHeaders: {},
        requestBody: { interventionId: 900 - index },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: null,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: new Date(terminalFailureBaseTime - index * 60 * 1000),
        createdAt: new Date(terminalFailureBaseTime - index * 60 * 1000 - 1000),
        updatedAt: new Date(terminalFailureBaseTime - index * 60 * 1000),
        subscription: {
          id: 51,
          name: 'High Volume Feed',
          endpointUrl: 'https://partner.example.com/hooks/high-volume',
          signingSecret: 'high-volume-secret',
          eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        },
      })) as ProcurementWebhookDelivery[],
    );

    const preview = await service.previewReplayTerminalFailures({
      subscriptionId: 51,
      limit: 25,
    });
    const [payload] = (preview.executionConfirmationToken ?? '').split('.', 2);
    const parsedToken = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    const expiredPayload = Buffer.from(
      JSON.stringify({
        ...parsedToken,
        issuedAtMs: Date.now() - 60 * 60 * 1000,
        expiresAtMs: Date.now() - 30 * 60 * 1000,
      }),
      'utf8',
    ).toString('base64url');
    const expiredSignature = createHmac(
      'sha256',
      process.env.PROCUREMENT_WEBHOOK_REPLAY_CONFIRMATION_SECRET ||
        process.env.JWT_SECRET ||
        'procurement-webhook-replay-confirmation-secret',
    )
      .update(expiredPayload)
      .digest('base64url');
    const expiredToken = `${expiredPayload}.${expiredSignature}`;

    await expect(
      service.replayTerminalFailures(
        {
          subscriptionId: 51,
          limit: 25,
          previewConfirmationToken: expiredToken,
        },
        { id: 7, email: 'ops@example.com' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROCUREMENT_WEBHOOK_REPLAY_PREVIEW_CONFIRMATION_EXPIRED',
        recommendedReplayLimit: 25,
      }),
    });
  });

  it('rejects tampered replay confirmation tokens', async () => {
    const terminalFailureBaseTime = new Date(
      '2026-03-20T12:00:00.000Z',
    ).getTime();
    deliveriesRepository.find.mockResolvedValue(
      Array.from({ length: 26 }, (_, index) => ({
        id: 950 - index,
        subscriptionId: 61,
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: `intervention:${950 - index}:status`,
        requestUrl: 'https://partner.example.com/hooks/high-volume',
        requestHeaders: {},
        requestBody: { interventionId: 950 - index },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: null,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: new Date(terminalFailureBaseTime - index * 60 * 1000),
        createdAt: new Date(terminalFailureBaseTime - index * 60 * 1000 - 1000),
        updatedAt: new Date(terminalFailureBaseTime - index * 60 * 1000),
        subscription: {
          id: 61,
          name: 'High Volume Feed',
          endpointUrl: 'https://partner.example.com/hooks/high-volume',
          signingSecret: 'high-volume-secret',
          eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        },
      })) as ProcurementWebhookDelivery[],
    );

    const preview = await service.previewReplayTerminalFailures({
      subscriptionId: 61,
      limit: 25,
    });
    const [payload] = (preview.executionConfirmationToken ?? '').split('.', 2);
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
        signature: {
          ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
            .signature,
          subscriptionId: 999,
        },
      }),
      'utf8',
    ).toString('base64url');
    const tamperedToken = `${tamperedPayload}.invalid-signature`;

    await expect(
      service.replayTerminalFailures(
        {
          subscriptionId: 61,
          limit: 25,
          previewConfirmationToken: tamperedToken,
        },
        { id: 7, email: 'ops@example.com' },
      ),
    ).rejects.toThrow(
      'Invalid procurement webhook replay preview confirmation token',
    );
  });

  it('retries eligible failed deliveries and marks final failure after the last attempt', async () => {
    deliveriesRepository.count.mockResolvedValue(1);
    deliveriesRepository.find.mockResolvedValue([
      {
        id: 90,
        subscriptionId: 10,
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: 'intervention:7:3:assign',
        requestUrl: 'https://partner.example.com/hooks/procurement',
        requestHeaders: {},
        requestBody: {
          supplierProfileId: 7,
          branchId: 3,
        },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: null,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 3,
        nextRetryAt: new Date('2026-03-20T10:00:00.000Z'),
        finalFailureAt: null,
        subscription: {
          id: 10,
          name: 'ERP Feed',
          endpointUrl: 'https://partner.example.com/hooks/procurement',
          signingSecret: 'top-secret-key',
          eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        },
      },
    ] as ProcurementWebhookDelivery[]);
    (axios.post as jest.Mock).mockRejectedValue(new Error('still failing'));

    const result = await service.retryFailedDeliveries();

    expect(result).toEqual({ attempted: 1, succeeded: 0, failed: 1 });
    expect(deliveriesRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 90,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: expect.any(Date),
      }),
    );
    expect(notificationsService.broadcastToRole).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        role: UserRole.ADMIN,
        type: NotificationType.ADMIN_BROADCAST,
        title: 'Procurement webhook delivery permanently failed',
        body: expect.stringContaining('ERP Feed exhausted retries'),
        data: expect.objectContaining({
          category: 'procurement_webhook_terminal_failure',
          route: '/admin/b2b/procurement-webhooks',
          deliveryId: 90,
          subscriptionId: 10,
          eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        }),
      }),
    );
    expect(notificationsService.broadcastToRole).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        role: UserRole.SUPER_ADMIN,
        type: NotificationType.ADMIN_BROADCAST,
      }),
    );
    expect(subscriptionsRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 10,
        lastDeliveryStatus: 'FAILED',
      }),
    );
  });

  it('auto-pauses an active subscription after repeated terminal failures in the threshold window', async () => {
    deliveriesRepository.count.mockResolvedValue(3);
    deliveriesRepository.find.mockResolvedValue([
      {
        id: 90,
        subscriptionId: 10,
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: 'intervention:7:3:assign',
        requestUrl: 'https://partner.example.com/hooks/procurement',
        requestHeaders: {},
        requestBody: {
          supplierProfileId: 7,
          branchId: 3,
        },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: null,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 3,
        nextRetryAt: new Date('2026-03-20T10:00:00.000Z'),
        finalFailureAt: null,
        subscription: {
          id: 10,
          name: 'ERP Feed',
          endpointUrl: 'https://partner.example.com/hooks/procurement',
          signingSecret: 'top-secret-key',
          eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        },
      },
    ] as ProcurementWebhookDelivery[]);
    (axios.post as jest.Mock).mockRejectedValue(new Error('still failing'));

    await service.retryFailedDeliveries();

    expect(subscriptionsRepository.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 10,
        status: ProcurementWebhookSubscriptionStatus.PAUSED,
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'procurement_webhook_subscription.auto_paused',
        targetId: 10,
        meta: expect.objectContaining({
          triggerDeliveryId: 90,
          terminalFailureCount: 3,
          threshold: 3,
          thresholdWindowHours: 24,
        }),
      }),
    );
    expect(notificationsService.broadcastToRole).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        role: UserRole.ADMIN,
        type: NotificationType.ADMIN_BROADCAST,
        title: 'Procurement webhook subscription auto-paused',
        data: expect.objectContaining({
          category: 'procurement_webhook_subscription_auto_paused',
          subscriptionId: 10,
          triggerDeliveryId: 90,
          terminalFailureCount: 3,
        }),
      }),
    );
    expect(notificationsService.broadcastToRole).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        role: UserRole.SUPER_ADMIN,
        type: NotificationType.ADMIN_BROADCAST,
      }),
    );
  });

  it('applies retry-state and next-retry window filters when listing deliveries', async () => {
    await service.listDeliveries({
      retryState: ProcurementWebhookDeliveryRetryState.RETRY_ELIGIBLE,
      nextRetryFrom: '2026-03-20T09:00:00.000Z',
      nextRetryTo: '2026-03-20T12:00:00.000Z',
      page: 1,
      limit: 20,
    });

    expect(deliveriesQueryBuilder.andWhere).toHaveBeenCalledWith(
      'delivery.status = :retryEligibleStatus',
      { retryEligibleStatus: ProcurementWebhookDeliveryStatus.FAILED },
    );
    expect(deliveriesQueryBuilder.andWhere).toHaveBeenCalledWith(
      'delivery.nextRetryAt IS NOT NULL',
    );
    expect(deliveriesQueryBuilder.andWhere).toHaveBeenCalledWith(
      'delivery.finalFailureAt IS NULL',
    );
    expect(deliveriesQueryBuilder.andWhere).toHaveBeenCalledWith(
      'delivery.nextRetryAt >= :nextRetryFrom',
      { nextRetryFrom: new Date('2026-03-20T09:00:00.000Z') },
    );
    expect(deliveriesQueryBuilder.andWhere).toHaveBeenCalledWith(
      'delivery.nextRetryAt <= :nextRetryTo',
      { nextRetryTo: new Date('2026-03-20T12:00:00.000Z') },
    );
  });

  it('lists replay operations with audit filters and subscription mapping', async () => {
    (auditService as any).listAllPaged.mockResolvedValue({
      items: [
        {
          targetId: 12,
          action: 'procurement_webhook_subscription.replay_operation',
          actorId: 9,
          actorEmail: 'admin@example.com',
          reason: 'Partner endpoint fixed',
          meta: {
            replayScope: 'BULK_TERMINAL_FAILURES',
            replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
            requestedCount: 2,
            matchedTerminalFailureCount: 2,
            replayedCount: 2,
            skippedCount: 0,
            previewConfirmed: true,
            previewCursor: null,
            previewMatchedTerminalFailureCount: 2,
            previewConfirmationIssuedAt: '2026-03-20T10:42:00.000Z',
            previewConfirmationExpiresAt: '2026-03-20T11:12:00.000Z',
          },
          createdAt: new Date('2026-03-20T10:45:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
    });
    subscriptionsRepository.find.mockResolvedValue([
      {
        id: 12,
        name: 'ERP Feed',
      },
    ] as ProcurementWebhookSubscription[]);

    const result = await service.listReplayOperations({
      subscriptionId: 12,
      replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE' as any,
      previewConfirmed: true,
      page: 1,
      limit: 20,
    });

    expect((auditService as any).listAllPaged).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 20,
        targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
        targetId: 12,
        filters: expect.objectContaining({
          actions: ['procurement_webhook_subscription.replay_operation'],
          metaEquals: expect.objectContaining({
            replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
            previewConfirmed: true,
          }),
        }),
      }),
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          action: 'procurement_webhook_subscription.replay_operation',
          subscriptionId: 12,
          subscriptionName: 'ERP Feed',
          route: '/admin/b2b/procurement-webhooks?subscriptionId=12',
          replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
          previewConfirmed: true,
          note: 'Partner endpoint fixed',
        }),
      ],
      total: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
      appliedCursor: null,
      nextCursor: null,
    });
  });

  it('summarizes replay governance activity across subscriptions', async () => {
    (auditService as any).listAllPaged.mockImplementation(
      async (options: any) => {
        const metaEquals = options?.filters?.metaEquals ?? {};

        let total = 0;
        if (metaEquals.replayExecutionMode === 'SINGLE_DELIVERY') {
          total = 2;
        } else if (metaEquals.replayExecutionMode === 'EXPLICIT_DELIVERY_IDS') {
          total = 1;
        } else if (metaEquals.replayExecutionMode === 'FILTERED_PAGE') {
          total = 2;
        } else if (
          metaEquals.replayExecutionMode === 'PREVIEW_CONFIRMED_PAGE'
        ) {
          total = 4;
        } else if (
          metaEquals.replayScope === 'BULK_TERMINAL_FAILURES' &&
          metaEquals.previewConfirmed === true
        ) {
          total = 3;
        } else if (metaEquals.replayScope === 'BULK_TERMINAL_FAILURES') {
          total = 5;
        } else if (metaEquals.previewConfirmed === true) {
          total = 4;
        } else {
          total = 9;
        }

        return {
          items: [],
          total,
          page: 1,
          perPage: 1,
          totalPages: total > 0 ? total : 0,
        };
      },
    );

    const result = await service.getReplayOperationsSummary({
      actorEmail: 'admin@example.com',
      from: '2026-03-20T00:00:00.000Z',
      to: '2026-03-21T00:00:00.000Z',
    });

    expect((auditService as any).listAllPaged).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 1,
        targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
        filters: expect.objectContaining({
          actions: ['procurement_webhook_subscription.replay_operation'],
          actorEmail: 'admin@example.com',
          from: new Date('2026-03-20T00:00:00.000Z'),
          to: new Date('2026-03-21T00:00:00.000Z'),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        generatedAt: expect.any(String),
        totalReplayOperationCount: 9,
        previewConfirmedReplayCount: 4,
        singleDeliveryReplayCount: 2,
        explicitDeliveryReplayCount: 1,
        filteredPageReplayCount: 2,
        previewConfirmedPageReplayCount: 4,
        bulkTerminalFailureReplayCount: 5,
        previewConfirmedBulkTerminalFailureReplayCount: 3,
      }),
    );
  });

  it('rejects replay governance summaries with inverted date ranges', async () => {
    await expect(
      service.getReplayOperationsSummary({
        from: '2026-03-21T00:00:00.000Z',
        to: '2026-03-20T00:00:00.000Z',
      }),
    ).rejects.toThrow(
      'Procurement webhook audit filters require from to be earlier than or equal to to',
    );

    expect((auditService as any).listAllPaged).not.toHaveBeenCalled();
  });

  it('exports replay governance summaries as CSV', async () => {
    (auditService as any).listAllPaged.mockImplementation(
      async (options: any) => {
        const metaEquals = options?.filters?.metaEquals ?? {};

        let total = 0;
        if (metaEquals.replayExecutionMode === 'SINGLE_DELIVERY') {
          total = 2;
        } else if (metaEquals.replayExecutionMode === 'EXPLICIT_DELIVERY_IDS') {
          total = 1;
        } else if (metaEquals.replayExecutionMode === 'FILTERED_PAGE') {
          total = 2;
        } else if (
          metaEquals.replayExecutionMode === 'PREVIEW_CONFIRMED_PAGE'
        ) {
          total = 4;
        } else if (
          metaEquals.replayScope === 'BULK_TERMINAL_FAILURES' &&
          metaEquals.previewConfirmed === true
        ) {
          total = 3;
        } else if (metaEquals.replayScope === 'BULK_TERMINAL_FAILURES') {
          total = 5;
        } else if (metaEquals.previewConfirmed === true) {
          total = 4;
        } else {
          total = 9;
        }

        return {
          items: [],
          total,
          page: 1,
          perPage: 1,
          totalPages: total > 0 ? total : 0,
        };
      },
    );

    const csv = await service.exportReplayOperationsSummaryCsv({
      subscriptionId: 12,
      actorId: 7,
      actorEmail: 'admin@example.com',
      from: '2026-03-20T00:00:00.000Z',
      to: '2026-03-21T00:00:00.000Z',
    });

    expect(csv).toContain(
      'generatedAt,subscriptionId,actorId,actorEmail,from,to',
    );
    expect(csv).toContain(
      ',12,7,"admin@example.com","2026-03-20T00:00:00.000Z","2026-03-21T00:00:00.000Z",9,4,2,1,2,4,5,3',
    );
  });

  it('exports replay operations as CSV', async () => {
    (auditService as any).listAllPaged.mockResolvedValue({
      items: [
        {
          targetId: 12,
          action: 'procurement_webhook_subscription.replay_operation',
          actorId: 9,
          actorEmail: 'admin@example.com',
          reason: 'Partner endpoint fixed',
          meta: {
            replayScope: 'BULK_TERMINAL_FAILURES',
            replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
            requestedCount: 2,
            matchedTerminalFailureCount: 2,
            replayedCount: 2,
            skippedCount: 0,
            previewConfirmed: true,
            previewCursor: null,
            previewMatchedTerminalFailureCount: 2,
            previewConfirmationIssuedAt: '2026-03-20T10:42:00.000Z',
            previewConfirmationExpiresAt: '2026-03-20T11:12:00.000Z',
          },
          createdAt: new Date('2026-03-20T10:45:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      perPage: 1000,
      totalPages: 1,
    });
    subscriptionsRepository.find.mockResolvedValue([
      { id: 12, name: 'ERP Feed' },
    ] as ProcurementWebhookSubscription[]);

    const csv = await service.exportReplayOperationsCsv({
      subscriptionId: 12,
      previewConfirmed: true,
      actorId: 9,
    });

    expect(csv).toContain(
      'subscriptionId,subscriptionName,route,action,summary,createdAt',
    );
    expect(csv).toContain('12,"ERP Feed"');
    expect(csv).toContain(
      '"/admin/b2b/procurement-webhooks?subscriptionId=12"',
    );
    expect(csv).toContain('"PREVIEW_CONFIRMED_PAGE"');
  });

  it('lists subscription remediation actions with paged replay filters', async () => {
    subscriptionsRepository.findOne.mockResolvedValue({
      id: 12,
      name: 'ERP Feed',
    } as ProcurementWebhookSubscription);
    (auditService as any).listForTargetPaged.mockResolvedValue({
      items: [
        {
          targetId: 12,
          action: 'procurement_webhook_subscription.replay_operation',
          actorId: 9,
          actorEmail: 'admin@example.com',
          reason: 'Partner endpoint fixed',
          meta: {
            replayScope: 'BULK_TERMINAL_FAILURES',
            replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
            requestedCount: 2,
            matchedTerminalFailureCount: 2,
            replayedCount: 2,
            skippedCount: 0,
            previewConfirmed: true,
            previewCursor: null,
            previewMatchedTerminalFailureCount: 2,
            previewConfirmationIssuedAt: '2026-03-20T10:42:00.000Z',
            previewConfirmationExpiresAt: '2026-03-20T11:12:00.000Z',
          },
          createdAt: new Date('2026-03-20T10:45:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
    });

    const result = await service.listSubscriptionRemediationActions(12, {
      actionType:
        ProcurementWebhookSubscriptionRemediationActionType.REPLAY_OPERATION,
      replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE' as any,
      previewConfirmed: true,
      page: 1,
      limit: 20,
    });

    expect((auditService as any).listForTargetPaged).toHaveBeenCalledWith(
      'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
      12,
      expect.objectContaining({
        page: 1,
        limit: 20,
        filters: expect.objectContaining({
          actions: ['procurement_webhook_subscription.replay_operation'],
          metaEquals: expect.objectContaining({
            replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
            previewConfirmed: true,
          }),
        }),
      }),
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          action: 'procurement_webhook_subscription.replay_operation',
          replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
          previewConfirmed: true,
          note: 'Partner endpoint fixed',
        }),
      ],
      total: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
      appliedCursor: null,
      nextCursor: null,
    });
  });

  it('lists subscription remediation actions with cursor pagination', async () => {
    const remediationCursor = Buffer.from(
      '2026-03-20T10:50:00.000Z|999',
      'utf8',
    ).toString('base64url');
    subscriptionsRepository.findOne.mockResolvedValue({
      id: 12,
      name: 'ERP Feed',
    } as ProcurementWebhookSubscription);
    (auditService as any).listForTargetCursor.mockResolvedValue({
      items: [
        {
          targetId: 12,
          action: 'procurement_webhook_subscription.auto_paused',
          meta: {
            triggerDeliveryId: 90,
            terminalFailureCount: 3,
            threshold: 3,
            thresholdWindowHours: 24,
          },
          createdAt: new Date('2026-03-20T10:31:00.000Z'),
        },
      ],
      nextCursor: 'cursor:next',
    });

    const result = await service.listSubscriptionRemediationActions(12, {
      actionType:
        ProcurementWebhookSubscriptionRemediationActionType.AUTO_PAUSED,
      cursor: remediationCursor,
      limit: 20,
    });

    expect((auditService as any).listForTargetCursor).toHaveBeenCalledWith(
      'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
      12,
      expect.objectContaining({
        after: remediationCursor,
        limit: 20,
        filters: expect.objectContaining({
          actions: ['procurement_webhook_subscription.auto_paused'],
        }),
      }),
    );
    expect((auditService as any).listForTargetPaged).not.toHaveBeenCalled();
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          action: 'procurement_webhook_subscription.auto_paused',
          summary: 'Auto-paused after repeated terminal failures',
          triggerDeliveryId: 90,
          terminalFailureCount: 3,
        }),
      ],
      total: null,
      page: null,
      perPage: 20,
      totalPages: null,
      appliedCursor: remediationCursor,
      nextCursor: 'cursor:next',
    });
  });

  it('rejects remediation action queries that mix page and cursor pagination', async () => {
    await expect(
      service.listSubscriptionRemediationActions(12, {
        page: 1,
        cursor: 'cursor:start',
      }),
    ).rejects.toThrow(
      'Subscription remediation action listing does not accept page and cursor together',
    );
    expect(subscriptionsRepository.findOne).not.toHaveBeenCalled();
    expect((auditService as any).listForTargetPaged).not.toHaveBeenCalled();
    expect((auditService as any).listForTargetCursor).not.toHaveBeenCalled();
  });

  it('rejects malformed remediation action cursors', async () => {
    await expect(
      service.listSubscriptionRemediationActions(12, {
        cursor: 'not-a-valid-remediation-cursor',
      }),
    ).rejects.toThrow('Invalid procurement webhook replay operations cursor');
    expect(subscriptionsRepository.findOne).not.toHaveBeenCalled();
    expect((auditService as any).listForTargetPaged).not.toHaveBeenCalled();
    expect((auditService as any).listForTargetCursor).not.toHaveBeenCalled();
  });

  it('rejects remediation action queries with inverted date ranges', async () => {
    await expect(
      service.listSubscriptionRemediationActions(12, {
        from: '2026-03-21T00:00:00.000Z',
        to: '2026-03-20T00:00:00.000Z',
      }),
    ).rejects.toThrow(
      'Procurement webhook audit filters require from to be earlier than or equal to to',
    );

    expect(subscriptionsRepository.findOne).not.toHaveBeenCalled();
    expect((auditService as any).listForTargetPaged).not.toHaveBeenCalled();
    expect((auditService as any).listForTargetCursor).not.toHaveBeenCalled();
  });

  it('lists replay operations with cursor pagination for older audit entries', async () => {
    const replayCursor = Buffer.from(
      '2026-03-20T10:50:00.000Z|999',
      'utf8',
    ).toString('base64url');
    (auditService as any).listAllCursor.mockResolvedValue({
      items: [
        {
          targetId: 12,
          action: 'procurement_webhook_subscription.replay_operation',
          actorId: 9,
          actorEmail: 'admin@example.com',
          reason: 'Preview-confirmed replay',
          meta: {
            replayScope: 'BULK_TERMINAL_FAILURES',
            replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
            requestedCount: 25,
            matchedTerminalFailureCount: 25,
            replayedCount: 25,
            skippedCount: 0,
            previewConfirmed: true,
            previewCursor: 'cursor:1',
            previewMatchedTerminalFailureCount: 25,
            previewConfirmationIssuedAt: '2026-03-20T10:42:00.000Z',
            previewConfirmationExpiresAt: '2026-03-20T11:12:00.000Z',
          },
          createdAt: new Date('2026-03-20T10:45:00.000Z'),
        },
      ],
      nextCursor: 'cursor:next',
    });
    subscriptionsRepository.find.mockResolvedValue([
      {
        id: 12,
        name: 'ERP Feed',
      },
    ] as ProcurementWebhookSubscription[]);

    const result = await service.listReplayOperations({
      subscriptionId: 12,
      replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE' as any,
      previewConfirmed: true,
      cursor: replayCursor,
      limit: 20,
    });

    expect((auditService as any).listAllCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        after: replayCursor,
        limit: 20,
        targetType: 'PROCUREMENT_WEBHOOK_SUBSCRIPTION',
        targetId: 12,
        filters: expect.objectContaining({
          actions: ['procurement_webhook_subscription.replay_operation'],
          metaEquals: expect.objectContaining({
            replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
            previewConfirmed: true,
          }),
        }),
      }),
    );
    expect((auditService as any).listAllPaged).not.toHaveBeenCalled();
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          action: 'procurement_webhook_subscription.replay_operation',
          subscriptionId: 12,
          subscriptionName: 'ERP Feed',
          route: '/admin/b2b/procurement-webhooks?subscriptionId=12',
          replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
          previewConfirmed: true,
          previewCursor: 'cursor:1',
          note: 'Preview-confirmed replay',
        }),
      ],
      total: null,
      page: null,
      perPage: 20,
      totalPages: null,
      appliedCursor: replayCursor,
      nextCursor: 'cursor:next',
    });
  });

  it('rejects replay operation queries that mix page and cursor pagination', async () => {
    await expect(
      service.listReplayOperations({
        page: 1,
        cursor: 'cursor:start',
      }),
    ).rejects.toThrow(
      'Replay operation listing does not accept page and cursor together',
    );
    expect((auditService as any).listAllPaged).not.toHaveBeenCalled();
    expect((auditService as any).listAllCursor).not.toHaveBeenCalled();
  });

  it('rejects malformed replay operation cursors', async () => {
    await expect(
      service.listReplayOperations({
        cursor: 'not-a-valid-replay-cursor',
      }),
    ).rejects.toThrow('Invalid procurement webhook replay operations cursor');
    expect((auditService as any).listAllPaged).not.toHaveBeenCalled();
    expect((auditService as any).listAllCursor).not.toHaveBeenCalled();
  });

  it('rejects replay operation queries with inverted date ranges', async () => {
    await expect(
      service.listReplayOperations({
        from: '2026-03-21T00:00:00.000Z',
        to: '2026-03-20T00:00:00.000Z',
      }),
    ).rejects.toThrow(
      'Procurement webhook audit filters require from to be earlier than or equal to to',
    );

    expect((auditService as any).listAllPaged).not.toHaveBeenCalled();
    expect((auditService as any).listAllCursor).not.toHaveBeenCalled();
  });

  it('builds a webhook health summary with retry-state counts and recent terminal failures', async () => {
    (auditService as any).listForTargets.mockResolvedValue([
      {
        targetId: 11,
        action: 'procurement_webhook_subscription.auto_paused',
        meta: {
          triggerDeliveryId: 3,
          terminalFailureCount: 3,
          threshold: 3,
          thresholdWindowHours: 24,
        },
        createdAt: new Date('2026-03-20T12:00:00.000Z'),
      },
    ]);
    subscriptionsRepository.find.mockResolvedValue([
      {
        id: 10,
        name: 'ERP Feed',
        status: ProcurementWebhookSubscriptionStatus.ACTIVE,
      },
      {
        id: 11,
        name: 'Ops Feed',
        status: ProcurementWebhookSubscriptionStatus.PAUSED,
      },
    ] as ProcurementWebhookSubscription[]);
    deliveriesRepository.find.mockResolvedValue([
      {
        id: 1,
        subscriptionId: 10,
        subscription: { id: 10, name: 'ERP Feed' },
        eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
        eventKey: 'po:1',
        requestUrl: 'https://partner.example.com/po',
        requestHeaders: {},
        requestBody: {},
        status: ProcurementWebhookDeliveryStatus.SUCCEEDED,
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredAt: new Date(),
      },
      {
        id: 2,
        subscriptionId: 10,
        subscription: { id: 10, name: 'ERP Feed' },
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: 'intervention:2',
        requestUrl: 'https://partner.example.com/intervention',
        requestHeaders: {},
        requestBody: {},
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 2,
        nextRetryAt: new Date(Date.now() - 60 * 1000),
        finalFailureAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredAt: new Date(),
      },
      {
        id: 3,
        subscriptionId: 11,
        subscription: { id: 11, name: 'Ops Feed' },
        eventType: ProcurementWebhookEventType.RECEIPT_DISCREPANCY_APPROVED,
        eventKey: 'receipt:3',
        requestUrl: 'https://partner.example.com/receipt',
        requestHeaders: {},
        requestBody: {},
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredAt: new Date(),
        errorMessage: 'still failing',
      },
      {
        id: 4,
        subscriptionId: 10,
        subscription: { id: 10, name: 'ERP Feed' },
        eventType: ProcurementWebhookEventType.RECEIPT_DISCREPANCY_RESOLVED,
        eventKey: 'receipt:4',
        requestUrl: 'https://partner.example.com/receipt',
        requestHeaders: {},
        requestBody: {},
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 1,
        nextRetryAt: new Date(Date.now() + 60 * 60 * 1000),
        finalFailureAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredAt: new Date(),
      },
    ] as ProcurementWebhookDelivery[]);

    const result = await service.getHealthSummary();

    expect(result).toEqual(
      expect.objectContaining({
        autoPauseThreshold: 3,
        autoPauseThresholdWindowHours: 24,
        activeSubscriptionCount: 1,
        pausedSubscriptionCount: 1,
        autoPausedSubscriptionCount: 1,
        totalDeliveryCount: 4,
        succeededDeliveryCount: 1,
        failedDeliveryCount: 3,
        retryEligibleCount: 1,
        retryScheduledCount: 1,
        terminalFailureCount: 1,
        deliveriesLast24Hours: 4,
        terminalFailuresLast24Hours: 1,
        successRateLast24Hours: 25,
        averageAttemptsForTerminalFailures: 4,
        severityCounts: [
          {
            severity: ProcurementWebhookResumeRiskSeverity.LOW,
            count: 1,
          },
          {
            severity: ProcurementWebhookResumeRiskSeverity.WATCH,
            count: 1,
          },
          {
            severity:
              ProcurementWebhookResumeRiskSeverity.FORCE_RESUME_REQUIRED,
            count: 0,
          },
        ],
        severityTrendDeltas: [
          {
            severity: ProcurementWebhookResumeRiskSeverity.LOW,
            currentCount: 1,
            currentPercentage: 50,
            previousCount: 2,
            previousPercentage: 100,
            delta: -1,
            deltaPercentage: -50,
            trendDirection: ProcurementWebhookHealthTrendDirection.DOWN,
          },
          {
            severity: ProcurementWebhookResumeRiskSeverity.WATCH,
            currentCount: 1,
            currentPercentage: 50,
            previousCount: 0,
            previousPercentage: 0,
            delta: 1,
            deltaPercentage: 50,
            trendDirection: ProcurementWebhookHealthTrendDirection.UP,
          },
          {
            severity:
              ProcurementWebhookResumeRiskSeverity.FORCE_RESUME_REQUIRED,
            currentCount: 0,
            currentPercentage: 0,
            previousCount: 0,
            previousPercentage: 0,
            delta: 0,
            deltaPercentage: 0,
            trendDirection: ProcurementWebhookHealthTrendDirection.FLAT,
          },
        ],
        topRiskSubscriptions: [
          {
            subscriptionId: 11,
            subscriptionName: 'Ops Feed',
            status: ProcurementWebhookSubscriptionStatus.PAUSED,
            severity: ProcurementWebhookResumeRiskSeverity.WATCH,
            recentTerminalFailureCount: 1,
            threshold: 3,
            thresholdWindowHours: 24,
            route: '/admin/b2b/procurement-webhooks?subscriptionId=11',
            terminalFailuresRoute:
              '/admin/b2b/procurement-webhooks/deliveries?subscriptionId=11&retryState=TERMINAL_FAILURE',
          },
          {
            subscriptionId: 10,
            subscriptionName: 'ERP Feed',
            status: ProcurementWebhookSubscriptionStatus.ACTIVE,
            severity: ProcurementWebhookResumeRiskSeverity.LOW,
            recentTerminalFailureCount: 0,
            threshold: 3,
            thresholdWindowHours: 24,
            route: '/admin/b2b/procurement-webhooks?subscriptionId=10',
            terminalFailuresRoute:
              '/admin/b2b/procurement-webhooks/deliveries?subscriptionId=10&retryState=TERMINAL_FAILURE',
          },
        ],
        recentTerminalFailures: [
          expect.objectContaining({
            id: 3,
            eventType: ProcurementWebhookEventType.RECEIPT_DISCREPANCY_APPROVED,
            subscriptionName: 'Ops Feed',
          }),
        ],
        recentAutoPausedSubscriptions: [
          expect.objectContaining({
            subscriptionId: 11,
            subscriptionName: 'Ops Feed',
            triggerDeliveryId: 3,
            terminalFailureCount: 3,
            threshold: 3,
            thresholdWindowHours: 24,
          }),
        ],
      }),
    );
    expect(result.eventTypeCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
          count: 1,
        }),
        expect.objectContaining({
          eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
          count: 1,
        }),
        expect.objectContaining({
          eventType: ProcurementWebhookEventType.RECEIPT_DISCREPANCY_RESOLVED,
          count: 1,
        }),
        expect.objectContaining({
          eventType: ProcurementWebhookEventType.RECEIPT_DISCREPANCY_APPROVED,
          count: 1,
        }),
      ]),
    );
  });

  it('bulk replays terminal failures and audits the batch', async () => {
    deliveriesRepository.find.mockResolvedValue([
      {
        id: 90,
        subscriptionId: 10,
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: 'intervention:7:3:assign',
        requestUrl: 'https://partner.example.com/hooks/procurement',
        requestHeaders: {},
        requestBody: { supplierProfileId: 7, branchId: 3 },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: null,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: new Date('2026-03-20T10:00:00.000Z'),
        createdAt: new Date('2026-03-20T09:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        subscription: {
          id: 10,
          name: 'ERP Feed',
          endpointUrl: 'https://partner.example.com/hooks/procurement',
          signingSecret: 'top-secret-key',
          eventTypes: [ProcurementWebhookEventType.INTERVENTION_UPDATED],
          status: ProcurementWebhookSubscriptionStatus.ACTIVE,
        },
      },
      {
        id: 91,
        subscriptionId: 11,
        eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
        eventKey: 'po:91:status',
        requestUrl: 'https://partner.example.com/hooks/missing',
        requestHeaders: {},
        requestBody: { purchaseOrderId: 91 },
        branchId: 3,
        supplierProfileId: 7,
        purchaseOrderId: 91,
        status: ProcurementWebhookDeliveryStatus.FAILED,
        attemptCount: 4,
        nextRetryAt: null,
        finalFailureAt: new Date('2026-03-20T11:00:00.000Z'),
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T11:00:00.000Z'),
        subscription: null,
      },
    ] as ProcurementWebhookDelivery[]);
    (axios.post as jest.Mock).mockResolvedValue({
      status: 200,
      data: { ok: true },
    });

    const result = await service.replayTerminalFailures(
      {
        deliveryIds: [90, 91],
        limit: 10,
        note: 'Replay specific failed deliveries after vendor confirmation',
      },
      { id: 7, email: 'ops@example.com' },
    );

    expect(result).toEqual(
      expect.objectContaining({
        requestedCount: 2,
        matchedTerminalFailureCount: 2,
        replayedCount: 1,
        skippedCount: 1,
        skippedDeliveryIds: [91],
        replayedDeliveries: [
          expect.objectContaining({
            replayedFromDeliveryId: 90,
            subscriptionName: 'ERP Feed',
          }),
        ],
      }),
    );
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'procurement_webhook_delivery.replay',
        actorId: 7,
        actorEmail: 'ops@example.com',
        reason: 'Replay specific failed deliveries after vendor confirmation',
        meta: expect.objectContaining({
          replayedFromDeliveryId: 90,
          replayMode: 'BULK_TERMINAL_FAILURE_REPLAY',
          replayExecutionMode: 'EXPLICIT_DELIVERY_IDS',
        }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'procurement_webhook_delivery.bulk_replay_terminal_failures',
        actorId: 7,
        actorEmail: 'ops@example.com',
        reason: 'Replay specific failed deliveries after vendor confirmation',
        meta: expect.objectContaining({
          requestedCount: 2,
          matchedTerminalFailureCount: 2,
          replayedCount: 1,
          skippedCount: 1,
          skippedDeliveryIds: [91],
          replayExecutionMode: 'EXPLICIT_DELIVERY_IDS',
        }),
      }),
    );
  });
});

describe('ProcurementWebhooksCronService', () => {
  it('delegates retry scans to the procurement webhook service', async () => {
    const procurementWebhooksService = {
      retryFailedDeliveries: jest
        .fn()
        .mockResolvedValue({ attempted: 2, succeeded: 1, failed: 1 }),
    };
    const service = new ProcurementWebhooksCronService(
      procurementWebhooksService as any,
    );

    await service.retryFailedProcurementWebhookDeliveries();

    expect(procurementWebhooksService.retryFailedDeliveries).toHaveBeenCalled();
  });
});
