import { Test, TestingModule } from '@nestjs/testing';
import { AdminB2bController } from './b2b.admin.controller';
import { AdminB2bService } from './b2b.admin.service';
import { AuditService } from '../audit/audit.service';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { SupplierOnboardingStatus } from '../suppliers/entities/supplier-profile.entity';
import { BranchTransferStatus } from '../branches/entities/branch-transfer.entity';
import { PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';

describe('AdminB2bController', () => {
  let controller: AdminB2bController;
  let suppliersService: {
    findReviewQueue: jest.Mock;
    updateStatus: jest.Mock;
  };
  let partnerCredentialsService: {
    revoke: jest.Mock;
    rotateBranchAssignment: jest.Mock;
  };
  let purchaseOrdersService: {
    approveReceiptEventDiscrepancy: jest.Mock;
    forceCloseReceiptEventDiscrepancy: jest.Mock;
  };
  let auditService: { listForTarget: jest.Mock };
  let adminB2bService: {
    listPurchaseOrders: jest.Mock;
    listBranchTransfers: jest.Mock;
    getBranchTransfer: jest.Mock;
    listBranchInventory: jest.Mock;
    listStockMovements: jest.Mock;
    listPurchaseOrderReceiptEvents: jest.Mock;
    listPosSyncJobs: jest.Mock;
    getPosSyncJob: jest.Mock;
  };

  beforeEach(async () => {
    suppliersService = {
      findReviewQueue: jest.fn().mockResolvedValue([]),
      updateStatus: jest.fn(),
    };
    partnerCredentialsService = {
      revoke: jest.fn(),
      rotateBranchAssignment: jest.fn(),
    };
    purchaseOrdersService = {
      approveReceiptEventDiscrepancy: jest.fn(),
      forceCloseReceiptEventDiscrepancy: jest.fn(),
    };
    auditService = {
      listForTarget: jest.fn().mockResolvedValue([]),
    };
    adminB2bService = {
      listPurchaseOrders: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
      }),
      listBranchTransfers: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
      }),
      getBranchTransfer: jest.fn().mockResolvedValue({
        id: 17,
        transferNumber: 'BT-17',
        items: [],
      }),
      listBranchInventory: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 25,
        totalPages: 0,
      }),
      listStockMovements: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 25,
        totalPages: 0,
      }),
      listPurchaseOrderReceiptEvents: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
      }),
      listPosSyncJobs: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
      }),
      getPosSyncJob: jest.fn().mockResolvedValue({
        id: 51,
        failedEntries: [],
      }),
      reevaluateAutoReplenishmentDraft: jest.fn().mockResolvedValue({
        id: 42,
        reevaluationOutcome: {
          previousStatus: 'DRAFT',
          nextStatus: 'SUBMITTED',
          previousBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
          nextBlockedReason: null,
          actionTaken: 'SUBMITTED',
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminB2bController],
      providers: [
        { provide: SuppliersService, useValue: suppliersService },
        {
          provide: PartnerCredentialsService,
          useValue: partnerCredentialsService,
        },
        { provide: PurchaseOrdersService, useValue: purchaseOrdersService },
        { provide: AuditService, useValue: auditService },
        { provide: AdminB2bService, useValue: adminB2bService },
      ],
    }).compile();

    controller = module.get(AdminB2bController);
  });

  it('returns the supplier review queue for the requested status', async () => {
    await controller.reviewQueue({
      status: SupplierOnboardingStatus.PENDING_REVIEW,
    });

    expect(suppliersService.findReviewQueue).toHaveBeenCalledWith(
      SupplierOnboardingStatus.PENDING_REVIEW,
    );
  });

  it('returns purchase-order audit history', async () => {
    await controller.purchaseOrderAudit(42, '15');

    expect(auditService.listForTarget).toHaveBeenCalledWith(
      'PURCHASE_ORDER',
      42,
      15,
    );
  });

  it('returns branch inventory history', async () => {
    await controller.branchInventory({ branchId: 3, productId: 9, limit: 25 });

    expect(adminB2bService.listBranchInventory).toHaveBeenCalledWith({
      branchId: 3,
      productId: 9,
      limit: 25,
    });
  });

  it('returns persisted branch transfers', async () => {
    await controller.branchTransfers({
      fromBranchId: 3,
      toBranchId: 4,
      status: BranchTransferStatus.DISPATCHED,
      page: 2,
      limit: 10,
    });

    expect(adminB2bService.listBranchTransfers).toHaveBeenCalledWith({
      fromBranchId: 3,
      toBranchId: 4,
      status: BranchTransferStatus.DISPATCHED,
      page: 2,
      limit: 10,
    });
  });

  it('returns purchase orders filtered for auto replenishment review', async () => {
    adminB2bService.listPurchaseOrders.mockResolvedValue({
      summary: {
        totalPurchaseOrders: 1,
        autoReplenishmentCount: 1,
        autoSubmitDraftCount: 1,
        blockedAutoSubmitDraftCount: 1,
        readyAutoSubmitDraftCount: 0,
        blockedReasonBreakdown: [],
      },
      items: [
        {
          id: 77,
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
    });

    const result = await controller.purchaseOrders({
      branchId: 3,
      status: PurchaseOrderStatus.DRAFT,
      autoReplenishment: true,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT' as any,
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      page: 2,
      limit: 10,
    });

    expect(adminB2bService.listPurchaseOrders).toHaveBeenCalledWith({
      branchId: 3,
      status: PurchaseOrderStatus.DRAFT,
      autoReplenishment: true,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      page: 2,
      limit: 10,
    });
    expect(result.items[0].purchaseOrderActions).toEqual([
      {
        type: 'RE_EVALUATE_AUTO_REPLENISHMENT',
        method: 'PATCH',
        path: '/admin/b2b/purchase-orders/77/re-evaluate-auto-replenishment',
        query: null,
        enabled: true,
      },
    ]);
  });

  it('returns a branch transfer document', async () => {
    await controller.branchTransfer(17);

    expect(adminB2bService.getBranchTransfer).toHaveBeenCalledWith(17);
  });

  it('returns stock movement history', async () => {
    await controller.stockMovements({
      branchId: 3,
      productId: 9,
      movementType: 'PURCHASE_RECEIPT' as any,
      from: '2026-03-10T00:00:00.000Z',
      to: '2026-03-16T23:59:59.999Z',
      limit: 25,
    });

    expect(adminB2bService.listStockMovements).toHaveBeenCalledWith({
      branchId: 3,
      productId: 9,
      movementType: 'PURCHASE_RECEIPT',
      from: '2026-03-10T00:00:00.000Z',
      to: '2026-03-16T23:59:59.999Z',
      limit: 25,
    });
  });

  it('returns paginated purchase-order receipt events from the admin surface', async () => {
    await controller.purchaseOrderReceiptEvents(42, '2', '10');

    expect(adminB2bService.listPurchaseOrderReceiptEvents).toHaveBeenCalledWith(
      42,
      2,
      10,
    );
  });

  it('forwards admin auto-replenishment re-evaluation requests with actor metadata', async () => {
    const req = {
      user: {
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
    };

    const result = await controller.reEvaluateAutoReplenishmentDraft(42, req);

    expect(
      adminB2bService.reevaluateAutoReplenishmentDraft,
    ).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      }),
    );
    expect(result.reevaluationOutcome).toEqual(
      expect.objectContaining({
        actionTaken: 'SUBMITTED',
      }),
    );
  });

  it('returns a POS sync job with failed-entry details from the admin surface', async () => {
    await controller.posSyncJob(51);

    expect(adminB2bService.getPosSyncJob).toHaveBeenCalledWith(51);
  });

  it('returns paginated POS sync jobs from the admin surface', async () => {
    await controller.posSyncJobs({
      branchId: 3,
      status: 'FAILED' as any,
      failedOnly: true,
      page: 2,
      limit: 15,
    });

    expect(adminB2bService.listPosSyncJobs).toHaveBeenCalledWith({
      branchId: 3,
      status: 'FAILED',
      failedOnly: true,
      page: 2,
      limit: 15,
    });
  });

  it('forwards admin approval requests with actor metadata', async () => {
    const req = {
      user: {
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
    };

    await controller.approveSupplierProfile(
      5,
      { reason: 'Verified docs' },
      req,
    );

    expect(suppliersService.updateStatus).toHaveBeenCalledWith(
      5,
      { status: SupplierOnboardingStatus.APPROVED },
      expect.objectContaining({
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
        reason: 'Verified docs',
      }),
    );
  });

  it('forwards admin discrepancy approvals with actor metadata', async () => {
    const req = {
      user: {
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
    };

    await controller.approveReceiptEventDiscrepancy(
      42,
      8,
      { note: 'Resolution accepted after review' },
      req,
    );

    expect(
      purchaseOrdersService.approveReceiptEventDiscrepancy,
    ).toHaveBeenCalledWith(
      42,
      8,
      { note: 'Resolution accepted after review' },
      expect.objectContaining({
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      }),
    );
  });

  it('forwards admin discrepancy force-close requests with actor metadata', async () => {
    const req = {
      user: {
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
    };

    await controller.forceCloseReceiptEventDiscrepancy(
      42,
      8,
      { note: 'Supplier unreachable after repeated follow-up' },
      req,
    );

    expect(
      purchaseOrdersService.forceCloseReceiptEventDiscrepancy,
    ).toHaveBeenCalledWith(
      42,
      8,
      { note: 'Supplier unreachable after repeated follow-up' },
      expect.objectContaining({
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      }),
    );
  });

  it('forwards partner credential branch rotations with actor metadata', async () => {
    const req = {
      user: {
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
    };

    await controller.rotatePartnerCredentialBranch(
      13,
      { branchId: 4, reason: 'Terminal moved to branch 4' },
      req,
    );

    expect(
      partnerCredentialsService.rotateBranchAssignment,
    ).toHaveBeenCalledWith(
      13,
      4,
      expect.objectContaining({
        id: 7,
        email: 'admin@example.com',
        reason: 'Terminal moved to branch 4',
      }),
    );
  });
});
