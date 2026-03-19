import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/roles.enum';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { ReplenishmentService } from '../branches/replenishment.service';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../products/entities/product.entity';
import { SupplierOffer } from '../supplier-offers/entities/supplier-offer.entity';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from './entities/purchase-order.entity';
import {
  PurchaseOrderReceiptDiscrepancyStatus,
  PurchaseOrderReceiptEvent,
} from './entities/purchase-order-receipt-event.entity';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let purchaseOrdersRepository: { findOne: jest.Mock; save: jest.Mock };
  let receiptEventsRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let auditService: { log: jest.Mock };
  let inventoryLedgerService: {
    recordMovement: jest.Mock;
    transferStock: jest.Mock;
    getOnHand: jest.Mock;
    adjustInboundOpenPo: jest.Mock;
  };
  let replenishmentService: {
    reevaluateDraftPurchaseOrder: jest.Mock;
  };

  beforeEach(async () => {
    purchaseOrdersRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value: any) => value),
    };

    receiptEventsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };

    dataSource = {
      transaction: jest.fn(async (callback: any) =>
        callback({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === PurchaseOrder) {
              return purchaseOrdersRepository;
            }

            if (entity === PurchaseOrderReceiptEvent) {
              return receiptEventsRepository;
            }

            return {};
          }),
        }),
      ),
    };

    auditService = {
      log: jest.fn(),
    };

    inventoryLedgerService = {
      recordMovement: jest.fn(),
      transferStock: jest.fn(),
      getOnHand: jest.fn(),
      adjustInboundOpenPo: jest.fn(),
    };
    replenishmentService = {
      reevaluateDraftPurchaseOrder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: purchaseOrdersRepository,
        },
        { provide: getRepositoryToken(Branch), useValue: {} },
        { provide: getRepositoryToken(SupplierProfile), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(SupplierOffer), useValue: {} },
        {
          provide: getRepositoryToken(PurchaseOrderReceiptEvent),
          useValue: receiptEventsRepository,
        },
        { provide: AuditService, useValue: auditService },
        { provide: InventoryLedgerService, useValue: inventoryLedgerService },
        { provide: ReplenishmentService, useValue: replenishmentService },
      ],
    }).compile();

    service = module.get(PurchaseOrdersService);
  });

  it('applies acknowledgment side effects and audit metadata for supplier transitions', async () => {
    const purchaseOrder: PurchaseOrder = {
      id: 12,
      orderNumber: 'PO-12',
      branchId: 1,
      supplierProfileId: 2,
      status: PurchaseOrderStatus.SUBMITTED,
      currency: 'USD',
      subtotal: 100,
      total: 100,
      items: [] as PurchaseOrderItem[],
      statusMeta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PurchaseOrder;

    purchaseOrdersRepository.findOne.mockResolvedValue(purchaseOrder);

    const result = await service.updateStatus(
      12,
      {
        status: PurchaseOrderStatus.ACKNOWLEDGED,
        reason: 'Accepted by supplier',
      },
      {
        id: 9,
        email: 'supplier@example.com',
        roles: [UserRole.SUPPLIER_ACCOUNT],
      },
    );

    expect(result.status).toBe(PurchaseOrderStatus.ACKNOWLEDGED);
    expect(result.acknowledgedAt).toBeInstanceOf(Date);
    expect(result.statusMeta?.lastTransition).toMatchObject({
      fromStatus: PurchaseOrderStatus.SUBMITTED,
      toStatus: PurchaseOrderStatus.ACKNOWLEDGED,
      actorId: 9,
      reason: 'Accepted by supplier',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'purchase_order.status.update',
        targetType: 'PURCHASE_ORDER',
        targetId: 12,
        meta: expect.objectContaining({
          fromStatus: PurchaseOrderStatus.SUBMITTED,
          toStatus: PurchaseOrderStatus.ACKNOWLEDGED,
        }),
      }),
      expect.any(Object),
    );
    expect(inventoryLedgerService.adjustInboundOpenPo).not.toHaveBeenCalled();
  });

  it('rejects buyer attempts to acknowledge purchase orders', async () => {
    const purchaseOrder: PurchaseOrder = {
      id: 13,
      orderNumber: 'PO-13',
      branchId: 1,
      supplierProfileId: 2,
      status: PurchaseOrderStatus.SUBMITTED,
      currency: 'USD',
      subtotal: 100,
      total: 100,
      items: [] as PurchaseOrderItem[],
      statusMeta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PurchaseOrder;

    purchaseOrdersRepository.findOne.mockResolvedValue(purchaseOrder);

    await expect(
      service.updateStatus(
        13,
        { status: PurchaseOrderStatus.ACKNOWLEDGED },
        {
          id: 3,
          email: 'buyer@example.com',
          roles: [UserRole.POS_MANAGER],
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('creates inventory and stock movements when a purchase order is received', async () => {
    const purchaseOrder: PurchaseOrder = {
      id: 14,
      orderNumber: 'PO-14',
      branchId: 1,
      supplierProfileId: 2,
      status: PurchaseOrderStatus.SHIPPED,
      currency: 'USD',
      subtotal: 100,
      total: 100,
      items: [
        {
          id: 3,
          productId: 55,
          orderedQuantity: 4,
          receivedQuantity: 0,
          shortageQuantity: 0,
          damagedQuantity: 0,
          unitPrice: 25,
        } as PurchaseOrderItem,
      ],
      statusMeta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PurchaseOrder;

    purchaseOrdersRepository.findOne.mockResolvedValue(purchaseOrder);

    const result = await service.updateStatus(
      14,
      {
        status: PurchaseOrderStatus.RECEIVED,
        reason: 'Goods received at branch',
        receiptLines: [
          {
            itemId: 3,
            receivedQuantity: 2,
            shortageQuantity: 1,
            damagedQuantity: 1,
            note: 'One short and one damaged',
          },
        ],
      },
      {
        id: 10,
        email: 'buyer@example.com',
        roles: [UserRole.POS_MANAGER],
      },
    );

    expect(result.receivedAt).toBeInstanceOf(Date);
    expect(result.items[0].receivedQuantity).toBe(2);
    expect(result.items[0].shortageQuantity).toBe(1);
    expect(result.items[0].damagedQuantity).toBe(1);
    expect(result.items[0].note).toBe('One short and one damaged');
    expect(inventoryLedgerService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 1,
        productId: 55,
        quantityDelta: 2,
        movementType: 'PURCHASE_RECEIPT',
        note: 'One short and one damaged',
      }),
      expect.any(Object),
    );
    expect(inventoryLedgerService.adjustInboundOpenPo).toHaveBeenCalledWith(
      {
        branchId: 1,
        productId: 55,
        quantityDelta: -4,
      },
      expect.any(Object),
    );
    expect(receiptEventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseOrderId: 14,
        actorUserId: 10,
        note: 'Goods received at branch',
        receiptLines: [
          expect.objectContaining({
            itemId: 3,
            receivedQuantity: 2,
            shortageQuantity: 1,
            damagedQuantity: 1,
          }),
        ],
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      }),
    );
  });

  it('re-evaluates an auto-replenishment draft and audits the outcome', async () => {
    const purchaseOrder: PurchaseOrder = {
      id: 18,
      orderNumber: 'PO-18',
      branchId: 1,
      supplierProfileId: 2,
      status: PurchaseOrderStatus.DRAFT,
      currency: 'USD',
      subtotal: 125,
      total: 125,
      items: [] as PurchaseOrderItem[],
      statusMeta: {
        autoReplenishment: true,
        lastAutoSubmissionAttempt: {
          blockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PurchaseOrder;

    purchaseOrdersRepository.findOne.mockResolvedValue(purchaseOrder);
    replenishmentService.reevaluateDraftPurchaseOrder.mockResolvedValue({
      ...purchaseOrder,
      status: PurchaseOrderStatus.SUBMITTED,
      statusMeta: {
        autoReplenishment: true,
        autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
        lastAutoSubmissionAttempt: {
          blockedReason: null,
        },
      },
    });

    const result = await service.reevaluateAutoReplenishmentDraft(18, {
      id: 7,
      email: 'admin@example.com',
      roles: [UserRole.ADMIN],
    });

    expect(
      replenishmentService.reevaluateDraftPurchaseOrder,
    ).toHaveBeenCalledWith(purchaseOrder, 7);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'purchase_order.auto_replenishment.re_evaluated',
        targetId: 18,
        meta: expect.objectContaining({
          previousBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
          nextStatus: PurchaseOrderStatus.SUBMITTED,
        }),
      }),
    );
    expect(result.status).toBe(PurchaseOrderStatus.SUBMITTED);
  });

  it('returns a detailed re-evaluation outcome for response contracts', async () => {
    const purchaseOrder: PurchaseOrder = {
      id: 19,
      orderNumber: 'PO-19',
      branchId: 1,
      supplierProfileId: 2,
      status: PurchaseOrderStatus.DRAFT,
      currency: 'USD',
      subtotal: 125,
      total: 125,
      items: [] as PurchaseOrderItem[],
      statusMeta: {
        autoReplenishment: true,
        lastAutoSubmissionAttempt: {
          blockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PurchaseOrder;

    purchaseOrdersRepository.findOne.mockResolvedValue(purchaseOrder);
    replenishmentService.reevaluateDraftPurchaseOrder.mockResolvedValue({
      ...purchaseOrder,
      status: PurchaseOrderStatus.DRAFT,
      statusMeta: {
        autoReplenishment: true,
        autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
        lastAutoSubmissionAttempt: {
          blockedReason: 'AUTOMATION_NOT_ENTITLED',
        },
      },
    });

    const result = await service.reevaluateAutoReplenishmentDraftDetailed(19, {
      id: 7,
      email: 'admin@example.com',
      roles: [UserRole.ADMIN],
    });

    expect(result.outcome).toEqual({
      previousStatus: PurchaseOrderStatus.DRAFT,
      nextStatus: PurchaseOrderStatus.DRAFT,
      previousBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      nextBlockedReason: 'AUTOMATION_NOT_ENTITLED',
      actionTaken: 'REMAINED_DRAFT',
    });
    expect(result.purchaseOrder.id).toBe(19);
  });

  it('projects inbound open purchase order quantities when a draft is submitted', async () => {
    const purchaseOrder: PurchaseOrder = {
      id: 15,
      orderNumber: 'PO-15',
      branchId: 2,
      supplierProfileId: 3,
      status: PurchaseOrderStatus.DRAFT,
      currency: 'USD',
      subtotal: 250,
      total: 250,
      items: [
        {
          id: 7,
          productId: 90,
          orderedQuantity: 5,
          receivedQuantity: 0,
          shortageQuantity: 0,
          damagedQuantity: 0,
          unitPrice: 50,
        } as PurchaseOrderItem,
      ],
      statusMeta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PurchaseOrder;

    purchaseOrdersRepository.findOne.mockResolvedValue(purchaseOrder);

    await service.updateStatus(
      15,
      { status: PurchaseOrderStatus.SUBMITTED },
      {
        id: 12,
        email: 'buyer@example.com',
        roles: [UserRole.POS_MANAGER],
      },
    );

    expect(inventoryLedgerService.adjustInboundOpenPo).toHaveBeenCalledWith(
      {
        branchId: 2,
        productId: 90,
        quantityDelta: 5,
      },
      expect.any(Object),
    );
  });

  it('records additional receipt events for an already received purchase order', async () => {
    const purchaseOrder: PurchaseOrder = {
      id: 15,
      orderNumber: 'PO-15',
      branchId: 1,
      supplierProfileId: 2,
      status: PurchaseOrderStatus.RECEIVED,
      currency: 'USD',
      subtotal: 100,
      total: 100,
      items: [
        {
          id: 7,
          productId: 99,
          orderedQuantity: 5,
          receivedQuantity: 2,
          shortageQuantity: 1,
          damagedQuantity: 0,
          unitPrice: 20,
        } as PurchaseOrderItem,
      ],
      statusMeta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      receivedAt: new Date(),
    } as PurchaseOrder;

    purchaseOrdersRepository.findOne.mockResolvedValue(purchaseOrder);

    const result = await service.recordReceiptEvent(
      15,
      {
        reason: 'Final pallet received',
        metadata: { truck: 'T-1' },
        receiptLines: [
          {
            itemId: 7,
            receivedQuantity: 1,
            shortageQuantity: 0,
            damagedQuantity: 1,
          },
        ],
      },
      {
        id: 11,
        email: 'buyer@example.com',
        roles: [UserRole.POS_MANAGER],
      },
    );

    expect(result.items[0].receivedQuantity).toBe(3);
    expect(result.items[0].damagedQuantity).toBe(1);
    expect(inventoryLedgerService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 1,
        productId: 99,
        quantityDelta: 1,
        movementType: 'PURCHASE_RECEIPT',
      }),
      expect.any(Object),
    );
    expect(receiptEventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseOrderId: 15,
        actorUserId: 11,
        metadata: { truck: 'T-1' },
      }),
    );
  });

  it('does not persist receipt events or audits when ledger persistence fails during receipt recording', async () => {
    const purchaseOrder: PurchaseOrder = {
      id: 16,
      orderNumber: 'PO-16',
      branchId: 1,
      supplierProfileId: 2,
      status: PurchaseOrderStatus.SHIPPED,
      currency: 'USD',
      subtotal: 100,
      total: 100,
      items: [
        {
          id: 8,
          productId: 101,
          orderedQuantity: 4,
          receivedQuantity: 0,
          shortageQuantity: 0,
          damagedQuantity: 0,
          unitPrice: 25,
        } as PurchaseOrderItem,
      ],
      statusMeta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PurchaseOrder;

    purchaseOrdersRepository.findOne.mockResolvedValue(purchaseOrder);
    inventoryLedgerService.recordMovement.mockRejectedValueOnce(
      new Error('ledger write failed'),
    );

    await expect(
      service.recordReceiptEvent(
        16,
        {
          reason: 'Failed receipt',
          receiptLines: [
            {
              itemId: 8,
              receivedQuantity: 2,
            },
          ],
        },
        {
          id: 11,
          email: 'buyer@example.com',
          roles: [UserRole.POS_MANAGER],
        },
      ),
    ).rejects.toThrow('ledger write failed');

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(receiptEventsRepository.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('allows suppliers to acknowledge receipt events', async () => {
    const receiptEvent = {
      id: 21,
      purchaseOrderId: 15,
      receiptLines: [],
    } as PurchaseOrderReceiptEvent;

    receiptEventsRepository.findOne.mockResolvedValue(receiptEvent);

    const result = await service.acknowledgeReceiptEvent(
      15,
      21,
      { note: 'Receipt reviewed on supplier side' },
      {
        id: 12,
        email: 'supplier@example.com',
        roles: [UserRole.SUPPLIER_ACCOUNT],
      },
    );

    expect(result.supplierAcknowledgedByUserId).toBe(12);
    expect(result.supplierAcknowledgementNote).toBe(
      'Receipt reviewed on supplier side',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'purchase_order.receipt.acknowledged',
        targetId: 21,
      }),
    );
  });

  it('resolves discrepant receipt events from the supplier side', async () => {
    const receiptEvent = {
      id: 22,
      purchaseOrderId: 15,
      receiptLines: [
        {
          itemId: 7,
          productId: 99,
          receivedQuantity: 1,
          shortageQuantity: 1,
          damagedQuantity: 0,
        },
      ],
    } as PurchaseOrderReceiptEvent;

    receiptEventsRepository.findOne.mockResolvedValue(receiptEvent);

    const result = await service.resolveReceiptEventDiscrepancy(
      15,
      22,
      {
        resolutionNote: 'Credit memo will cover the missing unit',
        metadata: { creditMemoNumber: 'CM-101' },
      },
      {
        id: 13,
        email: 'supplier@example.com',
        roles: [UserRole.SUPPLIER_ACCOUNT],
      },
    );

    expect(result.discrepancyStatus).toBe(
      PurchaseOrderReceiptDiscrepancyStatus.RESOLVED,
    );
    expect(result.discrepancyResolutionNote).toBe(
      'Credit memo will cover the missing unit',
    );
    expect(result.discrepancyResolvedByUserId).toBe(13);
  });

  it('rejects discrepancy resolution when the receipt event has no shortage or damage', async () => {
    const receiptEvent = {
      id: 23,
      purchaseOrderId: 15,
      receiptLines: [
        {
          itemId: 7,
          productId: 99,
          receivedQuantity: 2,
          shortageQuantity: 0,
          damagedQuantity: 0,
        },
      ],
    } as PurchaseOrderReceiptEvent;

    receiptEventsRepository.findOne.mockResolvedValue(receiptEvent);

    await expect(
      service.resolveReceiptEventDiscrepancy(
        15,
        23,
        { resolutionNote: 'No discrepancy here' },
        {
          id: 14,
          email: 'supplier@example.com',
          roles: [UserRole.SUPPLIER_ACCOUNT],
        },
      ),
    ).rejects.toThrow('does not contain a shortage or damaged quantity');
  });

  it('allows buyers to approve resolved discrepancy events', async () => {
    const receiptEvent = {
      id: 24,
      purchaseOrderId: 15,
      receiptLines: [
        {
          itemId: 7,
          productId: 99,
          receivedQuantity: 1,
          shortageQuantity: 1,
          damagedQuantity: 0,
        },
      ],
      discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.RESOLVED,
    } as PurchaseOrderReceiptEvent;

    receiptEventsRepository.findOne.mockResolvedValue(receiptEvent);

    const result = await service.approveReceiptEventDiscrepancy(
      15,
      24,
      { note: 'Approved after confirming supplier credit memo' },
      {
        id: 22,
        email: 'buyer@example.com',
        roles: [UserRole.POS_MANAGER],
      },
    );

    expect(result.discrepancyStatus).toBe(
      PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
    );
    expect(result.discrepancyApprovedByUserId).toBe(22);
    expect(result.discrepancyApprovalNote).toBe(
      'Approved after confirming supplier credit memo',
    );
  });

  it('allows admins to force-close stale discrepancy events', async () => {
    const receiptEvent = {
      id: 27,
      purchaseOrderId: 15,
      receiptLines: [
        {
          itemId: 7,
          productId: 99,
          receivedQuantity: 1,
          shortageQuantity: 1,
          damagedQuantity: 0,
        },
      ],
      discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
    } as PurchaseOrderReceiptEvent;

    receiptEventsRepository.findOne.mockResolvedValue(receiptEvent);

    const result = await service.forceCloseReceiptEventDiscrepancy(
      15,
      27,
      { note: 'Supplier non-responsive after escalation window expired' },
      {
        id: 30,
        email: 'admin@example.com',
        roles: [UserRole.ADMIN],
      },
    );

    expect(result.discrepancyStatus).toBe(
      PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
    );
    expect(result.discrepancyApprovedByUserId).toBe(30);
    expect(result.discrepancyApprovalNote).toBe(
      'Supplier non-responsive after escalation window expired',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'purchase_order.receipt.discrepancy_force_closed',
        targetId: 27,
        meta: expect.objectContaining({
          purchaseOrderId: 15,
          previousDiscrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
          nextDiscrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
        }),
      }),
    );
  });

  it('rejects force-close attempts from non-admin roles', async () => {
    await expect(
      service.forceCloseReceiptEventDiscrepancy(
        15,
        27,
        { note: 'Not allowed' },
        {
          id: 31,
          email: 'buyer@example.com',
          roles: [UserRole.POS_MANAGER],
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks reconciliation until every purchase order item is fully accounted for', async () => {
    const purchaseOrder: PurchaseOrder = {
      id: 25,
      orderNumber: 'PO-25',
      branchId: 1,
      supplierProfileId: 2,
      status: PurchaseOrderStatus.RECEIVED,
      currency: 'USD',
      subtotal: 100,
      total: 100,
      items: [
        {
          id: 9,
          productId: 55,
          orderedQuantity: 5,
          receivedQuantity: 3,
          shortageQuantity: 1,
          damagedQuantity: 0,
          unitPrice: 20,
        } as PurchaseOrderItem,
      ],
      statusMeta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PurchaseOrder;

    purchaseOrdersRepository.findOne.mockResolvedValue(purchaseOrder);

    await expect(
      service.updateStatus(
        25,
        { status: PurchaseOrderStatus.RECONCILED },
        {
          id: 22,
          email: 'buyer@example.com',
          roles: [UserRole.POS_MANAGER],
        },
      ),
    ).rejects.toThrow(
      'Purchase order cannot be reconciled until every item quantity is fully accounted for',
    );
  });

  it('blocks reconciliation while discrepant receipt events are still open or unresolved', async () => {
    const purchaseOrder: PurchaseOrder = {
      id: 26,
      orderNumber: 'PO-26',
      branchId: 1,
      supplierProfileId: 2,
      status: PurchaseOrderStatus.RECEIVED,
      currency: 'USD',
      subtotal: 100,
      total: 100,
      items: [
        {
          id: 10,
          productId: 56,
          orderedQuantity: 5,
          receivedQuantity: 4,
          shortageQuantity: 1,
          damagedQuantity: 0,
          unitPrice: 20,
        } as PurchaseOrderItem,
      ],
      statusMeta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PurchaseOrder;

    purchaseOrdersRepository.findOne.mockResolvedValue(purchaseOrder);
    receiptEventsRepository.find.mockResolvedValueOnce([
      {
        id: 100,
        purchaseOrderId: 26,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.RESOLVED,
      },
    ]);

    await expect(
      service.updateStatus(
        26,
        { status: PurchaseOrderStatus.RECONCILED },
        {
          id: 22,
          email: 'buyer@example.com',
          roles: [UserRole.POS_MANAGER],
        },
      ),
    ).rejects.toThrow(
      'Purchase order cannot be reconciled while receipt discrepancies are still open or awaiting approval',
    );
  });
});
