import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../src/auth/roles.guard';
import { ProcurementWebhooksController } from '../src/procurement-webhooks/procurement-webhooks.controller';
import { ProcurementWebhooksService } from '../src/procurement-webhooks/procurement-webhooks.service';

describe('ProcurementWebhooksController admin routes (e2e)', () => {
  let app: INestApplication;
  let procurementWebhooksService: {
    listSubscriptionRemediationActions: jest.Mock;
    getReplayOperationsSummary: jest.Mock;
    exportReplayOperationsSummaryCsv: jest.Mock;
    exportReplayOperationsCsv: jest.Mock;
    listReplayOperations: jest.Mock;
  };

  beforeAll(async () => {
    procurementWebhooksService = {
      listSubscriptionRemediationActions: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 15,
        totalPages: 0,
        appliedCursor: null,
        nextCursor: null,
      }),
      getReplayOperationsSummary: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-21T00:00:00.000Z',
        totalReplayOperationCount: 9,
        previewConfirmedReplayCount: 4,
        singleDeliveryReplayCount: 2,
        explicitDeliveryReplayCount: 1,
        filteredPageReplayCount: 2,
        previewConfirmedPageReplayCount: 4,
        bulkTerminalFailureReplayCount: 5,
        previewConfirmedBulkTerminalFailureReplayCount: 3,
      }),
      exportReplayOperationsSummaryCsv: jest
        .fn()
        .mockResolvedValue(
          'generatedAt,subscriptionId,actorId,actorEmail,from,to,totalReplayOperationCount,previewConfirmedReplayCount,singleDeliveryReplayCount,explicitDeliveryReplayCount,filteredPageReplayCount,previewConfirmedPageReplayCount,bulkTerminalFailureReplayCount,previewConfirmedBulkTerminalFailureReplayCount\n2026-03-21T00:00:00.000Z,12,7,"admin@test.com","2026-03-20T00:00:00.000Z","2026-03-21T00:00:00.000Z",9,4,2,1,2,4,5,3',
        ),
      exportReplayOperationsCsv: jest
        .fn()
        .mockResolvedValue(
          'subscriptionId,subscriptionName,route,action,summary,createdAt,actorId,actorEmail,reason,note,replayScope,replayExecutionMode,previewConfirmed,requestedCount,matchedTerminalFailureCount,replayedCount,skippedCount,previewCursor,previewMatchedTerminalFailureCount,previewConfirmationIssuedAt,previewConfirmationExpiresAt\n12,"ERP Feed","/admin/b2b/procurement-webhooks?subscriptionId=12","procurement_webhook_subscription.replay_operation","Bulk replayed a preview-confirmed terminal failure page","2026-03-20T10:45:00.000Z",9,"admin@test.com","Partner endpoint fixed","Partner endpoint fixed","BULK_TERMINAL_FAILURES","PREVIEW_CONFIRMED_PAGE",true,2,2,2,0,"",2,"2026-03-20T10:42:00.000Z","2026-03-20T11:12:00.000Z"',
        ),
      listReplayOperations: jest.fn().mockResolvedValue({
        items: [],
        total: null,
        page: null,
        perPage: 20,
        totalPages: null,
        appliedCursor: 'opaque-replay-cursor',
        nextCursor: null,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProcurementWebhooksController],
      providers: [
        {
          provide: ProcurementWebhooksService,
          useValue: procurementWebhooksService,
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 7, email: 'admin@test.com', roles: ['ADMIN'] };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves remediation actions over HTTP with transformed query parameters', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions?actionType=REPLAY_OPERATION&previewConfirmed=true&limit=15',
      )
      .expect(200);

    expect(
      procurementWebhooksService.listSubscriptionRemediationActions,
    ).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        actionType: 'REPLAY_OPERATION',
        previewConfirmed: true,
        limit: 15,
      }),
    );
  });

  it('returns remediation cursor pages over HTTP', async () => {
    procurementWebhooksService.listSubscriptionRemediationActions.mockResolvedValueOnce(
      {
        items: [
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
        total: null,
        page: null,
        perPage: 10,
        totalPages: null,
        appliedCursor: 'opaque-remediation-cursor',
        nextCursor: 'next-remediation-cursor',
      },
    );

    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions?cursor=opaque-remediation-cursor&limit=10',
      )
      .expect(200);

    expect(response.body.appliedCursor).toBe('opaque-remediation-cursor');
    expect(response.body.nextCursor).toBe('next-remediation-cursor');
    expect(response.body.items[0].summary).toBe(
      'Auto-paused after repeated terminal failures',
    );
  });

  it('returns HTTP 400 for malformed remediation cursors', async () => {
    procurementWebhooksService.listSubscriptionRemediationActions.mockRejectedValueOnce(
      new BadRequestException(
        'Invalid procurement webhook replay operations cursor',
      ),
    );

    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions?cursor=not-a-valid-remediation-cursor',
      )
      .expect(400);

    expect(response.body.message).toBe(
      'Invalid procurement webhook replay operations cursor',
    );
  });

  it('returns HTTP 400 when remediation actions mix page and cursor pagination', async () => {
    procurementWebhooksService.listSubscriptionRemediationActions.mockRejectedValueOnce(
      new BadRequestException(
        'Subscription remediation action listing does not accept page and cursor together',
      ),
    );

    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/subscriptions/12/remediation-actions?page=1&cursor=opaque-remediation-cursor',
      )
      .expect(400);

    expect(response.body.message).toBe(
      'Subscription remediation action listing does not accept page and cursor together',
    );
  });

  it('returns HTTP 400 for malformed replay-operation cursors', async () => {
    procurementWebhooksService.listReplayOperations.mockRejectedValueOnce(
      new BadRequestException(
        'Invalid procurement webhook replay operations cursor',
      ),
    );

    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/replay-operations?cursor=not-a-valid-replay-cursor',
      )
      .expect(400);

    expect(response.body.message).toBe(
      'Invalid procurement webhook replay operations cursor',
    );
  });

  it('returns replay-operation cursor pages over HTTP', async () => {
    procurementWebhooksService.listReplayOperations.mockResolvedValueOnce({
      items: [
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
          subscriptionId: 12,
          subscriptionName: 'ERP Feed',
          route: '/admin/b2b/procurement-webhooks?subscriptionId=12',
        },
      ],
      total: null,
      page: null,
      perPage: 20,
      totalPages: null,
      appliedCursor: 'opaque-replay-cursor',
      nextCursor: 'next-replay-cursor',
    });

    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/replay-operations?cursor=opaque-replay-cursor&limit=20',
      )
      .expect(200);

    expect(response.body.appliedCursor).toBe('opaque-replay-cursor');
    expect(response.body.nextCursor).toBe('next-replay-cursor');
    expect(response.body.items[0].subscriptionName).toBe('ERP Feed');
  });

  it('serves replay governance summary over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/replay-operations/summary?subscriptionId=12&actorEmail=admin@test.com',
      )
      .expect(200);

    expect(
      procurementWebhooksService.getReplayOperationsSummary,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 12,
        actorEmail: 'admin@test.com',
      }),
    );
    expect(response.body.totalReplayOperationCount).toBe(9);
    expect(response.body.previewConfirmedBulkTerminalFailureReplayCount).toBe(
      3,
    );
  });

  it('serves replay governance summary filtered by actorId and a lower date bound', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/replay-operations/summary?actorId=7&from=2026-03-20T00:00:00.000Z',
      )
      .expect(200);

    expect(
      procurementWebhooksService.getReplayOperationsSummary,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 7,
        from: '2026-03-20T00:00:00.000Z',
      }),
    );
    expect(response.body.previewConfirmedReplayCount).toBe(4);
  });

  it('serves replay governance summary filtered by actorId and an upper date bound', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/replay-operations/summary?actorId=7&to=2026-03-21T00:00:00.000Z',
      )
      .expect(200);

    expect(
      procurementWebhooksService.getReplayOperationsSummary,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 7,
        to: '2026-03-21T00:00:00.000Z',
      }),
    );
    expect(response.body.bulkTerminalFailureReplayCount).toBe(5);
  });

  it('exports replay governance summary CSV over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/replay-operations/summary/export?subscriptionId=12&actorId=7&actorEmail=admin@test.com&from=2026-03-20T00:00:00.000Z&to=2026-03-21T00:00:00.000Z',
      )
      .expect(200);

    expect(
      procurementWebhooksService.exportReplayOperationsSummaryCsv,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 12,
        actorId: 7,
        actorEmail: 'admin@test.com',
        from: '2026-03-20T00:00:00.000Z',
        to: '2026-03-21T00:00:00.000Z',
      }),
    );
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain(
      'generatedAt,subscriptionId,actorId,actorEmail',
    );
    expect(response.text).toContain('2026-03-21T00:00:00.000Z,12,7');
  });

  it('exports replay operations CSV over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/replay-operations/export?subscriptionId=12&actorId=9&previewConfirmed=true',
      )
      .expect(200);

    expect(
      procurementWebhooksService.exportReplayOperationsCsv,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 12,
        actorId: 9,
        previewConfirmed: true,
      }),
    );
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain(
      'subscriptionId,subscriptionName,route,action',
    );
    expect(response.text).toContain('12,"ERP Feed"');
  });

  it('returns HTTP 400 for invalid replay summary actor emails', async () => {
    const callCountBefore =
      procurementWebhooksService.getReplayOperationsSummary.mock.calls.length;

    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/replay-operations/summary?actorEmail=not-an-email',
      )
      .expect(400);

    expect(response.body.message).toContain('actorEmail must be an email');
    expect(
      procurementWebhooksService.getReplayOperationsSummary.mock.calls.length,
    ).toBe(callCountBefore);
  });

  it('returns HTTP 400 for inverted replay summary date ranges', async () => {
    procurementWebhooksService.getReplayOperationsSummary.mockRejectedValueOnce(
      new BadRequestException(
        'Procurement webhook audit filters require from to be earlier than or equal to to',
      ),
    );

    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/replay-operations/summary?from=2026-03-21T00:00:00.000Z&to=2026-03-20T00:00:00.000Z',
      )
      .expect(400);

    expect(response.body.message).toBe(
      'Procurement webhook audit filters require from to be earlier than or equal to to',
    );
  });

  it('returns HTTP 400 when replay operations mix page and cursor pagination', async () => {
    procurementWebhooksService.listReplayOperations.mockRejectedValueOnce(
      new BadRequestException(
        'Replay operation listing does not accept page and cursor together',
      ),
    );

    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/procurement-webhooks/replay-operations?page=1&cursor=opaque-replay-cursor',
      )
      .expect(400);

    expect(response.body.message).toBe(
      'Replay operation listing does not accept page and cursor together',
    );
  });
});
