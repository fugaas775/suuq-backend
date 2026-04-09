import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { Branch } from '../branches/entities/branch.entity';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import {
  BranchTransfer,
  BranchTransferStatus,
} from '../branches/entities/branch-transfer.entity';
import {
  StockMovement,
  StockMovementType,
} from '../branches/entities/stock-movement.entity';
import {
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../orders/entities/order.entity';
import {
  PosSyncJob,
  PosSyncStatus,
  PosSyncType,
} from '../pos-sync/entities/pos-sync-job.entity';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import {
  PurchaseOrderReceiptDiscrepancyStatus,
  PurchaseOrderReceiptEvent,
} from '../purchase-orders/entities/purchase-order-receipt-event.entity';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { RedisService } from '../redis/redis.service';
import {
  PayoutLog,
  PayoutProvider,
  PayoutStatus,
} from '../wallet/entities/payout-log.entity';
import { RetailModule } from './entities/tenant-module-entitlement.entity';
import { RetailAttendanceService } from './retail-attendance.service';
import { RetailCommandCenterReportingService } from './retail-command-center-reporting.service';
import { RetailEntitlementsService } from './retail-entitlements.service';
import { RetailOpsService } from './retail-ops.service';

describe('RetailOpsService', () => {
  let service: RetailOpsService;
  let branchesRepository: { findOne: jest.Mock; find: jest.Mock };
  let branchStaffAssignmentsRepository: { findOne: jest.Mock; find: jest.Mock };
  let branchInventoryRepository: {
    find: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let branchTransfersRepository: { find: jest.Mock; findOne: jest.Mock };
  let stockMovementsRepository: { find: jest.Mock; findOne: jest.Mock };
  let purchaseOrdersRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };
  let ordersRepository: { find: jest.Mock; findOne: jest.Mock };
  let payoutLogRepository: { find: jest.Mock };
  let posSyncJobsRepository: { find: jest.Mock; findOne: jest.Mock };
  let purchaseOrdersService: {
    reevaluateAutoReplenishmentDraftDetailed: jest.Mock;
  };
  let purchaseOrderReceiptEventsRepository: { find: jest.Mock };
  let redisService: { get: jest.Mock; set: jest.Mock };
  let retailEntitlementsService: {
    getActiveBranchRetailAccess: jest.Mock;
    getActiveBranchModuleEntitlement: jest.Mock;
  };
  let retailAttendanceService: { getAttendanceNetworkSummary: jest.Mock };

  beforeEach(async () => {
    branchesRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 3,
        name: 'HQ',
        code: 'HQ-3',
        retailTenantId: 21,
        isActive: true,
      }),
      find: jest.fn().mockResolvedValue([]),
    };
    branchStaffAssignmentsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };
    branchInventoryRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          branchId: 3,
          productId: 9,
          quantityOnHand: 0,
          reservedQuantity: 1,
          reservedOnline: 2,
          reservedStoreOps: 0,
          inboundOpenPo: 4,
          outboundTransfers: 0,
          safetyStock: 5,
          availableToSell: 0,
          version: 2,
          lastReceivedAt: null,
          lastPurchaseOrderId: 71,
          createdAt: new Date('2026-03-18T08:00:00.000Z'),
          updatedAt: new Date('2026-03-18T09:00:00.000Z'),
        },
      ]),
      count: jest.fn().mockResolvedValue(1),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalSkus: '1',
          outOfStockCount: '1',
          replenishmentCandidateCount: '1',
          negativeAvailableCount: '0',
          inboundOpenPoUnits: '4',
          committedUnits: '3',
          lastUpdatedAt: '2026-03-18T09:00:00.000Z',
        }),
      })),
    };
    branchTransfersRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    stockMovementsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    purchaseOrdersRepository = {
      createQueryBuilder: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    ordersRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    payoutLogRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    posSyncJobsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    purchaseOrderReceiptEventsRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    purchaseOrdersService = {
      reevaluateAutoReplenishmentDraftDetailed: jest.fn(),
    };
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    retailEntitlementsService = {
      getActiveBranchRetailAccess: jest.fn().mockResolvedValue({
        branch: {
          id: 3,
          name: 'HQ',
          code: 'HQ-3',
          retailTenantId: 21,
          isActive: true,
        },
        tenant: {
          id: 21,
          branches: [
            {
              id: 3,
              name: 'HQ',
              code: 'HQ-3',
              retailTenantId: 21,
              isActive: true,
            },
          ],
        },
        entitlements: [],
      }),
      getActiveBranchModuleEntitlement: jest.fn().mockResolvedValue(null),
    };
    retailAttendanceService = {
      getAttendanceNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 1,
        windowHours: 24,
        activeStaffCount: 0,
        checkedInStaffCount: 0,
        onDutyCount: 0,
        absentCount: 0,
        lateCheckInCount: 0,
        overtimeActiveCount: 0,
        averageAttendanceRate: 0,
        criticalBranchCount: 0,
        highBranchCount: 0,
        normalBranchCount: 1,
        alerts: [],
        branches: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetailOpsService,
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        {
          provide: getRepositoryToken(BranchStaffAssignment),
          useValue: branchStaffAssignmentsRepository,
        },
        {
          provide: getRepositoryToken(BranchInventory),
          useValue: branchInventoryRepository,
        },
        {
          provide: getRepositoryToken(BranchTransfer),
          useValue: branchTransfersRepository,
        },
        {
          provide: getRepositoryToken(StockMovement),
          useValue: stockMovementsRepository,
        },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: purchaseOrdersRepository,
        },
        {
          provide: getRepositoryToken(PurchaseOrderReceiptEvent),
          useValue: purchaseOrderReceiptEventsRepository,
        },
        {
          provide: getRepositoryToken(PosSyncJob),
          useValue: posSyncJobsRepository,
        },
        { provide: getRepositoryToken(Order), useValue: ordersRepository },
        {
          provide: getRepositoryToken(PayoutLog),
          useValue: payoutLogRepository,
        },
        { provide: PurchaseOrdersService, useValue: purchaseOrdersService },
        { provide: RedisService, useValue: redisService },
        {
          provide: RetailEntitlementsService,
          useValue: retailEntitlementsService,
        },
        { provide: RetailAttendanceService, useValue: retailAttendanceService },
      ],
    }).compile();

    service = module.get(RetailOpsService);
  });

  it('returns a branch POS operations snapshot', async () => {
    const createdAt = new Date('2026-03-19T08:00:00.000Z');
    ordersRepository.find.mockResolvedValue([
      {
        id: 11,
        fulfillmentBranchId: 3,
        total: 120,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.DELIVERED,
        createdAt,
        items: [
          {
            quantity: 2,
            price: 15,
            product: { id: 91, name: 'Rice 5kg' },
          },
        ],
      },
      {
        id: 12,
        fulfillmentBranchId: 3,
        total: 80,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentStatus: PaymentStatus.FAILED,
        status: OrderStatus.PROCESSING,
        createdAt: new Date('2026-03-18T12:00:00.000Z'),
        items: [
          {
            quantity: 1,
            price: 20,
            product: { id: 92, name: 'Oil 1L' },
          },
        ],
      },
    ] as any);
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      { branchId: 3, role: BranchStaffRole.MANAGER, isActive: true },
      { branchId: 3, role: BranchStaffRole.OPERATOR, isActive: true },
    ]);

    const result = await service.getPosOperations({
      branchId: 3,
      windowHours: 24,
      topItemsLimit: 5,
    });

    expect(result.summary.orderCount).toBe(2);
    expect(result.summary.grossSales).toBe(200);
    expect(result.summary.failedPaymentOrderCount).toBe(1);
    expect(result.alerts[0].code).toBe('FAILED_PAYMENT_RECOVERY');
    expect(result.paymentMix[0].paymentMethod).toBe(PaymentMethod.COD);
    expect(result.topItems[0].productName).toBe('Rice 5kg');
  });

  it('returns a tenant POS network summary', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    ordersRepository.find.mockResolvedValue([
      {
        id: 11,
        fulfillmentBranchId: 3,
        total: 120,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.FAILED,
        status: OrderStatus.PROCESSING,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        items: [],
      },
      {
        id: 14,
        fulfillmentBranchId: 8,
        total: 90,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.UNPAID,
        status: OrderStatus.PENDING,
        createdAt: new Date('2026-03-19T09:00:00.000Z'),
        items: [],
      },
    ] as any);
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      { branchId: 3, role: BranchStaffRole.MANAGER, isActive: true },
      { branchId: 8, role: BranchStaffRole.OPERATOR, isActive: true },
    ]);

    const result = await service.getPosNetworkSummary({
      branchId: 3,
      limit: 10,
      windowHours: 24,
      status: undefined,
    });

    expect(result.branchCount).toBe(2);
    expect(result.matchedBranchCount).toBe(2);
    expect(result.visibleBranchCount).toBe(2);
    expect(result.totalOrderCount).toBe(2);
    expect(result.criticalBranchCount).toBe(1);
    expect(result.highBranchCount).toBe(1);
    expect(result.alerts[0].code).toBe('NETWORK_POS_CRITICAL_BRANCHES');
    expect(result.branches[0].highestPriority).toBe('CRITICAL');
  });

  it('keeps tenant POS network totals based on all matched branches when limiting the visible list', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    ordersRepository.find.mockResolvedValue([
      {
        id: 11,
        fulfillmentBranchId: 3,
        total: 120,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.FAILED,
        status: OrderStatus.PROCESSING,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        items: [],
      },
      {
        id: 14,
        fulfillmentBranchId: 8,
        total: 90,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.UNPAID,
        status: OrderStatus.PENDING,
        createdAt: new Date('2026-03-19T09:00:00.000Z'),
        items: [],
      },
    ] as any);
    branchStaffAssignmentsRepository.find.mockResolvedValue([
      { branchId: 3, role: BranchStaffRole.MANAGER, isActive: true },
      { branchId: 8, role: BranchStaffRole.OPERATOR, isActive: true },
    ]);

    const result = await service.getPosNetworkSummary({
      branchId: 3,
      limit: 1,
      windowHours: 24,
      status: undefined,
    });

    expect(result.branchCount).toBe(2);
    expect(result.matchedBranchCount).toBe(2);
    expect(result.visibleBranchCount).toBe(1);
    expect(result.totalOrderCount).toBe(2);
    expect(result.totalGrossSales).toBe(210);
    expect(result.totalUnpaidOrderCount).toBe(1);
    expect(result.branches).toHaveLength(1);
  });

  it('returns a branch POS exception queue', async () => {
    ordersRepository.find.mockResolvedValue([
      {
        id: 18,
        fulfillmentBranchId: 3,
        total: 80,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentStatus: PaymentStatus.FAILED,
        paymentProofStatus: null,
        status: OrderStatus.PROCESSING,
        createdAt: new Date('2026-03-18T12:00:00.000Z'),
        deliveryAssignedAt: null,
        outForDeliveryAt: null,
        deliveryResolvedAt: null,
        shippingAddress: {
          fullName: 'Buyer One',
          phoneNumber: '251900000001',
        },
        items: [{ quantity: 2 }],
      },
      {
        id: 19,
        fulfillmentBranchId: 3,
        total: 150,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentStatus: PaymentStatus.UNPAID,
        paymentProofStatus: 'PENDING_REVIEW',
        status: OrderStatus.PENDING,
        createdAt: new Date('2026-03-19T06:00:00.000Z'),
        deliveryAssignedAt: null,
        outForDeliveryAt: null,
        deliveryResolvedAt: null,
        shippingAddress: {
          fullName: 'Buyer Two',
          phoneNumber: '251900000002',
        },
        items: [{ quantity: 1 }],
      },
    ] as any);

    const result = await service.getPosExceptions({
      branchId: 3,
      limit: 25,
      windowHours: 24,
      queueType: undefined,
      priority: undefined,
    });

    expect(result.summary.totalExceptionCount).toBe(2);
    expect(result.summary.failedPaymentCount).toBe(1);
    expect(result.summary.paymentReviewCount).toBe(1);
    expect(result.items[0].queueType).toBe('FAILED_PAYMENT');
    expect(result.items[0].actions[0].type).toBe('VIEW_POS_ORDER_DETAIL');
  });

  it('returns a tenant POS exception network summary', async () => {
    const failedPaymentCreatedAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
    const paymentReviewCreatedAt = new Date(Date.now() - 6 * 60 * 60 * 1000);

    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    ordersRepository.find.mockResolvedValue([
      {
        id: 18,
        fulfillmentBranchId: 3,
        total: 80,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentStatus: PaymentStatus.FAILED,
        paymentProofStatus: null,
        status: OrderStatus.PROCESSING,
        createdAt: failedPaymentCreatedAt,
        deliveryAssignedAt: null,
        outForDeliveryAt: null,
        deliveryResolvedAt: null,
        shippingAddress: { fullName: 'Buyer One', phoneNumber: '251900000001' },
        items: [{ quantity: 1 }],
      },
      {
        id: 19,
        fulfillmentBranchId: 8,
        total: 120,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentStatus: PaymentStatus.UNPAID,
        paymentProofStatus: 'PENDING_REVIEW',
        status: OrderStatus.PENDING,
        createdAt: paymentReviewCreatedAt,
        deliveryAssignedAt: null,
        outForDeliveryAt: null,
        deliveryResolvedAt: null,
        shippingAddress: { fullName: 'Buyer Two', phoneNumber: '251900000002' },
        items: [{ quantity: 2 }],
      },
    ] as any);

    const result = await service.getPosExceptionNetworkSummary({
      branchId: 3,
      limit: 10,
      windowHours: 24,
      queueType: undefined,
      priority: undefined,
    });

    expect(result.branchCount).toBe(2);
    expect(result.matchedBranchCount).toBe(2);
    expect(result.visibleBranchCount).toBe(2);
    expect(result.totalExceptionCount).toBe(2);
    expect(result.criticalBranchCount).toBe(1);
    expect(result.highBranchCount).toBe(1);
    expect(result.alerts[0].code).toBe('NETWORK_POS_EXCEPTION_CRITICAL');
    expect(result.branches[0].highestPriority).toBe('CRITICAL');
  });

  it('keeps tenant POS exception totals based on all matched branches when limiting the visible list', async () => {
    const failedPaymentCreatedAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
    const paymentReviewCreatedAt = new Date(Date.now() - 6 * 60 * 60 * 1000);

    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    ordersRepository.find.mockResolvedValue([
      {
        id: 18,
        fulfillmentBranchId: 3,
        total: 80,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentStatus: PaymentStatus.FAILED,
        paymentProofStatus: null,
        status: OrderStatus.PROCESSING,
        createdAt: failedPaymentCreatedAt,
        deliveryAssignedAt: null,
        outForDeliveryAt: null,
        deliveryResolvedAt: null,
        shippingAddress: { fullName: 'Buyer One', phoneNumber: '251900000001' },
        items: [{ quantity: 1 }],
      },
      {
        id: 19,
        fulfillmentBranchId: 8,
        total: 120,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentStatus: PaymentStatus.UNPAID,
        paymentProofStatus: 'PENDING_REVIEW',
        status: OrderStatus.PENDING,
        createdAt: paymentReviewCreatedAt,
        deliveryAssignedAt: null,
        outForDeliveryAt: null,
        deliveryResolvedAt: null,
        shippingAddress: { fullName: 'Buyer Two', phoneNumber: '251900000002' },
        items: [{ quantity: 2 }],
      },
    ] as any);

    const result = await service.getPosExceptionNetworkSummary({
      branchId: 3,
      limit: 1,
      windowHours: 24,
      queueType: undefined,
      priority: undefined,
    });

    expect(result.branchCount).toBe(2);
    expect(result.matchedBranchCount).toBe(2);
    expect(result.visibleBranchCount).toBe(1);
    expect(result.totalExceptionCount).toBe(2);
    expect(result.totalFailedPaymentCount).toBe(1);
    expect(result.totalPaymentReviewCount).toBe(1);
    expect(result.branches).toHaveLength(1);
  });

  it('exports the branch POS exception queue as CSV', async () => {
    jest.spyOn(service, 'getPosExceptions').mockResolvedValue({
      summary: {
        branchId: 3,
        windowHours: 24,
        totalExceptionCount: 1,
        filteredExceptionCount: 1,
        failedPaymentCount: 1,
        paymentReviewCount: 0,
        delayedFulfillmentCount: 0,
        criticalCount: 1,
        highCount: 0,
        normalCount: 0,
        lastOrderAt: new Date('2026-03-19T10:30:00.000Z'),
      },
      actions: [],
      items: [
        {
          orderId: 18,
          queueType: 'FAILED_PAYMENT',
          priority: 'CRITICAL',
          priorityReason:
            'Payment failed 12 hours ago and still needs branch recovery.',
          status: OrderStatus.PROCESSING,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          paymentStatus: PaymentStatus.FAILED,
          paymentProofStatus: null,
          total: 80,
          itemCount: 1,
          ageHours: 12,
          createdAt: new Date('2026-03-18T12:00:00.000Z'),
          deliveryAssignedAt: null,
          outForDeliveryAt: null,
          deliveryResolvedAt: null,
          customerName: 'Buyer One',
          customerPhoneNumber: '251900000001',
          actions: [
            {
              type: 'VIEW_POS_ORDER_DETAIL',
              method: 'GET',
              path: '/retail/v1/ops/pos-operations/orders/18?branchId=3',
              body: null,
              enabled: true,
            },
          ],
        },
      ],
    } as any);

    const csv = await service.exportPosExceptionsCsv({
      branchId: 3,
      limit: 25,
      windowHours: 24,
    });

    expect(csv).toContain('branchId,windowHours,orderId,queueType');
    expect(csv).toContain('3,24,18,"FAILED_PAYMENT"');
  });

  it('returns POS order drilldown detail with action hints', async () => {
    ordersRepository.findOne.mockResolvedValue({
      id: 18,
      fulfillmentBranchId: 3,
      total: 80,
      currency: 'USD',
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      paymentStatus: PaymentStatus.UNPAID,
      paymentProofStatus: 'PENDING_REVIEW',
      status: OrderStatus.PROCESSING,
      createdAt: new Date('2026-03-18T12:00:00.000Z'),
      deliveryAssignedAt: null,
      outForDeliveryAt: null,
      deliveryResolvedAt: null,
      proofOfDeliveryUrl: null,
      deliveryFailureReasonCode: null,
      deliveryFailureNotes: null,
      shippingAddress: {
        fullName: 'Buyer One',
        phoneNumber: '251900000001',
        city: 'Addis Ababa',
      },
      items: [
        {
          quantity: 2,
          price: 15,
          product: { id: 91, name: 'Rice 5kg' },
        },
      ],
    } as any);

    const result = await service.getPosOrderDetail(18, { branchId: 3 });

    expect(result.summary.orderId).toBe(18);
    expect(result.summary.queueType).toBe('PAYMENT_REVIEW');
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'VERIFY_PAYMENT_PROOF' }),
        expect.objectContaining({ type: 'REJECT_PAYMENT_PROOF' }),
      ]),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        productName: 'Rice 5kg',
        lineTotal: 30,
      }),
    );
  });

  it('includes POS Core in the network command center when the entitlement is active', async () => {
    retailEntitlementsService.getActiveBranchRetailAccess.mockResolvedValue({
      branch: {
        id: 3,
        name: 'HQ',
        code: 'HQ-3',
        retailTenantId: 21,
        isActive: true,
      },
      tenant: {
        id: 21,
        branches: [
          {
            id: 3,
            name: 'HQ',
            code: 'HQ-3',
            retailTenantId: 21,
            isActive: true,
          },
        ],
      },
      entitlements: [{ module: RetailModule.POS_CORE }],
    });
    jest.spyOn(service, 'getPosNetworkSummary').mockResolvedValue({
      anchorBranchId: 3,
      retailTenantId: 21,
      branchCount: 1,
      windowHours: 24,
      totalOrderCount: 12,
      totalGrossSales: 1480,
      totalPaidSales: 1310,
      totalUnpaidOrderCount: 2,
      totalFailedPaymentOrderCount: 1,
      totalDelayedFulfillmentOrderCount: 1,
      criticalBranchCount: 1,
      highBranchCount: 0,
      normalBranchCount: 0,
      alerts: [
        {
          code: 'NETWORK_POS_CRITICAL_BRANCHES',
          severity: 'CRITICAL',
          title: 'Critical POS recovery pressure spans multiple branches',
          summary: 'At least one branch needs immediate POS recovery.',
          metric: 1,
          action: 'Open the highest-priority branch first.',
        },
      ],
      branches: [
        {
          branchId: 3,
          branchName: 'HQ',
          branchCode: 'HQ-3',
          highestPriority: 'CRITICAL',
          highestPriorityReason: '1 orders need failed-payment recovery.',
          orderCount: 12,
          grossSales: 1480,
          paidSales: 1310,
          averageOrderValue: 123.33,
          unpaidOrderCount: 2,
          failedPaymentOrderCount: 1,
          delayedFulfillmentOrderCount: 1,
          activeStaffCount: 3,
          lastOrderAt: new Date('2026-03-19T10:30:00.000Z'),
          actions: [
            {
              type: 'VIEW_BRANCH_POS_OPERATIONS',
              method: 'GET',
              path: '/retail/v1/ops/pos-operations?branchId=3&windowHours=24',
              body: null,
              enabled: true,
            },
          ],
        },
      ],
    });

    const result = await service.getNetworkCommandCenterSummary({
      branchId: 3,
    });

    expect(result.enabledModuleCount).toBe(1);
    expect(result.modules[0].module).toBe(RetailModule.POS_CORE);
    expect(result.modules[0].metrics[0].key).toBe('delayedOrders');
  });

  it('returns a network command center summary across active retail modules', async () => {
    retailEntitlementsService.getActiveBranchRetailAccess.mockResolvedValue({
      branch: {
        id: 3,
        name: 'HQ',
        code: 'HQ-3',
        retailTenantId: 21,
        isActive: true,
      },
      tenant: {
        id: 21,
        branches: [
          {
            id: 3,
            name: 'HQ',
            code: 'HQ-3',
            retailTenantId: 21,
            isActive: true,
          },
          {
            id: 8,
            name: 'Airport',
            code: 'BR-8',
            retailTenantId: 21,
            isActive: true,
          },
        ],
      },
      entitlements: [
        { module: RetailModule.INVENTORY_CORE },
        { module: RetailModule.AI_ANALYTICS },
        { module: RetailModule.ACCOUNTING },
      ],
    });

    jest.spyOn(service, 'getStockHealthNetworkSummary').mockResolvedValue({
      anchorBranchId: 3,
      retailTenantId: 21,
      branchCount: 2,
      totalSkus: 30,
      healthyCount: 20,
      replenishmentCandidateCount: 8,
      outOfStockCount: 2,
      negativeAvailableCount: 1,
      inboundOpenPoUnits: 18,
      committedUnits: 11,
      outOfStockBranchCount: 1,
      reorderNowBranchCount: 0,
      lowStockBranchCount: 0,
      alerts: [
        {
          code: 'NETWORK_STOCKOUT_PRESSURE',
          severity: 'CRITICAL',
          title: 'Stockouts need attention',
          summary: 'One branch is already stocked out.',
          metric: 1,
          action: 'Open the riskiest branch first.',
        },
      ],
      branches: [
        {
          branchId: 3,
          branchName: 'HQ',
          branchCode: 'HQ-3',
          worstStockStatus: 'OUT_OF_STOCK',
          worstStockStatusReason: '2 SKUs are already out of stock.',
          totalSkus: 20,
          healthyCount: 12,
          replenishmentCandidateCount: 6,
          outOfStockCount: 2,
          negativeAvailableCount: 1,
          inboundOpenPoUnits: 18,
          committedUnits: 11,
          lastUpdatedAt: new Date('2026-03-18T09:00:00.000Z'),
          actions: [
            {
              type: 'VIEW_BRANCH_STOCK_HEALTH',
              method: 'GET',
              path: '/retail/v1/ops/stock-health?branchId=3',
              body: null,
              enabled: true,
            },
          ],
        },
      ],
    } as any);
    jest.spyOn(service, 'getAiNetworkSummary').mockResolvedValue({
      anchorBranchId: 3,
      retailTenantId: 21,
      branchCount: 2,
      averageHealthScore: 67,
      criticalBranchCount: 1,
      watchBranchCount: 1,
      infoBranchCount: 0,
      totalAtRiskSkus: 7,
      totalOutOfStockSkus: 2,
      totalNegativeAvailableSkus: 1,
      totalStaleOpenPurchaseOrderCount: 1,
      totalBlockedAutoSubmitDraftCount: 1,
      alerts: [
        {
          code: 'NETWORK_AI_CRITICAL_RISK',
          severity: 'CRITICAL',
          title: 'AI risk is elevated',
          summary: 'Critical AI signals exist in one branch.',
          metric: 1,
          action: 'Open the weakest branch.',
        },
      ],
      branches: [
        {
          branchId: 8,
          branchName: 'Airport',
          branchCode: 'BR-8',
          healthScore: 52,
          highestSeverity: 'CRITICAL',
          highestSeverityReason: 'Branch health score is below target',
          totalSkus: 15,
          atRiskSkus: 4,
          outOfStockSkus: 1,
          negativeAvailableSkus: 0,
          inboundOpenPoUnits: 8,
          openPurchaseOrderCount: 2,
          staleOpenPurchaseOrderCount: 1,
          blockedAutoSubmitDraftCount: 1,
          topInsightCodes: ['NETWORK_AI_CRITICAL_RISK'],
          actions: [
            {
              type: 'VIEW_BRANCH_AI_INSIGHTS',
              method: 'GET',
              path: '/retail/v1/ops/ai-insights?branchId=8',
              body: null,
              enabled: true,
            },
          ],
        },
      ],
    } as any);
    jest.spyOn(service, 'getAccountingNetworkSummary').mockResolvedValue({
      anchorBranchId: 3,
      retailTenantId: 21,
      branchCount: 2,
      openCommitmentCount: 6,
      openCommitmentValue: 820,
      receivedPendingReconciliationCount: 2,
      discrepancyOpenCount: 1,
      discrepancyApprovedCount: 0,
      reconcileReadyCount: 3,
      priorityQueue: {
        criticalCount: 1,
        highCount: 1,
        normalCount: 1,
      },
      criticalBranchCount: 0,
      highBranchCount: 1,
      normalBranchCount: 1,
      alerts: [
        {
          code: 'NETWORK_ACCOUNTING_QUEUE_WATCH',
          severity: 'WATCH',
          title: 'Accounting queue needs attention',
          summary: 'One branch has elevated accounting backlog.',
          metric: 1,
          action: 'Open the accounting queue.',
        },
      ],
      branches: [
        {
          branchId: 3,
          branchName: 'HQ',
          branchCode: 'HQ-3',
          highestPriority: 'HIGH',
          highestPriorityReason: 'Receipts are awaiting reconciliation.',
          openCommitmentCount: 4,
          openCommitmentValue: 600,
          receivedPendingReconciliationCount: 2,
          discrepancyOpenCount: 1,
          discrepancyApprovedCount: 0,
          reconcileReadyCount: 2,
          oldestOpenCommitmentAgeHours: 18,
          oldestReceivedPendingReconciliationAgeHours: 10,
          priorityQueue: {
            criticalCount: 1,
            highCount: 1,
            normalCount: 0,
          },
          queueItemCount: 4,
          actions: [
            {
              type: 'VIEW_BRANCH_ACCOUNTING_OVERVIEW',
              method: 'GET',
              path: '/retail/v1/ops/accounting-overview?branchId=3',
              body: null,
              enabled: true,
            },
          ],
        },
      ],
    } as any);
    const replenishmentSpy = jest.spyOn(
      service,
      'getReplenishmentNetworkSummary',
    );
    const desktopSpy = jest.spyOn(service, 'getDesktopNetworkSummary');

    const result = await service.getNetworkCommandCenterSummary({
      branchId: 3,
      branchLimit: 2,
    });

    expect(result).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        enabledModuleCount: 3,
        criticalModuleCount: 2,
        highModuleCount: 1,
        normalModuleCount: 0,
      }),
    );
    expect(result.modules.map((module) => module.module)).toEqual([
      RetailModule.INVENTORY_CORE,
      RetailModule.AI_ANALYTICS,
      RetailModule.ACCOUNTING,
    ]);
    expect(result.alerts[0]).toEqual(
      expect.objectContaining({
        module: RetailModule.INVENTORY_CORE,
        severity: 'CRITICAL',
      }),
    );
    expect(service.getStockHealthNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 2,
    });
    expect(service.getAiNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 2,
    });
    expect(service.getAccountingNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 2,
    });
    expect(replenishmentSpy).not.toHaveBeenCalled();
    expect(desktopSpy).not.toHaveBeenCalled();
  });

  it('includes HR attendance in the network command center when the entitlement is active', async () => {
    retailEntitlementsService.getActiveBranchRetailAccess.mockResolvedValue({
      branch: {
        id: 3,
        name: 'HQ',
        code: 'HQ-3',
        retailTenantId: 21,
        isActive: true,
      },
      tenant: {
        id: 21,
        branches: [
          {
            id: 3,
            name: 'HQ',
            code: 'HQ-3',
            retailTenantId: 21,
            isActive: true,
          },
          {
            id: 8,
            name: 'Airport',
            code: 'BR-8',
            retailTenantId: 21,
            isActive: true,
          },
        ],
      },
      entitlements: [{ module: RetailModule.HR_ATTENDANCE }],
    });
    retailAttendanceService.getAttendanceNetworkSummary.mockResolvedValue({
      anchorBranchId: 3,
      retailTenantId: 21,
      branchCount: 2,
      windowHours: 24,
      activeStaffCount: 14,
      checkedInStaffCount: 11,
      onDutyCount: 9,
      absentCount: 2,
      lateCheckInCount: 1,
      overtimeActiveCount: 1,
      averageAttendanceRate: 78.57,
      criticalBranchCount: 1,
      highBranchCount: 1,
      normalBranchCount: 0,
      alerts: [
        {
          code: 'HR_ATTENDANCE_ABSENT_STAFF',
          severity: 'CRITICAL',
          title: 'Active staff are missing attendance activity',
          summary:
            'One branch has active staff without recent attendance activity.',
          metric: 2,
          action: 'VIEW_HR_ATTENDANCE',
        },
      ],
      branches: [
        {
          branchId: 3,
          branchName: 'HQ',
          branchCode: 'HQ-3',
          highestRisk: 'CRITICAL',
          highestRiskReason:
            'At least one active branch staff member has no recent attendance activity.',
          activeStaffCount: 8,
          checkedInStaffCount: 6,
          onDutyCount: 5,
          absentCount: 2,
          lateCheckInCount: 0,
          overtimeActiveCount: 0,
          attendanceRate: 75,
          averageWorkedHours: 6,
          lastActivityAt: new Date('2026-03-19T10:30:00.000Z'),
          actions: [
            {
              type: 'VIEW_HR_ATTENDANCE',
              method: 'GET',
              path: '/retail/v1/ops/hr-attendance?branchId=3&windowHours=24',
              body: null,
              enabled: true,
            },
            {
              type: 'VIEW_HR_ATTENDANCE_EXCEPTIONS',
              method: 'GET',
              path: '/retail/v1/ops/hr-attendance/exceptions?branchId=3&windowHours=24&queueType=ABSENT',
              body: null,
              enabled: true,
            },
          ],
        },
      ],
    });

    const result = await service.getNetworkCommandCenterSummary({
      branchId: 3,
      branchLimit: 2,
    });

    expect(result.enabledModuleCount).toBe(1);
    expect(result.modules[0].module).toBe(RetailModule.HR_ATTENDANCE);
    expect(result.modules[0]).toEqual(
      expect.objectContaining({
        status: 'CRITICAL',
        metrics: expect.arrayContaining([
          expect.objectContaining({ key: 'absentStaff', value: 2 }),
          expect.objectContaining({ key: 'lateCheckIns', value: 1 }),
        ]),
      }),
    );
    expect(result.modules[0].branchPreviews[0].actionPath).toContain(
      '/hr-attendance/exceptions',
    );
    expect(
      retailAttendanceService.getAttendanceNetworkSummary,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 2,
      windowHours: 24,
    });
  });

  it('filters the network command center summary by module and status', async () => {
    retailEntitlementsService.getActiveBranchRetailAccess.mockResolvedValue({
      branch: {
        id: 3,
        name: 'HQ',
        code: 'HQ-3',
        retailTenantId: 21,
        isActive: true,
      },
      tenant: {
        id: 21,
        branches: [
          {
            id: 3,
            name: 'HQ',
            code: 'HQ-3',
            retailTenantId: 21,
            isActive: true,
          },
          {
            id: 8,
            name: 'Airport',
            code: 'BR-8',
            retailTenantId: 21,
            isActive: true,
          },
        ],
      },
      entitlements: [
        { module: RetailModule.INVENTORY_CORE },
        { module: RetailModule.AI_ANALYTICS },
      ],
    });

    const stockSpy = jest
      .spyOn(service, 'getStockHealthNetworkSummary')
      .mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        totalSkus: 30,
        healthyCount: 20,
        replenishmentCandidateCount: 8,
        outOfStockCount: 2,
        negativeAvailableCount: 1,
        inboundOpenPoUnits: 18,
        committedUnits: 11,
        outOfStockBranchCount: 1,
        reorderNowBranchCount: 0,
        lowStockBranchCount: 0,
        alerts: [
          {
            code: 'NETWORK_STOCKOUT_PRESSURE',
            severity: 'CRITICAL',
            title: 'Stockouts need attention',
            summary: 'One branch is already stocked out.',
            metric: 1,
            action: 'Open the riskiest branch first.',
          },
        ],
        branches: [],
      } as any);
    const aiSpy = jest.spyOn(service, 'getAiNetworkSummary').mockResolvedValue({
      anchorBranchId: 3,
      retailTenantId: 21,
      branchCount: 2,
      averageHealthScore: 88,
      criticalBranchCount: 0,
      watchBranchCount: 0,
      infoBranchCount: 2,
      totalAtRiskSkus: 1,
      totalOutOfStockSkus: 0,
      totalNegativeAvailableSkus: 0,
      totalStaleOpenPurchaseOrderCount: 0,
      totalBlockedAutoSubmitDraftCount: 0,
      alerts: [],
      branches: [],
    } as any);

    const result = await service.getNetworkCommandCenterSummary({
      branchId: 3,
      branchLimit: 2,
      module: RetailModule.INVENTORY_CORE,
      status: 'CRITICAL' as any,
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL' as any,
    });

    expect(result.enabledModuleCount).toBe(1);
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].module).toBe(RetailModule.INVENTORY_CORE);
    expect(result.modules[0].trend).toEqual(
      expect.objectContaining({
        previousStatus: null,
        direction: 'STABLE',
      }),
    );
    expect(stockSpy).toHaveBeenCalledWith({ branchId: 3, limit: 2 });
    expect(aiSpy).not.toHaveBeenCalled();
  });

  it('applies alert filters and trend comparison from a stored command center snapshot', async () => {
    retailEntitlementsService.getActiveBranchRetailAccess.mockResolvedValue({
      branch: {
        id: 3,
        name: 'HQ',
        code: 'HQ-3',
        retailTenantId: 21,
        isActive: true,
      },
      tenant: {
        id: 21,
        branches: [
          {
            id: 3,
            name: 'HQ',
            code: 'HQ-3',
            retailTenantId: 21,
            isActive: true,
          },
        ],
      },
      entitlements: [{ module: RetailModule.INVENTORY_CORE }],
    });
    redisService.get.mockResolvedValue(
      JSON.stringify({
        snapshotKey: 'snapshot-key',
        generatedAt: '2026-03-18T10:00:00.000Z',
        expiresAt: '2026-04-17T10:00:00.000Z',
        filters: {
          branchId: 3,
          branchLimit: 2,
          module: RetailModule.INVENTORY_CORE,
          status: 'CRITICAL',
          hasAlertsOnly: true,
          alertSeverity: 'CRITICAL',
        },
        summary: {
          anchorBranchId: 3,
          retailTenantId: 21,
          branchCount: 1,
          enabledModuleCount: 1,
          criticalModuleCount: 0,
          highModuleCount: 1,
          normalModuleCount: 0,
          alerts: [],
          modules: [
            {
              module: RetailModule.INVENTORY_CORE,
              title: 'Inventory health',
              status: 'HIGH',
              statusReason: '1 branches need immediate reorder action.',
              branchCount: 1,
              alertCount: 1,
              topAlert: null,
              metrics: [
                {
                  key: 'outOfStockBranches',
                  label: 'Out-of-stock branches',
                  value: 0,
                },
              ],
              actions: [],
              branchPreviews: [],
              trend: {
                previousStatus: null,
                statusDelta: null,
                direction: 'STABLE',
                previousAlertCount: null,
                previousHeadlineMetricKey: null,
                previousHeadlineMetricValue: null,
                headlineMetricDelta: null,
              },
            },
          ],
        },
      }),
    );
    jest.spyOn(service, 'getStockHealthNetworkSummary').mockResolvedValue({
      anchorBranchId: 3,
      retailTenantId: 21,
      branchCount: 1,
      totalSkus: 30,
      healthyCount: 20,
      replenishmentCandidateCount: 8,
      outOfStockCount: 2,
      negativeAvailableCount: 1,
      inboundOpenPoUnits: 18,
      committedUnits: 11,
      outOfStockBranchCount: 1,
      reorderNowBranchCount: 0,
      lowStockBranchCount: 0,
      alerts: [
        {
          code: 'NETWORK_STOCKOUT_PRESSURE',
          severity: 'CRITICAL',
          title: 'Stockouts need attention',
          summary: 'One branch is already stocked out.',
          metric: 1,
          action: 'Open the riskiest branch first.',
        },
      ],
      branches: [],
    } as any);

    const result = await service.getNetworkCommandCenterSummary({
      branchId: 3,
      branchLimit: 2,
      module: RetailModule.INVENTORY_CORE,
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL' as any,
    });

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].trend).toEqual(
      expect.objectContaining({
        previousStatus: 'HIGH',
        statusDelta: 1,
        direction: 'WORSENING',
        previousAlertCount: 1,
        previousHeadlineMetricKey: 'outOfStockBranches',
        previousHeadlineMetricValue: 0,
        headlineMetricDelta: 1,
      }),
    );
  });

  it('captures a network command center report snapshot for scheduled reporting', async () => {
    jest.spyOn(service, 'getNetworkCommandCenterSummary').mockResolvedValue({
      anchorBranchId: 3,
      retailTenantId: 21,
      branchCount: 1,
      enabledModuleCount: 1,
      criticalModuleCount: 1,
      highModuleCount: 0,
      normalModuleCount: 0,
      alerts: [],
      modules: [],
    });

    const snapshot = await service.captureNetworkCommandCenterReportSnapshot({
      branchId: 3,
      branchLimit: 2,
      module: RetailModule.INVENTORY_CORE,
      status: 'CRITICAL' as any,
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL' as any,
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        snapshotKey: expect.stringMatching(
          /^retail:ops:command-center:snapshot:3:/,
        ),
        filters: expect.objectContaining({
          branchId: 3,
          branchLimit: 2,
          module: RetailModule.INVENTORY_CORE,
          status: 'CRITICAL',
          hasAlertsOnly: true,
          alertSeverity: 'CRITICAL',
        }),
      }),
    );
    expect(redisService.set).toHaveBeenCalledWith(
      expect.stringMatching(/^retail:ops:command-center:snapshot:3:/),
      expect.any(String),
      2592000,
    );
  });

  it('returns the latest saved network command center report snapshot', async () => {
    redisService.get.mockResolvedValue(
      JSON.stringify({
        snapshotKey: 'retail:ops:command-center:snapshot:3:abc123',
        generatedAt: '2026-03-19T11:00:00.000Z',
        expiresAt: '2026-04-18T11:00:00.000Z',
        filters: {
          branchId: 3,
          branchLimit: 2,
          module: RetailModule.INVENTORY_CORE,
          status: 'CRITICAL',
          hasAlertsOnly: true,
          alertSeverity: 'CRITICAL',
        },
        summary: {
          anchorBranchId: 3,
          retailTenantId: 21,
          branchCount: 1,
          enabledModuleCount: 1,
          criticalModuleCount: 1,
          highModuleCount: 0,
          normalModuleCount: 0,
          alerts: [],
          modules: [],
        },
      }),
    );

    const snapshot = await service.getLatestNetworkCommandCenterReportSnapshot({
      branchId: 3,
      branchLimit: 2,
      module: RetailModule.INVENTORY_CORE,
      status: 'CRITICAL' as any,
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL' as any,
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        snapshotKey: 'retail:ops:command-center:snapshot:3:abc123',
        filters: expect.objectContaining({
          branchId: 3,
          branchLimit: 2,
        }),
      }),
    );
  });

  it('throws when no saved network command center report snapshot exists', async () => {
    await expect(
      service.getLatestNetworkCommandCenterReportSnapshot({
        branchId: 3,
        branchLimit: 2,
      }),
    ).rejects.toThrow(
      'No saved network command center report snapshot was found for the requested filter set',
    );
  });

  describe('RetailCommandCenterReportingService', () => {
    let reportingService: RetailCommandCenterReportingService;
    let configService: { get: jest.Mock };
    let retailOpsService: {
      captureNetworkCommandCenterReportSnapshot: jest.Mock;
    };

    beforeEach(async () => {
      configService = {
        get: jest.fn((key: string) => {
          if (key === 'RETAIL_COMMAND_CENTER_SNAPSHOT_SCHEDULE_ENABLED') {
            return 'true';
          }
          if (key === 'RETAIL_COMMAND_CENTER_SNAPSHOT_TARGETS') {
            return JSON.stringify([
              {
                branchId: 3,
                branchLimit: 2,
                module: 'INVENTORY_CORE',
                status: 'CRITICAL',
                hasAlertsOnly: true,
                alertSeverity: 'CRITICAL',
              },
            ]);
          }

          return undefined;
        }),
      };
      retailOpsService = {
        captureNetworkCommandCenterReportSnapshot: jest
          .fn()
          .mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RetailCommandCenterReportingService,
          { provide: ConfigService, useValue: configService },
          { provide: RetailOpsService, useValue: retailOpsService },
        ],
      }).compile();

      reportingService = module.get(RetailCommandCenterReportingService);
    });

    it('captures configured command center report snapshots on schedule', async () => {
      await reportingService.captureScheduledCommandCenterSnapshots();

      expect(
        retailOpsService.captureNetworkCommandCenterReportSnapshot,
      ).toHaveBeenCalledWith({
        branchId: 3,
        branchLimit: 2,
        module: 'INVENTORY_CORE',
        status: 'CRITICAL',
        hasAlertsOnly: true,
        alertSeverity: 'CRITICAL',
      });
    });
  });

  it('exports the network command center summary as CSV', async () => {
    jest.spyOn(service, 'getNetworkCommandCenterSummary').mockResolvedValue({
      anchorBranchId: 3,
      retailTenantId: 21,
      branchCount: 2,
      enabledModuleCount: 1,
      criticalModuleCount: 1,
      highModuleCount: 0,
      normalModuleCount: 0,
      alerts: [],
      modules: [
        {
          module: RetailModule.INVENTORY_CORE,
          title: 'Inventory health',
          status: 'CRITICAL',
          statusReason: '1 branches are already in stockout conditions.',
          branchCount: 2,
          alertCount: 1,
          topAlert: {
            module: RetailModule.INVENTORY_CORE,
            code: 'NETWORK_STOCKOUT_PRESSURE',
            severity: 'CRITICAL',
            title: 'Stockouts need attention',
            summary: 'One branch is already stocked out.',
            metric: 1,
            action: 'Open the riskiest branch first.',
          },
          metrics: [
            {
              key: 'outOfStockBranches',
              label: 'Out-of-stock branches',
              value: 1,
            },
            { key: 'outOfStockSkus', label: 'Out-of-stock SKUs', value: 2 },
          ],
          actions: [
            {
              type: 'VIEW_STOCK_HEALTH_NETWORK_SUMMARY',
              method: 'GET',
              path: '/retail/v1/ops/stock-health/network-summary?branchId=3',
              enabled: true,
            },
          ],
          trend: {
            previousStatus: 'HIGH',
            statusDelta: 1,
            direction: 'WORSENING',
            previousAlertCount: 0,
            previousHeadlineMetricKey: 'outOfStockBranches',
            previousHeadlineMetricValue: 0,
            headlineMetricDelta: 1,
          },
          branchPreviews: [
            {
              branchId: 3,
              branchName: 'HQ',
              branchCode: 'HQ-3',
              status: 'OUT_OF_STOCK',
              statusReason: '2 SKUs are already out of stock.',
              actionPath: '/retail/v1/ops/stock-health?branchId=3',
            },
          ],
        },
      ],
    });

    const csv = await service.exportNetworkCommandCenterSummaryCsv({
      branchId: 3,
      branchLimit: 2,
      module: RetailModule.INVENTORY_CORE,
      status: 'CRITICAL' as any,
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL' as any,
    });

    expect(csv).toContain(
      'anchorBranchId,retailTenantId,enabledModuleCount,module,title,status',
    );
    expect(csv).toContain(
      '3,21,1,"INVENTORY_CORE","Inventory health","CRITICAL"',
    );
    expect(csv).toContain('"outOfStockBranches:1|outOfStockSkus:2"');
    expect(csv).toContain(
      'trendPreviousStatus,trendStatusDelta,trendDirection',
    );
    expect(csv).toContain('"HIGH",1,"WORSENING"');
    expect(csv).toContain('"HQ"');
  });

  it('exports HR attendance modules in the network command center CSV', async () => {
    jest.spyOn(service, 'getNetworkCommandCenterSummary').mockResolvedValue({
      anchorBranchId: 3,
      retailTenantId: 21,
      branchCount: 2,
      enabledModuleCount: 1,
      criticalModuleCount: 1,
      highModuleCount: 0,
      normalModuleCount: 0,
      alerts: [],
      modules: [
        {
          module: RetailModule.HR_ATTENDANCE,
          title: 'HR attendance',
          status: 'CRITICAL',
          statusReason:
            '1 branches have missing attendance activity that needs immediate intervention.',
          branchCount: 2,
          alertCount: 1,
          topAlert: {
            module: RetailModule.HR_ATTENDANCE,
            code: 'HR_ATTENDANCE_ABSENT_STAFF',
            severity: 'CRITICAL',
            title: 'Active staff are missing attendance activity',
            summary:
              'One branch has active staff without recent attendance activity.',
            metric: 2,
            action: 'VIEW_HR_ATTENDANCE',
          },
          metrics: [
            { key: 'absentStaff', label: 'Absent staff', value: 2 },
            { key: 'lateCheckIns', label: 'Late check-ins', value: 1 },
          ],
          actions: [
            {
              type: 'VIEW_HR_ATTENDANCE_NETWORK_SUMMARY',
              method: 'GET',
              path: '/retail/v1/ops/hr-attendance/network-summary?branchId=3',
              enabled: true,
            },
          ],
          trend: {
            previousStatus: null,
            statusDelta: null,
            direction: 'STABLE',
            previousAlertCount: null,
            previousHeadlineMetricKey: null,
            previousHeadlineMetricValue: null,
            headlineMetricDelta: null,
          },
          branchPreviews: [
            {
              branchId: 3,
              branchName: 'HQ',
              branchCode: 'HQ-3',
              status: 'CRITICAL',
              statusReason:
                'At least one active branch staff member has no recent attendance activity.',
              actionPath:
                '/retail/v1/ops/hr-attendance/exceptions?branchId=3&windowHours=24&queueType=ABSENT',
            },
          ],
        },
      ],
    });

    const csv = await service.exportNetworkCommandCenterSummaryCsv({
      branchId: 3,
      branchLimit: 2,
      module: RetailModule.HR_ATTENDANCE,
    });

    expect(csv).toContain('"HR_ATTENDANCE","HR attendance","CRITICAL"');
    expect(csv).toContain('"absentStaff:2|lateCheckIns:1"');
    expect(csv).toContain(
      '/retail/v1/ops/hr-attendance/exceptions?branchId=3&windowHours=24&queueType=ABSENT',
    );
  });

  it('returns branch stock health summary with prioritized items', async () => {
    const result = await service.getStockHealth({
      branchId: 3,
      page: 1,
      limit: 20,
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        branchId: 3,
        totalSkus: 1,
        replenishmentCandidateCount: 1,
        outOfStockCount: 1,
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        productId: 9,
        stockStatus: 'OUT_OF_STOCK',
        shortageToSafetyStock: 5,
      }),
    );
  });

  it('returns stock health network summary across tenant branches', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    branchInventoryRepository.find.mockResolvedValue([
      {
        id: 1,
        branchId: 3,
        productId: 9,
        quantityOnHand: 0,
        reservedQuantity: 1,
        reservedOnline: 2,
        reservedStoreOps: 0,
        inboundOpenPo: 4,
        outboundTransfers: 0,
        safetyStock: 5,
        availableToSell: -1,
        version: 2,
        lastReceivedAt: null,
        lastPurchaseOrderId: 71,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T09:00:00.000Z'),
      },
      {
        id: 2,
        branchId: 8,
        productId: 10,
        quantityOnHand: 3,
        reservedQuantity: 0,
        reservedOnline: 0,
        reservedStoreOps: 0,
        inboundOpenPo: 2,
        outboundTransfers: 0,
        safetyStock: 4,
        availableToSell: 3,
        version: 1,
        lastReceivedAt: null,
        lastPurchaseOrderId: 72,
        createdAt: new Date('2026-03-18T07:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:30:00.000Z'),
      },
    ]);

    const result = await service.getStockHealthNetworkSummary({
      branchId: 3,
      limit: 5,
      stockStatus: 'OUT_OF_STOCK' as any,
    });

    expect(result).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        outOfStockBranchCount: 1,
        reorderNowBranchCount: 0,
        lowStockBranchCount: 0,
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'NETWORK_STOCKOUT_PRESSURE' }),
          expect.objectContaining({ code: 'NETWORK_NEGATIVE_AVAILABILITY' }),
        ]),
        branches: [
          expect.objectContaining({
            branchId: 3,
            worstStockStatus: 'OUT_OF_STOCK',
            outOfStockCount: 1,
            negativeAvailableCount: 1,
          }),
        ],
      }),
    );
  });

  it('keeps stock health network totals based on all matched branches when limiting the visible list', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    branchInventoryRepository.find.mockResolvedValue([
      {
        id: 1,
        branchId: 3,
        productId: 9,
        quantityOnHand: 0,
        reservedQuantity: 0,
        reservedOnline: 0,
        reservedStoreOps: 0,
        inboundOpenPo: 4,
        outboundTransfers: 0,
        safetyStock: 5,
        availableToSell: -1,
        version: 1,
        lastReceivedAt: null,
        lastPurchaseOrderId: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T09:00:00.000Z'),
      },
      {
        id: 2,
        branchId: 8,
        productId: 10,
        quantityOnHand: 0,
        reservedQuantity: 0,
        reservedOnline: 0,
        reservedStoreOps: 0,
        inboundOpenPo: 2,
        outboundTransfers: 0,
        safetyStock: 4,
        availableToSell: 0,
        version: 1,
        lastReceivedAt: null,
        lastPurchaseOrderId: null,
        createdAt: new Date('2026-03-18T07:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:30:00.000Z'),
      },
    ]);

    const result = await service.getStockHealthNetworkSummary({
      branchId: 3,
      limit: 1,
    });

    expect(result.outOfStockBranchCount).toBe(2);
    expect(result.outOfStockCount).toBe(2);
    expect(result.branches).toHaveLength(1);
  });

  it('returns AI insights with health score, alerts, and product risks', async () => {
    const openPurchaseOrderSummaryQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        openPurchaseOrderCount: '2',
        openPurchaseOrderValue: '480.5',
        staleOpenPurchaseOrderCount: '1',
        blockedAutoSubmitDraftCount: '1',
      }),
    };
    purchaseOrdersRepository.createQueryBuilder.mockReturnValue(
      openPurchaseOrderSummaryQb,
    );

    const result = await service.getAiInsights({ branchId: 3, limit: 10 });

    expect(result.summary).toEqual(
      expect.objectContaining({
        branchId: 3,
        totalSkus: 1,
        atRiskSkus: 1,
        outOfStockSkus: 1,
        negativeAvailableSkus: 0,
        openPurchaseOrderCount: 2,
        openPurchaseOrderValue: 480.5,
        staleOpenPurchaseOrderCount: 1,
        blockedAutoSubmitDraftCount: 1,
      }),
    );
    expect(result.summary.healthScore).toBeLessThan(100);
    expect(result.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HEALTH_SCORE_BELOW_TARGET',
        }),
        expect.objectContaining({
          code: 'STOCKOUT_PRESSURE',
          severity: 'CRITICAL',
        }),
        expect.objectContaining({
          code: 'AUTOMATION_BLOCKED',
          severity: 'WATCH',
        }),
      ]),
    );
    expect(result.productRisks[0]).toEqual(
      expect.objectContaining({
        productId: 9,
        stockStatus: 'OUT_OF_STOCK',
        shortageToSafetyStock: 5,
        recommendedReorderUnits: 1,
      }),
    );
  });

  it('uses AI analytics entitlement metadata to tune insight thresholds', async () => {
    const openPurchaseOrderSummaryQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        openPurchaseOrderCount: '1',
        openPurchaseOrderValue: '125',
        staleOpenPurchaseOrderCount: '1',
        blockedAutoSubmitDraftCount: '0',
      }),
    };
    purchaseOrdersRepository.createQueryBuilder.mockReturnValue(
      openPurchaseOrderSummaryQb,
    );
    retailEntitlementsService.getActiveBranchModuleEntitlement.mockResolvedValue(
      {
        module: 'AI_ANALYTICS',
        metadata: {
          aiAnalyticsPolicy: {
            stalePurchaseOrderHours: 24,
            targetHealthScore: 95,
          },
        },
      },
    );

    const result = await service.getAiInsights({ branchId: 3, limit: 10 });

    expect(
      retailEntitlementsService.getActiveBranchModuleEntitlement,
    ).toHaveBeenCalledWith(3, 'AI_ANALYTICS');
    expect(result.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HEALTH_SCORE_BELOW_TARGET',
        }),
        expect.objectContaining({
          code: 'STALE_INBOUND',
        }),
      ]),
    );
  });

  it('returns AI network summary across tenant branches', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    branchInventoryRepository.find.mockResolvedValue([
      {
        id: 1,
        branchId: 3,
        productId: 9,
        quantityOnHand: 0,
        reservedQuantity: 1,
        reservedOnline: 2,
        reservedStoreOps: 0,
        inboundOpenPo: 0,
        outboundTransfers: 0,
        safetyStock: 5,
        availableToSell: -1,
        version: 2,
        lastReceivedAt: null,
        lastPurchaseOrderId: 71,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T09:00:00.000Z'),
      },
      {
        id: 2,
        branchId: 8,
        productId: 10,
        quantityOnHand: 8,
        reservedQuantity: 0,
        reservedOnline: 0,
        reservedStoreOps: 0,
        inboundOpenPo: 1,
        outboundTransfers: 0,
        safetyStock: 4,
        availableToSell: 8,
        version: 1,
        lastReceivedAt: null,
        lastPurchaseOrderId: 72,
        createdAt: new Date('2026-03-18T07:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:30:00.000Z'),
      },
    ]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 81,
        branchId: 3,
        status: PurchaseOrderStatus.DRAFT,
        total: 125,
        createdAt: new Date('2026-03-14T08:00:00.000Z'),
        statusMeta: {
          autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
          lastAutoSubmissionAttempt: {
            blockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
          },
        },
      },
    ]);

    const result = await service.getAiNetworkSummary({
      branchId: 3,
      limit: 5,
      severity: 'CRITICAL' as any,
    });

    expect(result).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        criticalBranchCount: 1,
        watchBranchCount: 0,
        infoBranchCount: 0,
        totalOutOfStockSkus: 1,
        totalBlockedAutoSubmitDraftCount: 1,
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'NETWORK_AI_CRITICAL_RISK' }),
          expect.objectContaining({ code: 'NETWORK_AI_AUTOMATION_BLOCKED' }),
          expect.objectContaining({ code: 'NETWORK_AI_STALE_INBOUND' }),
        ]),
        branches: [
          expect.objectContaining({
            branchId: 3,
            highestSeverity: 'CRITICAL',
            outOfStockSkus: 1,
            blockedAutoSubmitDraftCount: 1,
          }),
        ],
      }),
    );
  });

  it('keeps AI network totals based on all matched branches when limiting the visible list', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    branchInventoryRepository.find.mockResolvedValue([
      {
        id: 1,
        branchId: 3,
        productId: 9,
        quantityOnHand: 0,
        reservedQuantity: 0,
        reservedOnline: 0,
        reservedStoreOps: 0,
        inboundOpenPo: 0,
        outboundTransfers: 0,
        safetyStock: 5,
        availableToSell: -1,
        version: 1,
        lastReceivedAt: null,
        lastPurchaseOrderId: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T09:00:00.000Z'),
      },
      {
        id: 2,
        branchId: 8,
        productId: 10,
        quantityOnHand: 0,
        reservedQuantity: 0,
        reservedOnline: 0,
        reservedStoreOps: 0,
        inboundOpenPo: 0,
        outboundTransfers: 0,
        safetyStock: 4,
        availableToSell: 0,
        version: 1,
        lastReceivedAt: null,
        lastPurchaseOrderId: null,
        createdAt: new Date('2026-03-18T07:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:30:00.000Z'),
      },
    ]);
    purchaseOrdersRepository.find.mockResolvedValue([]);

    const result = await service.getAiNetworkSummary({ branchId: 3, limit: 1 });

    expect(result.criticalBranchCount).toBe(2);
    expect(result.totalOutOfStockSkus).toBe(2);
    expect(result.branches).toHaveLength(1);
  });

  it('returns an accounting overview for open commitments and reconciliation work', async () => {
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 81,
        orderNumber: 'PO-81',
        branchId: 3,
        supplierProfileId: 14,
        createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        total: 220,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 4,
            shortageQuantity: 1,
            damagedQuantity: 0,
          },
        ],
      },
      {
        id: 82,
        orderNumber: 'PO-82',
        branchId: 3,
        supplierProfileId: 16,
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        total: 300,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 5,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      },
      {
        id: 83,
        orderNumber: 'PO-83',
        branchId: 3,
        supplierProfileId: 18,
        createdAt: new Date(Date.now() - 54 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.SUBMITTED,
        currency: 'USD',
        total: 125,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 0,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      },
    ]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 501,
        purchaseOrderId: 81,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
        createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      },
      {
        id: 502,
        purchaseOrderId: 82,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    ]);

    const result = await service.getAccountingOverview({
      branchId: 3,
      limit: 20,
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        branchId: 3,
        openCommitmentCount: 1,
        openCommitmentValue: 125,
        discrepancyOpenCount: 1,
        discrepancyApprovedCount: 1,
        reconcileReadyCount: 1,
        oldestOpenCommitmentAgeHours: expect.any(Number),
        oldestReceivedPendingReconciliationAgeHours: 0,
        supplierExposure: expect.arrayContaining([
          expect.objectContaining({
            supplierProfileId: 18,
            openCommitmentCount: 1,
            openCommitmentValue: 125,
            shortageUnitCount: 0,
            damagedUnitCount: 0,
          }),
          expect.objectContaining({
            supplierProfileId: 16,
            receivedPendingReconciliationCount: 1,
          }),
        ]),
        discrepancyOpenAgingBuckets: {
          under24Hours: 0,
          between24And72Hours: 0,
          over72Hours: 1,
        },
        discrepancyAwaitingApprovalAgingBuckets: {
          under24Hours: 0,
          between24And72Hours: 0,
          over72Hours: 0,
        },
        priorityQueue: {
          critical: 1,
          high: 0,
          normal: 2,
        },
      }),
    );
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DISCREPANCY_SLA_BREACH',
          severity: 'CRITICAL',
        }),
      ]),
    );
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purchaseOrderId: 81,
          accountingState: 'DISCREPANCY_REVIEW',
          priority: 'CRITICAL',
          priorityReason: 'Open discrepancy has exceeded the 72-hour SLA.',
          lastReceiptEventId: 501,
          orderAgeHours: expect.any(Number),
          lastReceiptEventAgeHours: expect.any(Number),
        }),
        expect.objectContaining({
          purchaseOrderId: 82,
          accountingState: 'READY_TO_RECONCILE',
          priority: 'NORMAL',
          actions: expect.arrayContaining([
            expect.objectContaining({
              type: 'MARK_RECONCILED',
            }),
          ]),
        }),
        expect.objectContaining({
          purchaseOrderId: 83,
          accountingState: 'OPEN_COMMITMENT',
          priority: 'NORMAL',
        }),
      ]),
    );
  });

  it('filters accounting overview by state, supplier, and SLA breach', async () => {
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 81,
        orderNumber: 'PO-81',
        branchId: 3,
        supplierProfileId: 14,
        createdAt: new Date(Date.now() - 90 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        total: 220,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 4,
            shortageQuantity: 1,
            damagedQuantity: 0,
          },
        ],
      },
      {
        id: 82,
        orderNumber: 'PO-82',
        branchId: 3,
        supplierProfileId: 16,
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        total: 300,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 5,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      },
    ]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 501,
        purchaseOrderId: 81,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
        createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      },
    ]);

    const result = await service.getAccountingOverview({
      branchId: 3,
      limit: 20,
      accountingState: 'DISCREPANCY_REVIEW' as any,
      supplierProfileId: 14,
      slaBreachedOnly: true,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        purchaseOrderId: 81,
        supplierProfileId: 14,
        accountingState: 'DISCREPANCY_REVIEW',
        priority: 'CRITICAL',
      }),
    );
    expect(result.summary.discrepancyOpenCount).toBe(1);
    expect(result.summary.priorityQueue).toEqual({
      critical: 1,
      high: 0,
      normal: 0,
    });
  });

  it('filters accounting overview by priority', async () => {
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 81,
        orderNumber: 'PO-81',
        branchId: 3,
        supplierProfileId: 14,
        createdAt: new Date(Date.now() - 90 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        total: 220,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 4,
            shortageQuantity: 1,
            damagedQuantity: 0,
          },
        ],
      },
      {
        id: 83,
        orderNumber: 'PO-83',
        branchId: 3,
        supplierProfileId: 18,
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.SUBMITTED,
        currency: 'USD',
        total: 125,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 0,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      },
    ]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 501,
        purchaseOrderId: 81,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
        createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      },
    ]);

    const result = await service.getAccountingOverview({
      branchId: 3,
      limit: 20,
      priority: 'CRITICAL' as any,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        purchaseOrderId: 81,
        priority: 'CRITICAL',
      }),
    );
    expect(result.summary.priorityQueue).toEqual({
      critical: 1,
      high: 0,
      normal: 0,
    });
  });

  it('prioritizes aged accounting work ahead of routine queue items', async () => {
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 90,
        orderNumber: 'PO-90',
        branchId: 3,
        supplierProfileId: 21,
        createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.SUBMITTED,
        currency: 'USD',
        total: 900,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 0,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      },
      {
        id: 91,
        orderNumber: 'PO-91',
        branchId: 3,
        supplierProfileId: 22,
        createdAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        total: 400,
        items: [
          {
            orderedQuantity: 6,
            receivedQuantity: 6,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      },
      {
        id: 92,
        orderNumber: 'PO-92',
        branchId: 3,
        supplierProfileId: 23,
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        total: 180,
        items: [
          {
            orderedQuantity: 3,
            receivedQuantity: 3,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      },
    ]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([]);

    const result = await service.getAccountingOverview({
      branchId: 3,
      limit: 20,
    });

    expect(result.items.map((item) => item.purchaseOrderId)).toEqual([
      91, 90, 92,
    ]);
    expect(result.items.map((item) => item.priority)).toEqual([
      'HIGH',
      'HIGH',
      'NORMAL',
    ]);
    expect(result.summary.priorityQueue).toEqual({
      critical: 0,
      high: 2,
      normal: 1,
    });
  });

  it('returns an accounting network summary across tenant branches', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 81,
        orderNumber: 'PO-81',
        branchId: 3,
        supplierProfileId: 14,
        createdAt: new Date(Date.now() - 90 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        total: 220,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 4,
            shortageQuantity: 1,
            damagedQuantity: 0,
          },
        ],
      },
      {
        id: 82,
        orderNumber: 'PO-82',
        branchId: 8,
        supplierProfileId: 16,
        createdAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        total: 300,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 5,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      },
      {
        id: 83,
        orderNumber: 'PO-83',
        branchId: 8,
        supplierProfileId: 18,
        createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.SUBMITTED,
        currency: 'USD',
        total: 900,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 0,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      },
    ]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 501,
        purchaseOrderId: 81,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
        createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      },
      {
        id: 502,
        purchaseOrderId: 82,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    ]);

    const result = await service.getAccountingNetworkSummary({
      branchId: 3,
      limit: 10,
      priority: 'CRITICAL' as any,
      accountingState: 'DISCREPANCY_REVIEW' as any,
    });

    expect(result).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        openCommitmentCount: 0,
        openCommitmentValue: 0,
        receivedPendingReconciliationCount: 0,
        discrepancyOpenCount: 1,
        discrepancyApprovedCount: 0,
        reconcileReadyCount: 0,
        priorityQueue: { critical: 1, high: 0, normal: 0 },
        criticalBranchCount: 1,
        highBranchCount: 0,
        normalBranchCount: 0,
      }),
    );
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'NETWORK_DISCREPANCY_SLA_RISK' }),
      ]),
    );
    expect(result.branches).toEqual([
      expect.objectContaining({
        branchId: 3,
        highestPriority: 'CRITICAL',
        actions: expect.arrayContaining([
          expect.objectContaining({
            type: 'VIEW_BRANCH_ACCOUNTING_OVERVIEW',
            path: '/retail/v1/ops/accounting-overview?branchId=3&accountingState=DISCREPANCY_REVIEW',
          }),
        ]),
      }),
    ]);
  });

  it('keeps accounting network totals based on all matched branches when limiting the visible list', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 81,
        orderNumber: 'PO-81',
        branchId: 3,
        supplierProfileId: 14,
        createdAt: new Date(Date.now() - 90 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        total: 220,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 4,
            shortageQuantity: 1,
            damagedQuantity: 0,
          },
        ],
      },
      {
        id: 83,
        orderNumber: 'PO-83',
        branchId: 8,
        supplierProfileId: 18,
        createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000),
        status: PurchaseOrderStatus.SUBMITTED,
        currency: 'USD',
        total: 900,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 0,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
      },
    ]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 501,
        purchaseOrderId: 81,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
        createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      },
    ]);

    const result = await service.getAccountingNetworkSummary({
      branchId: 3,
      limit: 1,
    });

    expect(result.openCommitmentCount).toBe(1);
    expect(result.discrepancyOpenCount).toBe(1);
    expect(result.priorityQueue.critical).toBe(1);
    expect(result.priorityQueue.high).toBe(1);
    expect(result.branches).toHaveLength(1);
  });

  it('returns accounting payout exceptions for the requested branch', async () => {
    payoutLogRepository.find.mockResolvedValue([
      {
        id: 901,
        provider: PayoutProvider.EBIRR,
        status: PayoutStatus.FAILED,
        amount: 80,
        currency: 'ETB',
        phoneNumber: '251900000111',
        transactionReference: 'ORD-18-ITEM-201',
        orderId: 18,
        orderItemId: 201,
        failureReason: 'Gateway timeout',
        createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        vendor: {
          id: 77,
          displayName: 'Vendor One',
          phoneNumber: '251900000111',
        },
      },
      {
        id: 902,
        provider: PayoutProvider.EBIRR,
        status: PayoutStatus.SUCCESS,
        amount: 120,
        currency: 'ETB',
        phoneNumber: '251900000222',
        transactionReference: 'ORD-19-ITEM-202',
        orderId: 19,
        orderItemId: 202,
        failureReason:
          'RECONCILE_REQUIRED: Wallet debit failed after provider payout success',
        createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
        vendor: {
          id: 78,
          displayName: 'Vendor Two',
          phoneNumber: '251900000222',
        },
      },
    ]);
    ordersRepository.find.mockResolvedValue([
      {
        id: 18,
        fulfillmentBranchId: 3,
        paymentMethod: PaymentMethod.EBIRR,
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.DELIVERED,
      },
      {
        id: 19,
        fulfillmentBranchId: 3,
        paymentMethod: PaymentMethod.EBIRR,
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.DELIVERED,
      },
    ] as any);

    const result = await service.getAccountingPayoutExceptions({
      branchId: 3,
      limit: 25,
      windowHours: 168,
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        branchId: 3,
        totalExceptionCount: 2,
        filteredExceptionCount: 2,
        autoRetryRequiredCount: 1,
        reconciliationRequiredCount: 1,
        criticalCount: 1,
        highCount: 0,
        normalCount: 1,
        totalAmountAtRisk: 200,
      }),
    );
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ACCOUNTING_PAYOUT_CRITICAL' }),
        expect.objectContaining({ code: 'AUTO_PAYOUT_RETRY_BACKLOG' }),
      ]),
    );
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payoutLogId: 901,
          exceptionType: 'AUTO_RETRY_REQUIRED',
          priority: 'CRITICAL',
          actions: expect.arrayContaining([
            expect.objectContaining({
              type: 'RETRY_AUTO_PAYOUT',
              path: '/admin/wallet/payouts/901/retry-auto',
              enabled: true,
            }),
          ]),
        }),
        expect.objectContaining({
          payoutLogId: 902,
          exceptionType: 'RECONCILIATION_REQUIRED',
          priority: 'NORMAL',
          actions: expect.arrayContaining([
            expect.objectContaining({
              type: 'RECONCILE_PAYOUT_EXCEPTION',
              path: '/admin/wallet/payouts/902/reconcile-exception',
              enabled: true,
            }),
          ]),
        }),
      ]),
    );
  });

  it('returns an accounting payout network summary across tenant branches', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    payoutLogRepository.find.mockResolvedValue([
      {
        id: 901,
        provider: PayoutProvider.EBIRR,
        status: PayoutStatus.FAILED,
        amount: 80,
        currency: 'ETB',
        phoneNumber: '251900000111',
        transactionReference: 'ORD-18-ITEM-201',
        orderId: 18,
        orderItemId: 201,
        failureReason: 'Gateway timeout',
        createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        vendor: {
          id: 77,
          displayName: 'Vendor One',
          phoneNumber: '251900000111',
        },
      },
      {
        id: 902,
        provider: PayoutProvider.EBIRR,
        status: PayoutStatus.SUCCESS,
        amount: 120,
        currency: 'ETB',
        phoneNumber: '251900000222',
        transactionReference: 'ORD-19-ITEM-202',
        orderId: 19,
        orderItemId: 202,
        failureReason:
          'RECONCILE_REQUIRED: Wallet debit failed after provider payout success',
        createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
        vendor: {
          id: 78,
          displayName: 'Vendor Two',
          phoneNumber: '251900000222',
        },
      },
    ]);
    ordersRepository.find.mockResolvedValue([
      {
        id: 18,
        fulfillmentBranchId: 3,
        paymentMethod: PaymentMethod.EBIRR,
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.DELIVERED,
      },
      {
        id: 19,
        fulfillmentBranchId: 8,
        paymentMethod: PaymentMethod.EBIRR,
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.DELIVERED,
      },
    ] as any);

    const result = await service.getAccountingPayoutNetworkSummary({
      branchId: 3,
      limit: 10,
      windowHours: 168,
      priority: 'CRITICAL' as any,
    });

    expect(result).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        exceptionCount: 1,
        autoRetryRequiredCount: 1,
        reconciliationRequiredCount: 0,
        totalAmountAtRisk: 80,
        priorityQueue: { critical: 1, high: 0, normal: 0 },
        criticalBranchCount: 1,
      }),
    );
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'NETWORK_ACCOUNTING_PAYOUT_CRITICAL' }),
      ]),
    );
    expect(result.branches).toEqual([
      expect.objectContaining({
        branchId: 3,
        highestPriority: 'CRITICAL',
        actions: expect.arrayContaining([
          expect.objectContaining({
            type: 'VIEW_BRANCH_ACCOUNTING_PAYOUT_EXCEPTIONS',
            path: '/retail/v1/ops/accounting-overview/payout-exceptions?branchId=3&windowHours=168',
          }),
        ]),
      }),
    ]);
  });

  it('returns a desktop workbench for sync failures, transfer backlog, and inventory adjustments', async () => {
    posSyncJobsRepository.find.mockResolvedValue([
      {
        id: 401,
        branchId: 3,
        syncType: PosSyncType.STOCK_DELTA,
        status: PosSyncStatus.FAILED,
        rejectedCount: 2,
        failedEntries: [{ entryIndex: 1, quantity: 2, error: 'alias missing' }],
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        processedAt: null,
      },
      {
        id: 402,
        branchId: 3,
        syncType: PosSyncType.SALES_SUMMARY,
        status: PosSyncStatus.PROCESSED,
        rejectedCount: 0,
        failedEntries: [],
        createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
        processedAt: new Date(Date.now() - 9 * 60 * 60 * 1000),
      },
    ]);
    branchTransfersRepository.find.mockResolvedValue([
      {
        id: 301,
        transferNumber: 'TR-301',
        fromBranchId: 8,
        toBranchId: 3,
        status: BranchTransferStatus.DISPATCHED,
        createdAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
        items: [{ quantity: 12 }],
      },
      {
        id: 302,
        transferNumber: 'TR-302',
        fromBranchId: 3,
        toBranchId: 9,
        status: BranchTransferStatus.REQUESTED,
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        items: [{ quantity: 4 }],
      },
    ]);
    stockMovementsRepository.find.mockResolvedValue([
      {
        id: 201,
        branchId: 3,
        movementType: StockMovementType.ADJUSTMENT,
        quantityDelta: -18,
        sourceType: 'MANUAL_RECOUNT',
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
        note: 'cycle count drift',
      },
      {
        id: 202,
        branchId: 3,
        movementType: StockMovementType.ADJUSTMENT,
        quantityDelta: -4,
        sourceType: 'MANUAL_RECOUNT',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        note: null,
      },
    ]);

    const result = await service.getDesktopWorkbench({
      branchId: 3,
      limit: 10,
      windowHours: 72,
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        branchId: 3,
        windowHours: 72,
        failedPosSyncJobCount: 1,
        openPosSyncJobCount: 0,
        rejectedSyncEntryCount: 2,
        pendingTransferCount: 2,
        inboundTransferPendingCount: 1,
        outboundTransferPendingCount: 1,
        negativeAdjustmentCount: 2,
        totalNegativeAdjustmentUnits: 22,
        lastProcessedPosSyncAt: null,
      }),
    );
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'POS_SYNC_FAILURES',
          severity: 'CRITICAL',
        }),
        expect.objectContaining({
          code: 'INBOUND_TRANSFER_BACKLOG',
          severity: 'CRITICAL',
        }),
        expect.objectContaining({ code: 'ADJUSTMENT_DRIFT' }),
      ]),
    );
    expect(result.syncQueue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: 401,
          priority: 'CRITICAL',
          actions: expect.arrayContaining([
            expect.objectContaining({ type: 'VIEW_SYNC_JOB' }),
          ]),
        }),
      ]),
    );
    expect(result.transferQueue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transferId: 301,
          direction: 'INBOUND',
          priority: 'CRITICAL',
        }),
      ]),
    );
    expect(result.stockExceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          movementId: 201,
          priority: 'HIGH',
          actions: expect.arrayContaining([
            expect.objectContaining({ type: 'VIEW_STOCK_MOVEMENTS' }),
          ]),
        }),
      ]),
    );
  });

  it('returns a desktop network summary across tenant branches', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    posSyncJobsRepository.find.mockResolvedValue([
      {
        id: 401,
        branchId: 3,
        syncType: PosSyncType.STOCK_DELTA,
        status: PosSyncStatus.FAILED,
        rejectedCount: 2,
        failedEntries: [{ entryIndex: 1, quantity: 2, error: 'alias missing' }],
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        processedAt: null,
      },
      {
        id: 402,
        branchId: 8,
        syncType: PosSyncType.STOCK_SNAPSHOT,
        status: PosSyncStatus.RECEIVED,
        rejectedCount: 0,
        failedEntries: [],
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        processedAt: null,
      },
    ]);
    branchTransfersRepository.find.mockResolvedValue([
      {
        id: 301,
        transferNumber: 'TR-301',
        fromBranchId: 8,
        toBranchId: 3,
        status: BranchTransferStatus.DISPATCHED,
        createdAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
        items: [{ quantity: 12 }],
      },
      {
        id: 302,
        transferNumber: 'TR-302',
        fromBranchId: 8,
        toBranchId: 9,
        status: BranchTransferStatus.REQUESTED,
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        items: [{ quantity: 5 }],
      },
    ]);
    stockMovementsRepository.find.mockResolvedValue([
      {
        id: 201,
        branchId: 8,
        movementType: StockMovementType.ADJUSTMENT,
        quantityDelta: -24,
        sourceType: 'MANUAL_RECOUNT',
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
        note: 'cycle count drift',
      },
    ]);

    const result = await service.getDesktopNetworkSummary({
      branchId: 3,
      limit: 10,
      windowHours: 72,
      queueType: 'STOCK_EXCEPTIONS' as any,
      priority: 'HIGH' as any,
    });

    expect(result).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        failedPosSyncJobCount: 0,
        openPosSyncJobCount: 0,
        rejectedSyncEntryCount: 0,
        pendingTransferCount: 0,
        inboundTransferPendingCount: 0,
        outboundTransferPendingCount: 0,
        negativeAdjustmentCount: 1,
        totalNegativeAdjustmentUnits: 24,
        criticalBranchCount: 0,
        highBranchCount: 1,
        normalBranchCount: 0,
      }),
    );
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'NETWORK_ADJUSTMENT_DRIFT' }),
      ]),
    );
    expect(result.branches).toEqual([
      expect.objectContaining({
        branchId: 8,
        branchName: 'Airport',
        highestPriority: 'HIGH',
        totalNegativeAdjustmentUnits: 24,
        actions: expect.arrayContaining([
          expect.objectContaining({
            type: 'VIEW_BRANCH_DESKTOP_WORKBENCH',
            path: '/retail/v1/ops/desktop-workbench?branchId=8&windowHours=72&queueType=STOCK_EXCEPTIONS',
          }),
        ]),
      }),
    ]);
  });

  it('keeps desktop network totals based on all matched branches when limiting the visible list', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    posSyncJobsRepository.find.mockResolvedValue([
      {
        id: 401,
        branchId: 3,
        syncType: PosSyncType.STOCK_DELTA,
        status: PosSyncStatus.FAILED,
        rejectedCount: 2,
        failedEntries: [{ entryIndex: 1, quantity: 2, error: 'alias missing' }],
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        processedAt: null,
      },
      {
        id: 402,
        branchId: 8,
        syncType: PosSyncType.STOCK_SNAPSHOT,
        status: PosSyncStatus.RECEIVED,
        rejectedCount: 0,
        failedEntries: [],
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        processedAt: null,
      },
    ]);
    branchTransfersRepository.find.mockResolvedValue([]);
    stockMovementsRepository.find.mockResolvedValue([]);

    const result = await service.getDesktopNetworkSummary({
      branchId: 3,
      limit: 1,
      windowHours: 72,
    });

    expect(result.failedPosSyncJobCount).toBe(1);
    expect(result.openPosSyncJobCount).toBe(1);
    expect(result.rejectedSyncEntryCount).toBe(2);
    expect(result.branches).toHaveLength(1);
  });

  it('filters desktop workbench queues by queue type and priority', async () => {
    posSyncJobsRepository.find.mockResolvedValue([
      {
        id: 401,
        branchId: 3,
        syncType: PosSyncType.STOCK_DELTA,
        status: PosSyncStatus.FAILED,
        rejectedCount: 2,
        failedEntries: [{ entryIndex: 1, quantity: 2, error: 'alias missing' }],
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        processedAt: null,
      },
      {
        id: 403,
        branchId: 3,
        syncType: PosSyncType.STOCK_SNAPSHOT,
        status: PosSyncStatus.RECEIVED,
        rejectedCount: 0,
        failedEntries: [],
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        processedAt: null,
      },
    ]);
    branchTransfersRepository.find.mockResolvedValue([
      {
        id: 301,
        transferNumber: 'TR-301',
        fromBranchId: 8,
        toBranchId: 3,
        status: BranchTransferStatus.DISPATCHED,
        createdAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
        items: [{ quantity: 12 }],
      },
    ]);
    stockMovementsRepository.find.mockResolvedValue([
      {
        id: 201,
        branchId: 3,
        movementType: StockMovementType.ADJUSTMENT,
        quantityDelta: -18,
        sourceType: 'MANUAL_RECOUNT',
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
        note: 'cycle count drift',
      },
    ]);

    const result = await service.getDesktopWorkbench({
      branchId: 3,
      limit: 10,
      windowHours: 72,
      queueType: 'SYNC_QUEUE' as any,
      priority: 'CRITICAL' as any,
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        failedPosSyncJobCount: 1,
        openPosSyncJobCount: 0,
        rejectedSyncEntryCount: 2,
        pendingTransferCount: 0,
        negativeAdjustmentCount: 0,
        lastProcessedPosSyncAt: null,
      }),
    );
    expect(result.syncQueue).toHaveLength(1);
    expect(result.syncQueue[0]).toEqual(
      expect.objectContaining({
        jobId: 401,
        priority: 'CRITICAL',
      }),
    );
    expect(result.transferQueue).toEqual([]);
    expect(result.stockExceptions).toEqual([]);
  });

  it('returns failed POS sync entries for the desktop workbench drilldown', async () => {
    posSyncJobsRepository.findOne.mockResolvedValue({
      id: 401,
      branchId: 3,
      syncType: PosSyncType.STOCK_DELTA,
      status: PosSyncStatus.FAILED,
      rejectedCount: 2,
      failedEntries: [
        {
          entryIndex: 1,
          productId: 9,
          aliasType: 'SKU',
          aliasValue: 'ABC-9',
          quantity: 2,
          movementType: 'TRANSFER',
          counterpartyBranchId: 8,
          transferId: 301,
          note: 'from branch 8',
          error: 'alias missing',
        },
        {
          entryIndex: 2,
          productId: 10,
          aliasType: null,
          aliasValue: null,
          quantity: 1,
          movementType: 'SALE',
          counterpartyBranchId: null,
          transferId: null,
          note: null,
          error: 'product not found',
        },
      ],
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      processedAt: null,
    });

    const result = await service.getDesktopSyncJobFailedEntries(401, {
      branchId: 3,
      limit: 25,
      priority: 'CRITICAL' as any,
      movementType: 'TRANSFER',
      transferOnly: true,
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        jobId: 401,
        branchId: 3,
        syncType: PosSyncType.STOCK_DELTA,
        status: PosSyncStatus.FAILED,
        rejectedCount: 2,
        failedEntryCount: 2,
        filteredEntryCount: 1,
        criticalEntryCount: 1,
        highEntryCount: 0,
        normalEntryCount: 0,
        transferLinkedEntryCount: 1,
      }),
    );
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'VIEW_SYNC_JOB' }),
        expect.objectContaining({
          type: 'REPLAY_SYNC_FAILURES',
          body: { branchId: 3, entryIndexes: [1] },
        }),
      ]),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        entryIndex: 1,
        priority: 'CRITICAL',
        priorityReason:
          'Failed entry affects a transfer or counterparty branch workflow.',
        actions: expect.arrayContaining([
          expect.objectContaining({
            type: 'REPLAY_SYNC_FAILURE_ENTRY',
            body: { branchId: 3, entryIndexes: [1] },
          }),
          expect.objectContaining({
            type: 'VIEW_TRANSFER_DETAIL',
            path: '/retail/v1/ops/desktop-workbench/transfers/301?branchId=3',
          }),
        ]),
      }),
    ]);
  });

  it('returns transfer detail for the desktop workbench drilldown', async () => {
    branchStaffAssignmentsRepository.findOne.mockResolvedValue({
      id: 41,
      branchId: 3,
      userId: 18,
      role: BranchStaffRole.MANAGER,
      permissions: [],
      isActive: true,
    });
    branchTransfersRepository.findOne.mockResolvedValue({
      id: 301,
      transferNumber: 'TR-301',
      fromBranchId: 8,
      toBranchId: 3,
      status: BranchTransferStatus.DISPATCHED,
      note: 'urgent transfer',
      requestedAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      dispatchedAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
      receivedAt: null,
      cancelledAt: null,
      createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
      items: [{ id: 1, productId: 9, quantity: 12, note: 'fragile' }],
    });

    const result = await service.getDesktopTransferDetail(
      301,
      {
        branchId: 3,
        includeItems: true,
      },
      {
        id: 18,
        roles: ['B2B_BUYER'],
      },
    );

    expect(result.summary).toEqual(
      expect.objectContaining({
        transferId: 301,
        branchId: 3,
        direction: 'INBOUND',
        status: BranchTransferStatus.DISPATCHED,
        totalUnits: 12,
        priority: 'CRITICAL',
      }),
    );
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'VIEW_TRANSFER' }),
        expect.objectContaining({ type: 'RECEIVE_TRANSFER', enabled: true }),
        expect.objectContaining({ type: 'CANCEL_TRANSFER', enabled: true }),
      ]),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 1,
        productId: 9,
        quantity: 12,
        note: 'fragile',
      }),
    ]);
  });

  it('disables transfer mutations when the actor lacks branch authority', async () => {
    branchStaffAssignmentsRepository.findOne.mockResolvedValue(null);
    branchTransfersRepository.findOne.mockResolvedValue({
      id: 301,
      transferNumber: 'TR-301',
      fromBranchId: 8,
      toBranchId: 3,
      status: BranchTransferStatus.DISPATCHED,
      note: 'urgent transfer',
      requestedAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      dispatchedAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
      receivedAt: null,
      cancelledAt: null,
      createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
      items: [],
    });

    const result = await service.getDesktopTransferDetail(
      301,
      {
        branchId: 3,
        includeItems: true,
      },
      {
        id: 19,
        roles: ['B2B_BUYER'],
      },
    );

    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'RECEIVE_TRANSFER', enabled: false }),
        expect.objectContaining({ type: 'CANCEL_TRANSFER', enabled: false }),
      ]),
    );
  });

  it('returns stock exception detail for the desktop workbench drilldown', async () => {
    stockMovementsRepository.findOne.mockResolvedValue({
      id: 201,
      branchId: 3,
      productId: 9,
      movementType: StockMovementType.ADJUSTMENT,
      quantityDelta: -18,
      sourceType: 'BRANCH_TRANSFER',
      sourceReferenceId: 301,
      actorUserId: 18,
      note: 'cycle count drift',
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    });

    const result = await service.getDesktopStockExceptionDetail(201, {
      branchId: 3,
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        movementId: 201,
        branchId: 3,
        productId: 9,
        quantityDelta: -18,
        sourceType: 'BRANCH_TRANSFER',
        sourceReferenceId: 301,
        priority: 'HIGH',
      }),
    );
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'VIEW_STOCK_MOVEMENTS' }),
        expect.objectContaining({ type: 'VIEW_TRANSFER_DETAIL' }),
      ]),
    );
  });

  it('returns auto-replenishment drafts for review with a summary', async () => {
    const summaryQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalDrafts: '1',
        staleDraftCount: '1',
        totalDraftValue: '125',
        supplierCount: '1',
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
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnValue(summaryQb),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 71,
            orderNumber: 'PO-AR-71',
            branchId: 3,
            supplierProfileId: 14,
            status: PurchaseOrderStatus.DRAFT,
            currency: 'USD',
            subtotal: 125,
            total: 125,
            expectedDeliveryDate: '2026-03-20',
            statusMeta: { autoReplenishment: true },
            items: [
              {
                id: 1,
                productId: 9,
                supplierOfferId: 44,
                orderedQuantity: 5,
                receivedQuantity: 0,
                shortageQuantity: 0,
                damagedQuantity: 0,
                note: 'auto',
                unitPrice: 25,
              },
            ],
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            updatedAt: new Date('2026-03-18T10:00:00.000Z'),
          },
        ],
        1,
      ]),
    };
    purchaseOrdersRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listReplenishmentDrafts({
      branchId: 3,
      page: 1,
      limit: 20,
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        branchId: 3,
        totalDrafts: 1,
        staleDraftCount: 1,
        totalDraftValue: 125,
        supplierCount: 1,
        autoSubmitDraftCount: 0,
        blockedAutoSubmitDraftCount: 0,
        readyAutoSubmitDraftCount: 0,
        blockedReasonBreakdown: [],
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 71,
        supplierProfileId: 14,
        total: 125,
        replenishmentActions: [
          {
            type: 'RE_EVALUATE_AUTO_REPLENISHMENT',
            method: 'POST',
            path: '/retail/v1/ops/replenishment-drafts/71/re-evaluate',
            query: {
              branchId: 3,
            },
            enabled: true,
          },
        ],
        autoReplenishmentStatus: expect.objectContaining({
          isAutoReplenishment: true,
        }),
      }),
    );
  });

  it('keeps accounting payout network totals based on all matched branches when limiting the visible list', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    payoutLogRepository.find.mockResolvedValue([
      {
        id: 901,
        provider: PayoutProvider.EBIRR,
        status: PayoutStatus.FAILED,
        amount: 80,
        currency: 'ETB',
        phoneNumber: '251900000111',
        transactionReference: 'ORD-18-ITEM-201',
        orderId: 18,
        orderItemId: 201,
        failureReason: 'Gateway timeout',
        createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        vendor: {
          id: 77,
          displayName: 'Vendor One',
          phoneNumber: '251900000111',
        },
      },
      {
        id: 902,
        provider: PayoutProvider.EBIRR,
        status: PayoutStatus.SUCCESS,
        amount: 120,
        currency: 'ETB',
        phoneNumber: '251900000222',
        transactionReference: 'ORD-19-ITEM-202',
        orderId: 19,
        orderItemId: 202,
        failureReason:
          'RECONCILE_REQUIRED: Wallet debit failed after provider payout success',
        createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
        vendor: {
          id: 78,
          displayName: 'Vendor Two',
          phoneNumber: '251900000222',
        },
      },
    ]);
    ordersRepository.find.mockResolvedValue([
      {
        id: 18,
        fulfillmentBranchId: 3,
        paymentMethod: PaymentMethod.EBIRR,
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.DELIVERED,
      },
      {
        id: 19,
        fulfillmentBranchId: 8,
        paymentMethod: PaymentMethod.EBIRR,
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.DELIVERED,
      },
    ] as any);

    const result = await service.getAccountingPayoutNetworkSummary({
      branchId: 3,
      limit: 1,
      windowHours: 168,
    });

    expect(result.exceptionCount).toBe(2);
    expect(result.autoRetryRequiredCount).toBe(1);
    expect(result.reconciliationRequiredCount).toBe(1);
    expect(result.totalAmountAtRisk).toBe(200);
    expect(result.branches).toHaveLength(1);
  });

  it('surfaces blocked auto-submit reasons on replenishment drafts', async () => {
    const summaryQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalDrafts: '1',
        staleDraftCount: '0',
        totalDraftValue: '125',
        supplierCount: '1',
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
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnValue(summaryQb),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 72,
            orderNumber: 'PO-AR-72',
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

    const result = await service.listReplenishmentDrafts({
      branchId: 3,
      page: 1,
      limit: 20,
    });

    expect(result.items[0].autoReplenishmentStatus).toEqual(
      expect.objectContaining({
        submissionMode: 'AUTO_SUBMIT',
        lastAttemptEligible: false,
        lastAttemptBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
        minimumOrderTotal: 250,
      }),
    );
    expect(result.items[0].replenishmentActions).toEqual([
      {
        type: 'RE_EVALUATE_AUTO_REPLENISHMENT',
        method: 'POST',
        path: '/retail/v1/ops/replenishment-drafts/72/re-evaluate',
        query: {
          branchId: 3,
        },
        enabled: true,
      },
    ]);
    expect(result.summary).toEqual(
      expect.objectContaining({
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
  });

  it('applies submission mode and blocked reason filters to replenishment drafts', async () => {
    const summaryQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalDrafts: '0',
        staleDraftCount: '0',
        totalDraftValue: '0',
        supplierCount: '0',
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
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnValue(summaryQb),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    purchaseOrdersRepository.createQueryBuilder.mockReturnValue(qb);

    await service.listReplenishmentDrafts({
      branchId: 3,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT' as any,
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      page: 1,
      limit: 20,
    });

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

  it('returns replenishment network summary across tenant branches', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 71,
        orderNumber: 'PO-71',
        branchId: 3,
        supplierProfileId: 14,
        status: PurchaseOrderStatus.DRAFT,
        total: 125,
        currency: 'USD',
        statusMeta: {
          autoReplenishment: true,
          autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
          lastAutoSubmissionAttempt: {
            eligible: false,
            blockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
          },
        },
        createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        items: [],
      },
      {
        id: 72,
        orderNumber: 'PO-72',
        branchId: 8,
        supplierProfileId: 14,
        status: PurchaseOrderStatus.DRAFT,
        total: 75,
        currency: 'USD',
        statusMeta: {
          autoReplenishment: true,
          autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
          lastAutoSubmissionAttempt: {
            eligible: true,
            blockedReason: '',
          },
        },
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        items: [],
      },
    ]);

    const result = await service.getReplenishmentNetworkSummary({
      branchId: 3,
      supplierProfileId: 14,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT' as any,
      limit: 5,
    });

    expect(result).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        totalDrafts: 2,
        blockedAutoSubmitDraftCount: 1,
        readyAutoSubmitDraftCount: 1,
        criticalBranchCount: 1,
        normalBranchCount: 1,
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'NETWORK_REPLENISHMENT_BLOCKED' }),
          expect.objectContaining({ code: 'NETWORK_REPLENISHMENT_STALE' }),
          expect.objectContaining({ code: 'NETWORK_REPLENISHMENT_READY' }),
        ]),
        branches: expect.arrayContaining([
          expect.objectContaining({
            branchId: 3,
            highestPriority: 'CRITICAL',
            blockedAutoSubmitDraftCount: 1,
          }),
          expect.objectContaining({
            branchId: 8,
            highestPriority: 'NORMAL',
            readyAutoSubmitDraftCount: 1,
          }),
        ]),
      }),
    );
  });

  it('keeps replenishment network totals based on all matched branches when limiting the visible list', async () => {
    branchesRepository.find.mockResolvedValue([
      { id: 3, name: 'HQ', code: 'HQ-3', retailTenantId: 21, isActive: true },
      {
        id: 8,
        name: 'Airport',
        code: 'BR-8',
        retailTenantId: 21,
        isActive: true,
      },
    ]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 71,
        orderNumber: 'PO-71',
        branchId: 3,
        supplierProfileId: 14,
        status: PurchaseOrderStatus.DRAFT,
        total: 125,
        currency: 'USD',
        statusMeta: {
          autoReplenishment: true,
          autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
          lastAutoSubmissionAttempt: {
            eligible: false,
            blockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
          },
        },
        createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        items: [],
      },
      {
        id: 72,
        orderNumber: 'PO-72',
        branchId: 8,
        supplierProfileId: 14,
        status: PurchaseOrderStatus.DRAFT,
        total: 75,
        currency: 'USD',
        statusMeta: {
          autoReplenishment: true,
          autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
          lastAutoSubmissionAttempt: { eligible: true, blockedReason: '' },
        },
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        items: [],
      },
    ]);

    const result = await service.getReplenishmentNetworkSummary({
      branchId: 3,
      limit: 1,
    });

    expect(result.totalDrafts).toBe(2);
    expect(result.blockedAutoSubmitDraftCount).toBe(1);
    expect(result.readyAutoSubmitDraftCount).toBe(1);
    expect(result.branches).toHaveLength(1);
  });

  it('includes automation-not-entitled drafts in the blocked reason breakdown', async () => {
    const summaryQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalDrafts: '1',
        staleDraftCount: '0',
        totalDraftValue: '125',
        supplierCount: '1',
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
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnValue(summaryQb),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 1]),
    };
    purchaseOrdersRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listReplenishmentDrafts({
      branchId: 3,
      page: 1,
      limit: 20,
    });

    expect(result.summary.blockedReasonBreakdown).toEqual([
      {
        reason: 'AUTOMATION_NOT_ENTITLED',
        count: 1,
      },
    ]);
  });

  it('re-evaluates a branch-scoped replenishment draft through the purchase orders service', async () => {
    purchaseOrdersRepository.findOne.mockResolvedValue({ id: 42, branchId: 3 });
    purchaseOrdersService.reevaluateAutoReplenishmentDraftDetailed.mockResolvedValue(
      {
        purchaseOrder: {
          id: 42,
          orderNumber: 'PO-AR-42',
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

    const result = await service.reevaluateReplenishmentDraft(3, 42, {
      id: 18,
      email: 'buyer@suuq.test',
      roles: ['B2B_BUYER'],
    });

    expect(purchaseOrdersRepository.findOne).toHaveBeenCalledWith({
      where: { id: 42, branchId: 3 },
    });
    expect(
      purchaseOrdersService.reevaluateAutoReplenishmentDraftDetailed,
    ).toHaveBeenCalledWith(42, {
      id: 18,
      email: 'buyer@suuq.test',
      roles: ['B2B_BUYER'],
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 42,
        branchId: 3,
        status: PurchaseOrderStatus.SUBMITTED,
        replenishmentActions: [],
        reevaluationOutcome: {
          previousStatus: PurchaseOrderStatus.DRAFT,
          nextStatus: PurchaseOrderStatus.SUBMITTED,
          previousBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
          nextBlockedReason: null,
          actionTaken: 'SUBMITTED',
        },
      }),
    );
  });
});
