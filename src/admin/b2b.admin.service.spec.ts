import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { BranchTransfer } from '../branches/entities/branch-transfer.entity';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import { PurchaseOrderReceiptEvent } from '../purchase-orders/entities/purchase-order-receipt-event.entity';
import { PosSyncJob } from '../pos-sync/entities/pos-sync-job.entity';
import { StockMovement } from '../branches/entities/stock-movement.entity';
import { AdminB2bService } from './b2b.admin.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';

describe('AdminB2bService', () => {
  let service: AdminB2bService;
  let purchaseOrdersRepository: { createQueryBuilder: jest.Mock };
  let purchaseOrdersService: {
    reevaluateAutoReplenishmentDraftDetailed: jest.Mock;
  };

  beforeEach(async () => {
    purchaseOrdersRepository = {
      createQueryBuilder: jest.fn(),
    };
    purchaseOrdersService = {
      reevaluateAutoReplenishmentDraftDetailed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminB2bService,
        { provide: getRepositoryToken(BranchTransfer), useValue: {} },
        { provide: getRepositoryToken(BranchInventory), useValue: {} },
        { provide: getRepositoryToken(StockMovement), useValue: {} },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: purchaseOrdersRepository,
        },
        { provide: getRepositoryToken(PosSyncJob), useValue: {} },
        {
          provide: getRepositoryToken(PurchaseOrderReceiptEvent),
          useValue: {},
        },
        { provide: PurchaseOrdersService, useValue: purchaseOrdersService },
      ],
    }).compile();

    service = module.get(AdminB2bService);
  });

  it('applies auto-replenishment submission mode and blocked reason filters', async () => {
    const summaryQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalPurchaseOrders: '0',
        autoReplenishmentCount: '0',
        autoSubmitDraftCount: '0',
        blockedAutoSubmitDraftCount: '0',
        readyAutoSubmitDraftCount: '0',
        dayOfWeekBlockedCount: '0',
        hourOutsideWindowBlockedCount: '0',
        preferredSupplierRequiredCount: '0',
        minimumOrderTotalNotMetCount: '0',
        automationNotEntitledCount: '0',
      }),
    };
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnValue(summaryQb),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    purchaseOrdersRepository.createQueryBuilder.mockReturnValue(qb);

    await service.listPurchaseOrders({
      autoReplenishment: true,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT' as any,
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      page: 1,
      limit: 20,
    });

    expect(qb.andWhere).toHaveBeenCalledWith(
      "COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishment', 'false') = :autoReplenishment",
      { autoReplenishment: 'true' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      "COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishmentSubmissionMode', '') = :autoReplenishmentSubmissionMode",
      { autoReplenishmentSubmissionMode: 'AUTO_SUBMIT' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      "COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = :autoReplenishmentBlockedReason",
      {
        autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      },
    );
  });

  it('maps explicit auto-replenishment status in purchase order responses', async () => {
    const summaryQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalPurchaseOrders: '1',
        autoReplenishmentCount: '1',
        autoSubmitDraftCount: '1',
        blockedAutoSubmitDraftCount: '1',
        readyAutoSubmitDraftCount: '0',
        dayOfWeekBlockedCount: '0',
        hourOutsideWindowBlockedCount: '0',
        preferredSupplierRequiredCount: '0',
        minimumOrderTotalNotMetCount: '1',
        automationNotEntitledCount: '0',
      }),
    };
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnValue(summaryQb),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 77,
            orderNumber: 'PO-AR-77',
            branchId: 3,
            supplierProfileId: 14,
            status: PurchaseOrderStatus.DRAFT,
            currency: 'USD',
            subtotal: 125,
            total: 125,
            expectedDeliveryDate: '2026-03-20',
            statusMeta: {
              autoReplenishment: true,
              autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
              autoReplenishmentMinimumOrderTotal: 250,
              lastAutoSubmissionAttempt: {
                eligible: false,
                blockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
                at: '2026-03-18T10:00:00.000Z',
              },
            },
            items: [],
            createdAt: new Date('2026-03-18T09:00:00.000Z'),
            updatedAt: new Date('2026-03-18T10:00:00.000Z'),
          },
        ],
        1,
      ]),
    };
    purchaseOrdersRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listPurchaseOrders({ page: 1, limit: 20 });

    expect(result.summary).toEqual(
      expect.objectContaining({
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
      }),
    );
    expect(result.items[0].autoReplenishmentStatus).toEqual(
      expect.objectContaining({
        submissionMode: 'AUTO_SUBMIT',
        lastAttemptEligible: false,
        lastAttemptBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
        minimumOrderTotal: 250,
      }),
    );
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

  it('includes automation-not-entitled counts in the purchase-order summary breakdown', async () => {
    const summaryQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalPurchaseOrders: '1',
        autoReplenishmentCount: '1',
        autoSubmitDraftCount: '1',
        blockedAutoSubmitDraftCount: '1',
        readyAutoSubmitDraftCount: '0',
        dayOfWeekBlockedCount: '0',
        hourOutsideWindowBlockedCount: '0',
        preferredSupplierRequiredCount: '0',
        minimumOrderTotalNotMetCount: '0',
        automationNotEntitledCount: '1',
      }),
    };
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnValue(summaryQb),
      getManyAndCount: jest.fn().mockResolvedValue([[], 1]),
    };
    purchaseOrdersRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listPurchaseOrders({ page: 1, limit: 20 });

    expect(result.summary.blockedReasonBreakdown).toEqual([
      {
        reason: 'AUTOMATION_NOT_ENTITLED',
        count: 1,
      },
    ]);
  });

  it('omits admin purchase-order actions for non-draft or manual orders', async () => {
    const summaryQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalPurchaseOrders: '1',
        autoReplenishmentCount: '0',
        autoSubmitDraftCount: '0',
        blockedAutoSubmitDraftCount: '0',
        readyAutoSubmitDraftCount: '0',
        dayOfWeekBlockedCount: '0',
        hourOutsideWindowBlockedCount: '0',
        preferredSupplierRequiredCount: '0',
        minimumOrderTotalNotMetCount: '0',
        automationNotEntitledCount: '0',
      }),
    };
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnValue(summaryQb),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 78,
            orderNumber: 'PO-78',
            branchId: 3,
            supplierProfileId: 14,
            status: PurchaseOrderStatus.SUBMITTED,
            currency: 'USD',
            subtotal: 125,
            total: 125,
            expectedDeliveryDate: '2026-03-20',
            statusMeta: {},
            items: [],
            createdAt: new Date('2026-03-18T09:00:00.000Z'),
            updatedAt: new Date('2026-03-18T10:00:00.000Z'),
          },
        ],
        1,
      ]),
    };
    purchaseOrdersRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listPurchaseOrders({ page: 1, limit: 20 });

    expect(result.items[0].purchaseOrderActions).toEqual([]);
  });

  it('maps re-evaluation responses with explicit outcome metadata', async () => {
    purchaseOrdersService.reevaluateAutoReplenishmentDraftDetailed.mockResolvedValue(
      {
        purchaseOrder: {
          id: 77,
          orderNumber: 'PO-AR-77',
          branchId: 3,
          supplierProfileId: 14,
          status: PurchaseOrderStatus.SUBMITTED,
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
          items: [],
          createdAt: new Date('2026-03-18T09:00:00.000Z'),
          updatedAt: new Date('2026-03-18T10:00:00.000Z'),
        },
        outcome: {
          previousStatus: PurchaseOrderStatus.DRAFT,
          nextStatus: PurchaseOrderStatus.SUBMITTED,
          previousBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
          nextBlockedReason: null,
          actionTaken: 'SUBMITTED',
        },
      },
    );

    const result = await service.reevaluateAutoReplenishmentDraft(77, {
      id: 7,
      email: 'admin@example.com',
      roles: ['ADMIN'],
    });

    expect(
      purchaseOrdersService.reevaluateAutoReplenishmentDraftDetailed,
    ).toHaveBeenCalledWith(77, {
      id: 7,
      email: 'admin@example.com',
      roles: ['ADMIN'],
    });
    expect(result.purchaseOrderActions).toEqual([]);
    expect(result.reevaluationOutcome).toEqual({
      previousStatus: PurchaseOrderStatus.DRAFT,
      nextStatus: PurchaseOrderStatus.SUBMITTED,
      previousBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      nextBlockedReason: null,
      actionTaken: 'SUBMITTED',
    });
  });
});
