import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../src/auth/roles.guard';
import { AuditService } from '../src/audit/audit.service';
import { AdminB2bController } from '../src/admin/b2b.admin.controller';
import { AdminB2bService } from '../src/admin/b2b.admin.service';
import { PartnerCredentialsService } from '../src/partner-credentials/partner-credentials.service';
import { PurchaseOrdersService } from '../src/purchase-orders/purchase-orders.service';
import { SuppliersService } from '../src/suppliers/suppliers.service';

describe('AdminB2bController operations audit (e2e)', () => {
  let app: INestApplication;
  let adminB2bService: {
    reevaluateAutoReplenishmentDraft: jest.Mock;
    listPurchaseOrders: jest.Mock;
    listBranchTransfers: jest.Mock;
    getBranchTransfer: jest.Mock;
    listBranchInventory: jest.Mock;
    listStockMovements: jest.Mock;
    listPurchaseOrderReceiptEvents: jest.Mock;
    listPosSyncJobs: jest.Mock;
    getPosSyncJob: jest.Mock;
  };
  let purchaseOrdersService: {
    approveReceiptEventDiscrepancy: jest.Mock;
    forceCloseReceiptEventDiscrepancy: jest.Mock;
  };
  let auditService: {
    listForTarget: jest.Mock;
  };

  beforeAll(async () => {
    adminB2bService = {
      reevaluateAutoReplenishmentDraft: jest.fn().mockResolvedValue({
        id: 42,
        orderNumber: 'PO-AR-42',
        branchId: 3,
        supplierProfileId: 14,
        status: 'SUBMITTED',
        currency: 'USD',
        subtotal: 125,
        total: 125,
        expectedDeliveryDate: '2026-03-20',
        statusMeta: {
          autoReplenishment: true,
          autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
          lastAutoSubmissionAttempt: {
            eligible: true,
            blockedReason: null,
            at: '2026-03-18T10:00:00.000Z',
          },
        },
        autoReplenishmentStatus: {
          isAutoReplenishment: true,
          submissionMode: 'AUTO_SUBMIT',
          lastAttemptEligible: true,
          lastAttemptBlockedReason: null,
          lastAttemptAt: '2026-03-18T10:00:00.000Z',
          preferredSupplierProfileId: null,
          minimumOrderTotal: null,
          orderWindow: null,
        },
        purchaseOrderActions: [],
        reevaluationOutcome: {
          previousStatus: 'DRAFT',
          nextStatus: 'SUBMITTED',
          previousBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
          nextBlockedReason: null,
          actionTaken: 'SUBMITTED',
        },
        items: [],
        createdAt: '2026-03-18T09:00:00.000Z',
        updatedAt: '2026-03-18T10:00:00.000Z',
      }),
      listPurchaseOrders: jest.fn().mockResolvedValue({
        summary: {
          totalPurchaseOrders: 1,
          autoReplenishmentCount: 1,
          autoSubmitDraftCount: 1,
          blockedAutoSubmitDraftCount: 1,
          readyAutoSubmitDraftCount: 0,
          blockedReasonBreakdown: [
            {
              reason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
              count: 1,
            },
          ],
        },
        items: [
          {
            id: 77,
            orderNumber: 'PO-77',
            status: 'DRAFT',
            purchaseOrderActions: [
              {
                type: 'RE_EVALUATE_AUTO_REPLENISHMENT',
                method: 'PATCH',
                path: '/admin/b2b/purchase-orders/77/re-evaluate-auto-replenishment',
                query: null,
                enabled: true,
              },
            ],
          },
        ],
        total: 1,
        page: 2,
        perPage: 10,
        totalPages: 1,
      }),
      listBranchTransfers: jest.fn().mockResolvedValue({
        items: [
          {
            id: 301,
            transferNumber: 'TR-301',
            status: 'DISPATCHED',
            fromBranchId: 3,
            toBranchId: 8,
          },
        ],
        total: 1,
        page: 2,
        perPage: 10,
        totalPages: 1,
      }),
      getBranchTransfer: jest.fn().mockResolvedValue({
        id: 301,
        transferNumber: 'TR-301',
        status: 'DISPATCHED',
        fromBranchId: 3,
        toBranchId: 8,
        items: [],
      }),
      listBranchInventory: jest.fn().mockResolvedValue({
        items: [
          {
            id: 401,
            branchId: 3,
            productId: 9,
            quantityOnHand: 22,
          },
        ],
        total: 1,
        page: 2,
        perPage: 25,
        totalPages: 1,
      }),
      listStockMovements: jest.fn().mockResolvedValue({
        items: [
          {
            id: 201,
            branchId: 3,
            productId: 9,
            movementType: 'PURCHASE_RECEIPT',
            quantityDelta: 12,
          },
        ],
        total: 1,
        page: 1,
        perPage: 25,
        totalPages: 1,
      }),
      listPurchaseOrderReceiptEvents: jest.fn().mockResolvedValue({
        items: [
          {
            id: 901,
            purchaseOrderId: 42,
            status: 'RECEIVED',
            createdAt: '2026-03-18T11:00:00.000Z',
          },
        ],
        total: 1,
        page: 2,
        perPage: 10,
        totalPages: 1,
      }),
      listPosSyncJobs: jest.fn().mockResolvedValue({
        items: [
          {
            id: 51,
            branchId: 3,
            partnerCredentialId: 12,
            syncType: 'STOCK_DELTA',
            status: 'FAILED',
            rejectedCount: 2,
            failedEntries: [{ entryIndex: 1, error: 'alias missing' }],
          },
        ],
        total: 1,
        page: 2,
        perPage: 15,
        totalPages: 1,
      }),
      getPosSyncJob: jest.fn().mockResolvedValue({
        id: 51,
        branchId: 3,
        partnerCredentialId: 12,
        syncType: 'STOCK_DELTA',
        status: 'FAILED',
        rejectedCount: 2,
        failedEntries: [{ entryIndex: 1, error: 'alias missing' }],
      }),
    };

    purchaseOrdersService = {
      approveReceiptEventDiscrepancy: jest.fn().mockResolvedValue({
        purchaseOrderId: 42,
        eventId: 8,
        status: 'APPROVED',
      }),
      forceCloseReceiptEventDiscrepancy: jest.fn().mockResolvedValue({
        purchaseOrderId: 42,
        eventId: 8,
        status: 'FORCE_CLOSED',
      }),
    };

    auditService = {
      listForTarget: jest.fn().mockResolvedValue([
        {
          id: 701,
          targetType: 'PURCHASE_ORDER',
          targetId: 42,
          action: 'STATUS_CHANGED',
        },
      ]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminB2bController],
      providers: [
        {
          provide: AdminB2bService,
          useValue: adminB2bService,
        },
        {
          provide: SuppliersService,
          useValue: {},
        },
        {
          provide: PartnerCredentialsService,
          useValue: {},
        },
        {
          provide: PurchaseOrdersService,
          useValue: purchaseOrdersService,
        },
        {
          provide: AuditService,
          useValue: auditService,
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

  it('lists purchase orders filtered for admin auto-replenishment review', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/purchase-orders')
      .query({
        branchId: '3',
        status: 'DRAFT',
        autoReplenishment: 'true',
        autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
        autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
        page: '2',
        limit: '10',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        perPage: 10,
        items: [
          expect.objectContaining({
            id: 77,
            purchaseOrderActions: [
              expect.objectContaining({
                type: 'RE_EVALUATE_AUTO_REPLENISHMENT',
              }),
            ],
          }),
        ],
      }),
    );
    expect(adminB2bService.listPurchaseOrders).toHaveBeenCalledWith({
      branchId: 3,
      status: 'DRAFT',
      autoReplenishment: true,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      page: 2,
      limit: 10,
    });
  });

  it('lists persisted branch transfers for admin review', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/branch-transfers')
      .query({
        fromBranchId: '3',
        toBranchId: '8',
        status: 'DISPATCHED',
        page: '2',
        limit: '10',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        total: 1,
        items: [expect.objectContaining({ id: 301, transferNumber: 'TR-301' })],
      }),
    );
    expect(adminB2bService.listBranchTransfers).toHaveBeenCalledWith({
      fromBranchId: 3,
      toBranchId: 8,
      status: 'DISPATCHED',
      page: 2,
      limit: 10,
    });
  });

  it('returns a branch transfer document', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/branch-transfers/301')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 301,
        transferNumber: 'TR-301',
        status: 'DISPATCHED',
      }),
    );
    expect(adminB2bService.getBranchTransfer).toHaveBeenCalledWith(301);
  });

  it('lists branch inventory with typed query filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/branch-inventory')
      .query({ branchId: '3', productId: '9', page: '2', limit: '25' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        perPage: 25,
        items: [
          expect.objectContaining({ id: 401, branchId: 3, productId: 9 }),
        ],
      }),
    );
    expect(adminB2bService.listBranchInventory).toHaveBeenCalledWith({
      branchId: 3,
      productId: 9,
      page: 2,
      limit: 25,
    });
  });

  it('lists stock movements with typed query filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/stock-movements')
      .query({
        branchId: '3',
        productId: '9',
        movementType: 'PURCHASE_RECEIPT',
        from: '2026-03-10T00:00:00.000Z',
        to: '2026-03-16T23:59:59.999Z',
        limit: '25',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        total: 1,
        items: [
          expect.objectContaining({
            id: 201,
            movementType: 'PURCHASE_RECEIPT',
          }),
        ],
      }),
    );
    expect(adminB2bService.listStockMovements).toHaveBeenCalledWith({
      branchId: 3,
      productId: 9,
      movementType: 'PURCHASE_RECEIPT',
      from: '2026-03-10T00:00:00.000Z',
      to: '2026-03-16T23:59:59.999Z',
      limit: 25,
    });
  });

  it('lists purchase-order receipt events from the admin audit surface', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/purchase-orders/42/receipt-events')
      .query({ page: '2', limit: '10' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        perPage: 10,
        items: [expect.objectContaining({ id: 901, purchaseOrderId: 42 })],
      }),
    );
    expect(adminB2bService.listPurchaseOrderReceiptEvents).toHaveBeenCalledWith(
      42,
      2,
      10,
    );
  });

  it('lists purchase-order audit entries from the admin audit helper route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/purchase-orders/42/audit')
      .query({ limit: '15' })
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: 701,
        targetType: 'PURCHASE_ORDER',
        targetId: 42,
      }),
    ]);
    expect(auditService.listForTarget).toHaveBeenCalledWith(
      'PURCHASE_ORDER',
      42,
      15,
    );
  });

  it('rejects malformed purchase-order audit and receipt-event pagination filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/b2b/purchase-orders/42/audit?limit=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/b2b/purchase-orders/42/receipt-events?page=0')
      .expect(400);
  });

  it('lists POS sync jobs with typed filters from the admin audit surface', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/pos-sync-jobs')
      .query({
        branchId: '3',
        partnerCredentialId: '12',
        syncType: 'STOCK_DELTA',
        status: 'FAILED',
        failedOnly: 'true',
        page: '2',
        limit: '15',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        perPage: 15,
        items: [expect.objectContaining({ id: 51, status: 'FAILED' })],
      }),
    );
    expect(adminB2bService.listPosSyncJobs).toHaveBeenCalledWith({
      branchId: 3,
      partnerCredentialId: 12,
      syncType: 'STOCK_DELTA',
      status: 'FAILED',
      failedOnly: true,
      page: 2,
      limit: 15,
    });
  });

  it('returns a POS sync job detail from the admin audit surface', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/pos-sync-jobs/51')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 51,
        branchId: 3,
        status: 'FAILED',
      }),
    );
    expect(adminB2bService.getPosSyncJob).toHaveBeenCalledWith(51);
  });

  it('re-evaluates an auto-replenishment draft from the admin surface', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/admin/b2b/purchase-orders/42/re-evaluate-auto-replenishment')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 42,
        status: 'SUBMITTED',
        purchaseOrderActions: [],
        reevaluationOutcome: expect.objectContaining({
          previousStatus: 'DRAFT',
          nextStatus: 'SUBMITTED',
          actionTaken: 'SUBMITTED',
        }),
      }),
    );
    expect(
      adminB2bService.reevaluateAutoReplenishmentDraft,
    ).toHaveBeenCalledWith(42, {
      id: 7,
      email: 'admin@test.com',
      roles: ['ADMIN'],
    });
  });

  it('approves a receipt discrepancy with actor metadata', async () => {
    const response = await request(app.getHttpServer())
      .patch(
        '/api/admin/b2b/purchase-orders/42/receipt-events/8/discrepancy-approval',
      )
      .send({ note: 'Approved after credit memo review' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        purchaseOrderId: 42,
        eventId: 8,
        status: 'APPROVED',
      }),
    );
    expect(
      purchaseOrdersService.approveReceiptEventDiscrepancy,
    ).toHaveBeenCalledWith(
      42,
      8,
      { note: 'Approved after credit memo review' },
      {
        id: 7,
        email: 'admin@test.com',
        roles: ['ADMIN'],
      },
    );
  });

  it('force-closes a stale receipt discrepancy with actor metadata', async () => {
    const response = await request(app.getHttpServer())
      .patch(
        '/api/admin/b2b/purchase-orders/42/receipt-events/8/discrepancy-force-close',
      )
      .send({ note: 'Supplier stopped responding after repeated follow-up' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        purchaseOrderId: 42,
        eventId: 8,
        status: 'FORCE_CLOSED',
      }),
    );
    expect(
      purchaseOrdersService.forceCloseReceiptEventDiscrepancy,
    ).toHaveBeenCalledWith(
      42,
      8,
      { note: 'Supplier stopped responding after repeated follow-up' },
      {
        id: 7,
        email: 'admin@test.com',
        roles: ['ADMIN'],
      },
    );
  });

  it('rejects malformed admin audit route filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/b2b/branch-inventory?page=0')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/b2b/stock-movements?movementType=NOT_REAL')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/b2b/pos-sync-jobs?status=NOT_REAL')
      .expect(400);
  });

  it('rejects malformed admin discrepancy action payloads', async () => {
    await request(app.getHttpServer())
      .patch(
        '/api/admin/b2b/purchase-orders/42/receipt-events/8/discrepancy-force-close',
      )
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .patch(
        '/api/admin/b2b/purchase-orders/42/receipt-events/8/discrepancy-approval',
      )
      .send({ note: 'x'.repeat(1001) })
      .expect(400);
  });
});
