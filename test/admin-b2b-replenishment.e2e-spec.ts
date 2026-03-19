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

describe('AdminB2bController replenishment actions (e2e)', () => {
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
      listPurchaseOrders: jest.fn(),
      listBranchTransfers: jest.fn(),
      getBranchTransfer: jest.fn(),
      listBranchInventory: jest.fn(),
      listStockMovements: jest.fn(),
      listPurchaseOrderReceiptEvents: jest.fn(),
      listPosSyncJobs: jest.fn(),
      getPosSyncJob: jest.fn(),
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
          useValue: {
            findReviewQueue: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: PartnerCredentialsService,
          useValue: {
            revoke: jest.fn(),
            rotateBranchAssignment: jest.fn(),
          },
        },
        {
          provide: PurchaseOrdersService,
          useValue: {
            approveReceiptEventDiscrepancy: jest.fn(),
            forceCloseReceiptEventDiscrepancy: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            listForTarget: jest.fn(),
          },
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
});
