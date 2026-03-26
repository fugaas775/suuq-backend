import { Test, TestingModule } from '@nestjs/testing';
import { ProcurementWebhooksController } from './procurement-webhooks.controller';
import { ProcurementWebhooksService } from './procurement-webhooks.service';
import {
  ProcurementWebhookEventType,
  ProcurementWebhookSubscriptionStatus,
} from './entities/procurement-webhook-subscription.entity';

describe('ProcurementWebhooksController', () => {
  let controller: ProcurementWebhooksController;
  let procurementWebhooksService: {
    createSubscription: jest.Mock;
    listSubscriptions: jest.Mock;
    getSubscriptionDetail: jest.Mock;
    listSubscriptionRemediationActions: jest.Mock;
    updateSubscriptionStatus: jest.Mock;
    listDeliveries: jest.Mock;
    getReplayOperationsSummary: jest.Mock;
    exportReplayOperationsSummaryCsv: jest.Mock;
    exportReplayOperationsCsv: jest.Mock;
    listReplayOperations: jest.Mock;
    getHealthSummary: jest.Mock;
    previewReplayTerminalFailures: jest.Mock;
    replayTerminalFailures: jest.Mock;
    replayDelivery: jest.Mock;
  };

  beforeEach(async () => {
    procurementWebhooksService = {
      createSubscription: jest.fn(),
      listSubscriptions: jest.fn(),
      getSubscriptionDetail: jest.fn(),
      listSubscriptionRemediationActions: jest.fn(),
      updateSubscriptionStatus: jest.fn(),
      listDeliveries: jest.fn(),
      getReplayOperationsSummary: jest.fn(),
      exportReplayOperationsSummaryCsv: jest.fn(),
      exportReplayOperationsCsv: jest.fn(),
      listReplayOperations: jest.fn(),
      getHealthSummary: jest.fn(),
      previewReplayTerminalFailures: jest.fn(),
      replayTerminalFailures: jest.fn(),
      replayDelivery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcurementWebhooksController],
      providers: [
        {
          provide: ProcurementWebhooksService,
          useValue: procurementWebhooksService,
        },
      ],
    }).compile();

    controller = module.get(ProcurementWebhooksController);
  });

  it('creates subscriptions with actor metadata from the request user', async () => {
    procurementWebhooksService.createSubscription.mockResolvedValue({
      id: 4,
      name: 'ERP Feed',
    });

    await controller.createSubscription(
      {
        name: 'ERP Feed',
        endpointUrl: 'https://partner.example.com/webhooks/procurement',
        signingSecret: 'super-secret-key',
        eventTypes: [
          ProcurementWebhookEventType.INTERVENTION_UPDATED,
          ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
        ],
      },
      {
        user: {
          id: 9,
          email: 'admin@example.com',
        },
      },
    );

    expect(procurementWebhooksService.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ERP Feed' }),
      { id: 9, email: 'admin@example.com' },
    );
  });

  it('delegates subscription status updates and replay requests', async () => {
    await controller.updateSubscriptionStatus(
      12,
      {
        status: ProcurementWebhookSubscriptionStatus.PAUSED,
        forceResume: false,
        note: 'Maintenance window',
      },
      { user: { id: 7, email: 'ops@example.com' } },
    );
    await controller.replayDelivery(
      44,
      { note: 'Replayed after vendor fix' },
      {
        user: { id: 7, email: 'ops@example.com' },
      },
    );

    expect(
      procurementWebhooksService.updateSubscriptionStatus,
    ).toHaveBeenCalledWith(
      12,
      {
        status: ProcurementWebhookSubscriptionStatus.PAUSED,
        forceResume: false,
        note: 'Maintenance window',
      },
      { id: 7, email: 'ops@example.com' },
    );
    expect(procurementWebhooksService.replayDelivery).toHaveBeenCalledWith(
      44,
      { note: 'Replayed after vendor fix' },
      {
        id: 7,
        email: 'ops@example.com',
      },
    );
  });

  it('delegates bulk terminal failure replays with actor context', async () => {
    await controller.replayTerminalFailures(
      {
        deliveryIds: [90, 91],
        subscriptionId: 12,
        previewConfirmationToken: 'preview-token',
        limit: 10,
      },
      { user: { id: 7, email: 'ops@example.com' } },
    );

    expect(
      procurementWebhooksService.replayTerminalFailures,
    ).toHaveBeenCalledWith(
      {
        deliveryIds: [90, 91],
        subscriptionId: 12,
        previewConfirmationToken: 'preview-token',
        limit: 10,
      },
      { id: 7, email: 'ops@example.com' },
    );
  });

  it('delegates replay preview requests unchanged', async () => {
    await controller.previewReplayTerminalFailures({
      deliveryIds: [90, 91],
      subscriptionId: 12,
      cursor: 'opaque-cursor',
      limit: 10,
    });

    expect(
      procurementWebhooksService.previewReplayTerminalFailures,
    ).toHaveBeenCalledWith({
      deliveryIds: [90, 91],
      subscriptionId: 12,
      cursor: 'opaque-cursor',
      limit: 10,
    });
  });

  it('delegates list endpoints unchanged', async () => {
    const subscriptionQuery = {
      page: 2,
      limit: 10,
      forceResumeRequired: true,
      sortByFailurePressure: true,
      severity: 'FORCE_RESUME_REQUIRED',
    };
    const deliveryQuery = { page: 1, limit: 25 };
    const replayOperationQuery = {
      limit: 20,
      subscriptionId: 12,
      cursor: 'opaque-replay-cursor',
      replayExecutionMode: 'PREVIEW_CONFIRMED_PAGE',
      previewConfirmed: true,
    };
    const replaySummaryQuery = {
      subscriptionId: 12,
      actorEmail: 'admin@example.com',
    };

    await controller.listSubscriptions(subscriptionQuery);
    await controller.listDeliveries(deliveryQuery);
    await controller.getReplayOperationsSummary(replaySummaryQuery as any);
    await controller.listReplayOperations(replayOperationQuery);
    await controller.getHealthSummary();

    expect(procurementWebhooksService.listSubscriptions).toHaveBeenCalledWith(
      subscriptionQuery,
    );
    expect(procurementWebhooksService.listDeliveries).toHaveBeenCalledWith(
      deliveryQuery,
    );
    expect(
      procurementWebhooksService.getReplayOperationsSummary,
    ).toHaveBeenCalledWith(replaySummaryQuery);
    expect(
      procurementWebhooksService.listReplayOperations,
    ).toHaveBeenCalledWith(replayOperationQuery);
    expect(procurementWebhooksService.getHealthSummary).toHaveBeenCalled();
  });

  it('delegates subscription detail reads unchanged', async () => {
    await controller.getSubscriptionDetail(12);

    expect(
      procurementWebhooksService.getSubscriptionDetail,
    ).toHaveBeenCalledWith(12);
  });

  it('delegates subscription remediation action listing unchanged', async () => {
    const query = {
      cursor: 'opaque-remediation-cursor',
      actionType: 'REPLAY_OPERATION',
      previewConfirmed: true,
      limit: 15,
    };

    await controller.listSubscriptionRemediationActions(12, query as any);

    expect(
      procurementWebhooksService.listSubscriptionRemediationActions,
    ).toHaveBeenCalledWith(12, query);
  });

  it('exports replay governance summaries as CSV', async () => {
    procurementWebhooksService.exportReplayOperationsSummaryCsv.mockResolvedValue(
      'generatedAt,totalReplayOperationCount\n2026-03-21T00:00:00.000Z,9',
    );
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.exportReplayOperationsSummary(res, {
      subscriptionId: 12,
      actorId: 7,
      from: '2026-03-20T00:00:00.000Z',
    } as any);

    expect(
      procurementWebhooksService.exportReplayOperationsSummaryCsv,
    ).toHaveBeenCalledWith({
      subscriptionId: 12,
      actorId: 7,
      from: '2026-03-20T00:00:00.000Z',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('procurement_webhook_replay_governance_summary_'),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'generatedAt,totalReplayOperationCount\n2026-03-21T00:00:00.000Z,9',
    );
  });

  it('exports replay operations as CSV', async () => {
    procurementWebhooksService.exportReplayOperationsCsv.mockResolvedValue(
      'subscriptionId,subscriptionName\n12,"ERP Feed"',
    );
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.exportReplayOperations(res, {
      subscriptionId: 12,
      actorId: 7,
      previewConfirmed: true,
    } as any);

    expect(
      procurementWebhooksService.exportReplayOperationsCsv,
    ).toHaveBeenCalledWith({
      subscriptionId: 12,
      actorId: 7,
      previewConfirmed: true,
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('procurement_webhook_replay_operations_'),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'subscriptionId,subscriptionName\n12,"ERP Feed"',
    );
  });
});
