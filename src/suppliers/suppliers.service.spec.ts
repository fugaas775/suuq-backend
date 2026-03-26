import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between, In, MoreThanOrEqual } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { SupplierProcurementBranchInterventionAction } from './dto/act-on-supplier-procurement-branch-intervention.dto';
import { SupplierProcurementBranchInterventionAgeBucket } from './dto/supplier-procurement-branch-intervention-query.dto';
import { SupplierProcurementBranchInterventionSortBy } from './dto/supplier-procurement-branch-intervention-query.dto';
import {
  PurchaseOrderReceiptDiscrepancyStatus,
  PurchaseOrderReceiptEvent,
} from '../purchase-orders/entities/purchase-order-receipt-event.entity';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import { ProcurementWebhooksService } from '../procurement-webhooks/procurement-webhooks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { User } from '../users/entities/user.entity';
import { SuppliersService } from './suppliers.service';
import {
  SupplierProcurementDashboardBranchRollupSortBy,
  SupplierProcurementDashboardSupplierRollupSortBy,
} from './dto/supplier-procurement-branch-intervention-dashboard-query.dto';
import {
  SupplierProcurementOverviewAlertStatusTransition,
  SupplierProcurementOverviewAlertLevel,
  SupplierProcurementOverviewSeverityTrend,
} from './dto/supplier-procurement-branch-intervention-response.dto';
import {
  SupplierOnboardingStatus,
  SupplierProfile,
} from './entities/supplier-profile.entity';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let supplierProfilesRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
  };
  let usersRepository: { findOne: jest.Mock };
  let purchaseOrdersRepository: { find: jest.Mock };
  let purchaseOrderReceiptEventsRepository: { find: jest.Mock };
  let auditService: {
    log: jest.Mock;
    listForTarget: jest.Mock;
    listForTargets: jest.Mock;
  };
  let notificationsService: { createAndDispatch: jest.Mock };
  let realtimeGateway: { notifyProcurementInterventionUpdated: jest.Mock };
  let procurementWebhooksService: { dispatchProcurementEvent: jest.Mock };

  beforeEach(async () => {
    supplierProfilesRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(async (value: any) => value),
    };
    usersRepository = {
      findOne: jest.fn(),
    };
    purchaseOrdersRepository = {
      find: jest.fn(),
    };
    purchaseOrderReceiptEventsRepository = {
      find: jest.fn(),
    };

    auditService = {
      log: jest.fn(),
      listForTarget: jest.fn().mockResolvedValue([]),
      listForTargets: jest.fn().mockResolvedValue([]),
    };
    notificationsService = {
      createAndDispatch: jest
        .fn()
        .mockResolvedValue({ notificationCreated: true }),
    };
    realtimeGateway = {
      notifyProcurementInterventionUpdated: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    procurementWebhooksService = {
      dispatchProcurementEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        {
          provide: getRepositoryToken(SupplierProfile),
          useValue: supplierProfilesRepository,
        },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: purchaseOrdersRepository,
        },
        {
          provide: getRepositoryToken(PurchaseOrderReceiptEvent),
          useValue: purchaseOrderReceiptEventsRepository,
        },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationsService, useValue: notificationsService },
        {
          provide: ProcurementWebhooksService,
          useValue: procurementWebhooksService,
        },
        { provide: RealtimeGateway, useValue: realtimeGateway },
      ],
    }).compile();

    service = module.get(SuppliersService);
  });

  it('allows admins to approve supplier profiles and writes audit metadata', async () => {
    const profile: SupplierProfile = {
      id: 4,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.PENDING_REVIEW,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile;

    supplierProfilesRepository.findOne.mockResolvedValue(profile);

    const result = await service.updateStatus(
      4,
      { status: SupplierOnboardingStatus.APPROVED },
      {
        id: 1,
        email: 'admin@example.com',
        roles: [UserRole.ADMIN],
        reason: 'KYC complete',
      },
    );

    expect(result.onboardingStatus).toBe(SupplierOnboardingStatus.APPROVED);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'supplier_profile.status.update',
        targetId: 4,
        meta: {
          fromStatus: SupplierOnboardingStatus.PENDING_REVIEW,
          toStatus: SupplierOnboardingStatus.APPROVED,
        },
      }),
    );
  });

  it('rejects supplier self-approval attempts', async () => {
    const profile: SupplierProfile = {
      id: 5,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.PENDING_REVIEW,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile;

    supplierProfilesRepository.findOne.mockResolvedValue(profile);

    await expect(
      service.updateStatus(
        5,
        { status: SupplierOnboardingStatus.APPROVED },
        {
          id: 8,
          email: 'supplier@example.com',
          roles: [UserRole.SUPPLIER_ACCOUNT],
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('returns supplier procurement summary metrics for an owned profile', async () => {
    supplierProfilesRepository.findOne.mockResolvedValue({
      id: 7,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 41,
        orderNumber: 'PO-41',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        subtotal: 100,
        total: 100,
        expectedDeliveryDate: '2026-03-20',
        submittedAt: new Date('2026-03-10T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-03-10T10:00:00.000Z'),
        shippedAt: new Date('2026-03-11T08:00:00.000Z'),
        receivedAt: new Date('2026-03-12T08:00:00.000Z'),
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 8,
            shortageQuantity: 1,
            damagedQuantity: 1,
          },
        ],
        createdAt: new Date('2026-03-10T08:00:00.000Z'),
        updatedAt: new Date('2026-03-12T08:00:00.000Z'),
      },
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        currency: 'USD',
        subtotal: 50,
        total: 50,
        expectedDeliveryDate: null,
        submittedAt: new Date('2026-03-15T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        receivedAt: null,
        items: [
          {
            orderedQuantity: 5,
            receivedQuantity: 0,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
        createdAt: new Date('2026-03-15T08:00:00.000Z'),
        updatedAt: new Date('2026-03-15T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 5,
        purchaseOrderId: 41,
        createdAt: new Date('2026-03-12T08:00:00.000Z'),
        supplierAcknowledgedAt: new Date('2026-03-12T12:00:00.000Z'),
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.RESOLVED,
      },
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-15T09:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);

    const result = await service.getProcurementSummary(
      7,
      { windowDays: 30, limit: 5 },
      {
        id: 8,
        email: 'supplier@example.com',
        roles: [UserRole.SUPPLIER_ACCOUNT],
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        supplierProfileId: 7,
        companyName: 'Acme Supply',
        totalOrders: 2,
        activeOrderCount: 2,
        workQueues: expect.objectContaining({
          pendingAcknowledgementCount: 1,
          pendingShipmentCount: 0,
          pendingReceiptAcknowledgementCount: 1,
          openDiscrepancyCount: 1,
          awaitingApprovalDiscrepancyCount: 1,
        }),
        sla: expect.objectContaining({
          averageAcknowledgementHours: 2,
          averageShipmentLatencyHours: 22,
          averageReceiptAcknowledgementHours: 4,
          fillRatePercent: 53.33,
          shortageRatePercent: 6.67,
          damageRatePercent: 6.67,
        }),
      }),
    );
    expect(result.statusCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: PurchaseOrderStatus.SUBMITTED,
          count: 1,
        }),
        expect.objectContaining({
          status: PurchaseOrderStatus.RECEIVED,
          count: 1,
        }),
      ]),
    );
    expect(result.recentOrders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purchaseOrderId: 42,
          pendingReceiptAcknowledgementCount: 1,
          openDiscrepancyCount: 1,
        }),
      ]),
    );
  });

  it('rejects procurement summary access for a different supplier account', async () => {
    supplierProfilesRepository.findOne.mockResolvedValue({
      id: 7,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile);

    await expect(
      service.getProcurementSummary(
        7,
        { windowDays: 30 },
        {
          id: 99,
          email: 'other-supplier@example.com',
          roles: [UserRole.SUPPLIER_ACCOUNT],
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('builds an admin procurement scorecard ranked by supplier performance', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 9,
        userId: 10,
        companyName: 'Bravo Wholesale',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 41,
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.RECEIVED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 10,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
        submittedAt: new Date('2026-03-10T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-03-10T09:00:00.000Z'),
        shippedAt: new Date('2026-03-10T18:00:00.000Z'),
        createdAt: new Date('2026-03-10T08:00:00.000Z'),
        updatedAt: new Date('2026-03-12T08:00:00.000Z'),
      },
      {
        id: 42,
        supplierProfileId: 9,
        status: PurchaseOrderStatus.RECEIVED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 6,
            shortageQuantity: 3,
            damagedQuantity: 1,
          },
        ],
        submittedAt: new Date('2026-03-10T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-03-11T08:00:00.000Z'),
        shippedAt: new Date('2026-03-15T08:00:00.000Z'),
        createdAt: new Date('2026-03-10T08:00:00.000Z'),
        updatedAt: new Date('2026-03-16T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 5,
        purchaseOrderId: 41,
        createdAt: new Date('2026-03-12T08:00:00.000Z'),
        supplierAcknowledgedAt: new Date('2026-03-12T09:00:00.000Z'),
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
      },
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-16T08:00:00.000Z'),
        supplierAcknowledgedAt: new Date('2026-03-18T08:00:00.000Z'),
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);

    const result = await service.listProcurementScorecard({
      windowDays: 30,
      limit: 10,
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
    });

    expect(supplierProfilesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          onboardingStatus: SupplierOnboardingStatus.APPROVED,
        },
      }),
    );
    expect(result.totalSuppliersEvaluated).toBe(2);
    expect(result.appliedFilters).toEqual(
      expect.objectContaining({
        includeInactive: false,
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        supplierProfileIds: [],
        branchIds: [],
        statuses: [],
        to: null,
      }),
    );
    expect(result.rankedSuppliers).toHaveLength(2);
    expect(result.rankedSuppliers[0]).toEqual(
      expect.objectContaining({
        supplierProfileId: 7,
        companyName: 'Acme Supply',
        scoreBreakdown: expect.objectContaining({
          fillRateScore: 100,
          discrepancyPenalty: 0,
        }),
      }),
    );
    expect(result.rankedSuppliers[0].procurementScore).toBeGreaterThan(
      result.rankedSuppliers[1].procurementScore,
    );
    expect(result.rankedSuppliers[1].scoreBreakdown.discrepancyPenalty).toBe(
      40,
    );
  });

  it('can include inactive suppliers in the procurement scorecard', async () => {
    supplierProfilesRepository.find.mockResolvedValue([]);
    purchaseOrdersRepository.find.mockResolvedValue([]);

    await service.listProcurementScorecard({
      includeInactive: true,
      windowDays: 14,
      limit: 5,
    });

    expect(supplierProfilesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });

  it('applies supplier, status, and explicit date filters to the procurement scorecard', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([]);

    const from = new Date('2026-03-01T00:00:00.000Z');
    const to = new Date('2026-03-19T23:59:59.999Z');

    const result = await service.listProcurementScorecard({
      windowDays: 30,
      supplierProfileIds: [7, 9],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.RECEIVED],
      from,
      to,
    });

    expect(result.appliedFilters).toEqual({
      includeInactive: false,
      onboardingStatus: null,
      supplierProfileIds: [7, 9],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.RECEIVED],
      from: from.toISOString(),
      to: to.toISOString(),
    });

    expect(supplierProfilesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          id: In([7, 9]),
        }),
      }),
    );
    expect(purchaseOrdersRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supplierProfileId: In([7]),
          branchId: In([3, 4]),
          status: In([
            PurchaseOrderStatus.SUBMITTED,
            PurchaseOrderStatus.RECEIVED,
          ]),
          createdAt: Between(from, to),
        }),
      }),
    );
  });

  it('uses the default rolling window when explicit dates are omitted', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([]);

    await service.listProcurementScorecard({
      windowDays: 14,
      limit: 5,
    });

    expect(purchaseOrdersRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supplierProfileId: In([7]),
          createdAt: expect.any(Object),
        }),
      }),
    );
    const createdAtFilter =
      purchaseOrdersRepository.find.mock.calls[0][0].where.createdAt;
    expect(createdAtFilter).toEqual(expect.any(Object));
    expect(createdAtFilter).toMatchObject(
      MoreThanOrEqual(expect.any(Date)) as any,
    );
  });

  it('exports the procurement scorecard as CSV', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme "Supply"',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 41,
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.RECEIVED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 10,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
        submittedAt: new Date('2026-03-10T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-03-10T09:00:00.000Z'),
        shippedAt: new Date('2026-03-10T18:00:00.000Z'),
        createdAt: new Date('2026-03-10T08:00:00.000Z'),
        updatedAt: new Date('2026-03-12T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 5,
        purchaseOrderId: 41,
        createdAt: new Date('2026-03-12T08:00:00.000Z'),
        supplierAcknowledgedAt: new Date('2026-03-12T09:00:00.000Z'),
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
      },
    ] as PurchaseOrderReceiptEvent[]);

    const csv = await service.exportProcurementScorecardCsv({
      windowDays: 30,
      limit: 10,
    });

    expect(csv).toContain(
      'generatedAt,windowDays,filterIncludeInactive,filterOnboardingStatus,filterSupplierProfileIds,filterBranchIds,filterStatuses,filterFrom,filterTo,supplierProfileId,companyName,onboardingStatus,isActive,procurementScore,fillRateScore,acknowledgementScore,shipmentScore,receiptAcknowledgementScore,discrepancyScore,discrepancyPenalty',
    );
    expect(csv).toContain('"Acme ""Supply"""');
    expect(csv).toContain(',false,"","","","","');
    expect(csv).toContain(',7,"Acme ""Supply""",');
    expect(csv).toContain(',100,100,100,100,100,0,');
  });

  it('builds a procurement branch intervention queue ranked by urgency', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 9,
        userId: 10,
        companyName: 'Bravo Wholesale',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 41,
        orderNumber: 'PO-41',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.RECEIVED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 10,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
        submittedAt: new Date('2026-02-25T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-02-25T09:00:00.000Z'),
        shippedAt: new Date('2026-02-25T14:00:00.000Z'),
        createdAt: new Date('2026-02-25T08:00:00.000Z'),
        updatedAt: new Date('2026-02-26T08:00:00.000Z'),
      },
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
      {
        id: 43,
        orderNumber: 'PO-43',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 9,
        status: PurchaseOrderStatus.RECEIVED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 9,
            shortageQuantity: 1,
            damagedQuantity: 0,
          },
        ],
        submittedAt: new Date('2026-03-16T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-03-16T12:00:00.000Z'),
        shippedAt: new Date('2026-03-17T08:00:00.000Z'),
        createdAt: new Date('2026-03-16T08:00:00.000Z'),
        updatedAt: new Date('2026-03-17T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 7,
        purchaseOrderId: 43,
        createdAt: new Date('2026-03-17T08:00:00.000Z'),
        supplierAcknowledgedAt: new Date('2026-03-17T09:00:00.000Z'),
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 91,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-17T07:30:00.000Z'),
      },
      {
        id: 92,
        targetId: 7,
        action: 'procurement_branch_intervention.resolve',
        actorEmail: 'ops@example.com',
        meta: { branchId: 4, assigneeUserId: 99 },
        createdAt: new Date('2026-03-19T07:30:00.000Z'),
      },
    ]);

    const result = await service.listProcurementBranchInterventions({
      windowDays: 30,
      limit: 10,
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      assigneeUserIds: [21],
      includeUntriaged: false,
      statuses: [PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.RECEIVED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        windowDays: 30,
        baselineWindowDays: 90,
        totalBranchesEvaluated: 1,
        summary: {
          totalInterventions: 1,
          assignedCount: 1,
          untriagedCount: 0,
          over24hCount: 1,
          over72hCount: 1,
          alertCounts: {
            normal: 0,
            warning: 0,
            critical: 1,
          },
          alertMix: {
            normalPercent: 0,
            warningPercent: 0,
            criticalPercent: 100,
          },
          issueMix: expect.arrayContaining([
            expect.objectContaining({
              issue: 'LOW_FILL_RATE',
              count: 1,
              percent: 100,
            }),
            expect.objectContaining({
              issue: 'OPEN_DISCREPANCIES',
              count: 1,
              percent: 100,
            }),
          ]),
          actionHintMix: expect.arrayContaining([
            expect.objectContaining({
              actionHint: 'RESOLVE_OPEN_DISCREPANCIES',
              count: 1,
              percent: 100,
            }),
            expect.objectContaining({
              actionHint: 'REVIEW_FILL_RATE_SLIPPAGE',
              count: 1,
              percent: 100,
            }),
          ]),
        },
        appliedFilters: {
          includeInactive: false,
          onboardingStatus: null,
          supplierProfileIds: [],
          branchIds: [],
          statuses: [
            PurchaseOrderStatus.SUBMITTED,
            PurchaseOrderStatus.RECEIVED,
          ],
          latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
          actionAgeBuckets: [
            SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
          ],
          sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
          assigneeUserIds: [21],
          includeUntriaged: false,
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-20T08:00:00.000Z',
        },
      }),
    );
    expect(result.supplierRollups).toEqual([
      expect.objectContaining({
        supplierProfileId: 7,
        companyName: 'Acme Supply',
        branchCount: 1,
        assignedCount: 1,
        over24hCount: 1,
        over72hCount: 1,
        alertCounts: {
          normal: 0,
          warning: 0,
          critical: 1,
        },
        alertMix: {
          normalPercent: 0,
          warningPercent: 0,
          criticalPercent: 100,
        },
      }),
    ]);
    expect(result.branchRollups).toEqual([
      expect.objectContaining({
        branchId: 3,
        branchName: 'HQ',
        supplierCount: 1,
        interventionCount: 1,
        over24hCount: 1,
        over72hCount: 1,
        alertCounts: {
          normal: 0,
          warning: 0,
          critical: 1,
        },
        alertMix: {
          normalPercent: 0,
          warningPercent: 0,
          criticalPercent: 100,
        },
      }),
    ]);
    expect(result.interventions[0]).toEqual(
      expect.objectContaining({
        supplierProfileId: 7,
        companyName: 'Acme Supply',
        branchId: 3,
        branchName: 'HQ',
        latestAction: SupplierProcurementBranchInterventionAction.ASSIGN,
        latestActionActorEmail: 'ops@example.com',
        latestAssigneeUserId: 21,
        trendDirection: 'WORSENING',
        openDiscrepancyCount: 1,
        alertLevel: SupplierProcurementOverviewAlertLevel.CRITICAL,
        pendingAcknowledgementCount: 1,
        actionHints: expect.arrayContaining([
          'RESOLVE_OPEN_DISCREPANCIES',
          'FOLLOW_UP_PENDING_ACKNOWLEDGEMENTS',
          'REVIEW_FILL_RATE_SLIPPAGE',
        ]),
        topIssues: expect.arrayContaining([
          'OPEN_DISCREPANCIES',
          'LOW_FILL_RATE',
        ]),
      }),
    );
    expect(result.interventions).toHaveLength(1);
  });

  it('exports the procurement branch intervention queue as CSV', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 91,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-17T07:30:00.000Z'),
      },
    ]);

    const csv = await service.exportProcurementBranchInterventionsCsv({
      windowDays: 30,
      limit: 10,
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      assigneeUserIds: [21],
      includeUntriaged: false,
      statuses: [PurchaseOrderStatus.SUBMITTED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(csv).toContain(
      'section,generatedAt,windowDays,baselineWindowDays,filterIncludeInactive,filterOnboardingStatus,filterSupplierProfileIds,filterBranchIds,filterStatuses,filterLatestActions,filterActionAgeBuckets,filterSortBy,filterAssigneeUserIds,filterIncludeUntriaged,filterFrom,filterTo,supplierProfileId,companyName',
    );
    expect(csv).toContain('"SUMMARY"');
    expect(csv).toContain('"SUPPLIER_ROLLUP"');
    expect(csv).toContain('"BRANCH_ROLLUP"');
    expect(csv).toContain('"INTERVENTION"');
    expect(csv).toContain('summaryNormalAlertPercent');
    expect(csv).toContain('summaryWarningAlertPercent');
    expect(csv).toContain('summaryCriticalAlertPercent');
    expect(csv).toContain('summaryIssueMix');
    expect(csv).toContain('summaryActionHintMix');
    expect(csv).toContain('"Acme Supply"');
    expect(csv).toContain('"HQ"');
    expect(csv).toContain('"ASSIGN"');
    expect(csv).toContain('ops@example.com');
    expect(csv).toContain('alertLevel');
    expect(csv).toContain('rollupNormalAlertPercent');
    expect(csv).toContain('rollupWarningAlertPercent');
    expect(csv).toContain('rollupCriticalAlertPercent');
    expect(csv).toContain(',0,0,1,0,0,100,');
    expect(csv).toContain('"CRITICAL"');
    expect(csv).toContain(',0,0,1,0,0,100,');
    expect(csv).toContain(',1,1,0,1,1,');
    expect(csv).toContain('LOW_FILL_RATE:1:100');
    expect(csv).toContain('OPEN_DISCREPANCIES:1:100');
    expect(csv).toContain('RESOLVE_OPEN_DISCREPANCIES:1:100');
    expect(csv).toContain('"LOW_FILL_RATE|OPEN_DISCREPANCIES');
    expect(csv).toContain('"RESOLVE_OPEN_DISCREPANCIES');
  });

  it('returns trimmed procurement branch intervention dashboard rollups without intervention rows', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 9,
        userId: 10,
        companyName: 'Bravo Wholesale',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
      {
        id: 43,
        orderNumber: 'PO-43',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 9,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 3,
            shortageQuantity: 5,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-19T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
        updatedAt: new Date('2026-03-19T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 7,
        purchaseOrderId: 43,
        createdAt: new Date('2026-03-19T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 91,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-17T07:30:00.000Z'),
      },
      {
        id: 92,
        targetId: 9,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 4, assigneeUserId: 34 },
        createdAt: new Date('2026-03-18T07:30:00.000Z'),
      },
    ]);

    const result = await service.getProcurementBranchInterventionDashboard({
      windowDays: 30,
      limit: 10,
      sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      statuses: [PurchaseOrderStatus.SUBMITTED],
      supplierRollupLimit: 1,
      branchRollupLimit: 1,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        windowDays: 30,
        baselineWindowDays: 90,
        totalBranchesEvaluated: 2,
        summaryAlertLevel: SupplierProcurementOverviewAlertLevel.WARNING,
        summary: expect.objectContaining({
          totalInterventions: 2,
          assignedCount: 2,
          untriagedCount: 0,
          over24hCount: 2,
          over72hCount: 1,
          alertCounts: {
            normal: 0,
            warning: 0,
            critical: 2,
          },
          alertMix: {
            normalPercent: 0,
            warningPercent: 0,
            criticalPercent: 100,
          },
          issueMix: expect.arrayContaining([
            expect.objectContaining({
              issue: 'LOW_FILL_RATE',
              count: 2,
              percent: 100,
            }),
            expect.objectContaining({
              issue: 'OPEN_DISCREPANCIES',
              count: 2,
              percent: 100,
            }),
          ]),
          actionHintMix: expect.arrayContaining([
            expect.objectContaining({
              actionHint: 'RESOLVE_OPEN_DISCREPANCIES',
              count: 2,
              percent: 100,
            }),
          ]),
        }),
      }),
    );
    expect(result.appliedFilters).toEqual(
      expect.objectContaining({
        supplierRollupSortBy:
          SupplierProcurementDashboardSupplierRollupSortBy.OVER_72H_DESC,
        branchRollupSortBy:
          SupplierProcurementDashboardBranchRollupSortBy.OVER_72H_DESC,
        supplierRollupLimit: 1,
        branchRollupLimit: 1,
      }),
    );
    expect(result.supplierRollups).toEqual([
      expect.objectContaining({
        supplierProfileId: 7,
        branchCount: 1,
        over24hCount: 1,
        over72hCount: 1,
        alertCounts: {
          normal: 0,
          warning: 0,
          critical: 1,
        },
        alertMix: {
          normalPercent: 0,
          warningPercent: 0,
          criticalPercent: 100,
        },
        alertLevel: SupplierProcurementOverviewAlertLevel.CRITICAL,
      }),
    ]);
    expect(result.branchRollups).toEqual([
      expect.objectContaining({
        branchId: 3,
        branchName: 'HQ',
        supplierCount: 1,
        interventionCount: 1,
        over24hCount: 1,
        over72hCount: 1,
        alertCounts: {
          normal: 0,
          warning: 0,
          critical: 1,
        },
        alertMix: {
          normalPercent: 0,
          warningPercent: 0,
          criticalPercent: 100,
        },
        alertLevel: SupplierProcurementOverviewAlertLevel.CRITICAL,
      }),
    ]);
    expect(result.supplierRollups).toHaveLength(1);
    expect(result.branchRollups).toHaveLength(1);
    expect(result).not.toHaveProperty('interventions');
  });

  it('returns compact procurement branch intervention overview cards', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 9,
        userId: 10,
        companyName: 'Bravo Wholesale',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
      {
        id: 43,
        orderNumber: 'PO-43',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 9,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 3,
            shortageQuantity: 5,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-19T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
        updatedAt: new Date('2026-03-19T08:00:00.000Z'),
      },
      {
        id: 44,
        orderNumber: 'PO-44',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 5,
            shortageQuantity: 3,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-02-25T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-02-25T08:00:00.000Z'),
        updatedAt: new Date('2026-02-25T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 7,
        purchaseOrderId: 43,
        createdAt: new Date('2026-03-19T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 8,
        purchaseOrderId: 44,
        createdAt: new Date('2026-02-25T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 91,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-17T07:30:00.000Z'),
      },
      {
        id: 92,
        targetId: 9,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 4, assigneeUserId: 34 },
        createdAt: new Date('2026-03-18T07:30:00.000Z'),
      },
      {
        id: 93,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-02-25T07:30:00.000Z'),
      },
    ]);

    const result = await service.getProcurementBranchInterventionOverview({
      windowDays: 30,
      limit: 10,
      sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      statuses: [PurchaseOrderStatus.SUBMITTED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        windowDays: 30,
        baselineWindowDays: 90,
        totalBranchesEvaluated: 2,
        summary: expect.objectContaining({
          totalInterventions: 2,
          assignedCount: 2,
          untriagedCount: 0,
          over24hCount: 2,
          over72hCount: 1,
          alertCounts: {
            normal: 0,
            warning: 0,
            critical: 2,
          },
          alertMix: {
            normalPercent: 0,
            warningPercent: 0,
            criticalPercent: 100,
          },
          issueMix: expect.arrayContaining([
            expect.objectContaining({
              issue: 'LOW_FILL_RATE',
              count: 2,
              percent: 100,
            }),
            expect.objectContaining({
              issue: 'OPEN_DISCREPANCIES',
              count: 2,
              percent: 100,
            }),
          ]),
          actionHintMix: expect.arrayContaining([
            expect.objectContaining({
              actionHint: 'RESOLVE_OPEN_DISCREPANCIES',
              count: 2,
              percent: 100,
            }),
          ]),
        }),
        comparisonWindow: {
          previousFrom: '2026-02-09T15:59:59.999Z',
          previousTo: '2026-02-28T23:59:59.999Z',
        },
        summaryDelta: expect.objectContaining({
          totalInterventionsDelta: 1,
          assignedCountDelta: 1,
          untriagedCountDelta: 0,
          over24hCountDelta: 2,
          over72hCountDelta: 1,
          alertCountsDelta: {
            normalDelta: 0,
            warningDelta: 0,
            criticalDelta: 1,
          },
          alertMixDelta: {
            normalPercentDelta: 0,
            warningPercentDelta: 0,
            criticalPercentDelta: 0,
          },
          issueMixDelta: expect.arrayContaining([
            expect.objectContaining({
              issue: 'WORSENING_PROCUREMENT_SCORE',
              countDelta: 1,
              percentDelta: 50,
            }),
          ]),
          actionHintMixDelta: expect.arrayContaining([
            expect.objectContaining({
              actionHint: 'RESOLVE_OPEN_DISCREPANCIES',
              countDelta: 1,
              percentDelta: 0,
            }),
          ]),
        }),
        alertStatuses: {
          summary: SupplierProcurementOverviewAlertLevel.WARNING,
          topSupplierHotspot: SupplierProcurementOverviewAlertLevel.CRITICAL,
          topBranchHotspot: SupplierProcurementOverviewAlertLevel.CRITICAL,
        },
        severityTrends: {
          summary: SupplierProcurementOverviewSeverityTrend.ESCALATING,
          topSupplierHotspot:
            SupplierProcurementOverviewSeverityTrend.ESCALATING,
          topBranchHotspot: SupplierProcurementOverviewSeverityTrend.ESCALATING,
        },
        alertStatusTransitions: {
          summary: {
            previousAlertLevel: SupplierProcurementOverviewAlertLevel.NORMAL,
            currentAlertLevel: SupplierProcurementOverviewAlertLevel.WARNING,
            transition:
              SupplierProcurementOverviewAlertStatusTransition.ESCALATED,
            changed: true,
          },
          topSupplierHotspot: {
            previousAlertLevel: SupplierProcurementOverviewAlertLevel.WARNING,
            currentAlertLevel: SupplierProcurementOverviewAlertLevel.CRITICAL,
            transition:
              SupplierProcurementOverviewAlertStatusTransition.ESCALATED,
            changed: true,
          },
          topBranchHotspot: {
            previousAlertLevel: SupplierProcurementOverviewAlertLevel.WARNING,
            currentAlertLevel: SupplierProcurementOverviewAlertLevel.CRITICAL,
            transition:
              SupplierProcurementOverviewAlertStatusTransition.ESCALATED,
            changed: true,
          },
        },
        topSupplierHotspot: expect.objectContaining({
          supplierProfileId: 7,
          companyName: 'Acme Supply',
          issueMix: expect.arrayContaining([
            expect.objectContaining({ issue: 'LOW_FILL_RATE', count: 1 }),
          ]),
          actionHintMix: expect.arrayContaining([
            expect.objectContaining({
              actionHint: 'RESOLVE_OPEN_DISCREPANCIES',
              count: 1,
            }),
          ]),
        }),
        topSupplierHotspotDelta: expect.objectContaining({
          branchCountDelta: 0,
          assignedCountDelta: 0,
          untriagedCountDelta: 0,
          over24hCountDelta: 1,
          over72hCountDelta: 1,
          highestPriorityScoreDelta: 44.25,
          alertCountsDelta: {
            normalDelta: 0,
            warningDelta: 0,
            criticalDelta: 0,
          },
          alertMixDelta: {
            normalPercentDelta: 0,
            warningPercentDelta: 0,
            criticalPercentDelta: 0,
          },
          issueMixDelta: expect.arrayContaining([
            expect.objectContaining({
              issue: 'WORSENING_PROCUREMENT_SCORE',
              countDelta: 1,
            }),
          ]),
          actionHintMixDelta: expect.arrayContaining([
            expect.objectContaining({
              actionHint: 'RESOLVE_OPEN_DISCREPANCIES',
              countDelta: 0,
            }),
          ]),
        }),
        topBranchHotspot: expect.objectContaining({
          branchId: 3,
          branchName: 'HQ',
          issueMix: expect.arrayContaining([
            expect.objectContaining({ issue: 'LOW_FILL_RATE', count: 1 }),
          ]),
          actionHintMix: expect.arrayContaining([
            expect.objectContaining({
              actionHint: 'RESOLVE_OPEN_DISCREPANCIES',
              count: 1,
            }),
          ]),
        }),
        topBranchHotspotDelta: expect.objectContaining({
          supplierCountDelta: 0,
          interventionCountDelta: 0,
          assignedCountDelta: 0,
          untriagedCountDelta: 0,
          over24hCountDelta: 1,
          over72hCountDelta: 1,
          highestPriorityScoreDelta: 44.25,
          alertCountsDelta: {
            normalDelta: 0,
            warningDelta: 0,
            criticalDelta: 0,
          },
          alertMixDelta: {
            normalPercentDelta: 0,
            warningPercentDelta: 0,
            criticalPercentDelta: 0,
          },
          issueMixDelta: expect.arrayContaining([
            expect.objectContaining({
              issue: 'WORSENING_PROCUREMENT_SCORE',
              countDelta: 1,
            }),
          ]),
          actionHintMixDelta: expect.arrayContaining([
            expect.objectContaining({
              actionHint: 'RESOLVE_OPEN_DISCREPANCIES',
              countDelta: 0,
            }),
          ]),
        }),
      }),
    );
    expect(result.appliedFilters).toEqual(
      expect.objectContaining({
        supplierRollupSortBy:
          SupplierProcurementDashboardSupplierRollupSortBy.OVER_72H_DESC,
        branchRollupSortBy:
          SupplierProcurementDashboardBranchRollupSortBy.OVER_72H_DESC,
      }),
    );
    expect(result).not.toHaveProperty('supplierRollups');
    expect(result).not.toHaveProperty('branchRollups');
  });

  it('exports compact procurement branch intervention overview cards as CSV', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 9,
        userId: 10,
        companyName: 'Bravo Wholesale',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
      {
        id: 43,
        orderNumber: 'PO-43',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 9,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 3,
            shortageQuantity: 5,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-19T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
        updatedAt: new Date('2026-03-19T08:00:00.000Z'),
      },
      {
        id: 44,
        orderNumber: 'PO-44',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 5,
            shortageQuantity: 3,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-02-25T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-02-25T08:00:00.000Z'),
        updatedAt: new Date('2026-02-25T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 7,
        purchaseOrderId: 43,
        createdAt: new Date('2026-03-19T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 8,
        purchaseOrderId: 44,
        createdAt: new Date('2026-02-25T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 91,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-17T07:30:00.000Z'),
      },
      {
        id: 92,
        targetId: 9,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 4, assigneeUserId: 34 },
        createdAt: new Date('2026-03-18T07:30:00.000Z'),
      },
      {
        id: 93,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-02-25T07:30:00.000Z'),
      },
    ]);

    const csv = await service.exportProcurementBranchInterventionOverviewCsv({
      windowDays: 30,
      limit: 10,
      sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      statuses: [PurchaseOrderStatus.SUBMITTED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(csv).toContain(
      'section,generatedAt,windowDays,baselineWindowDays,totalBranchesEvaluated,filterIncludeInactive,filterOnboardingStatus,filterSupplierProfileIds,filterBranchIds,filterStatuses,filterLatestActions,filterActionAgeBuckets,filterSortBy,filterAssigneeUserIds,filterIncludeUntriaged,filterSupplierRollupSortBy,filterBranchRollupSortBy,filterSupplierRollupLimit,filterBranchRollupLimit,filterFrom,filterTo,comparisonPreviousFrom,comparisonPreviousTo',
    );
    expect(csv).toContain('summaryAlertLevel');
    expect(csv).toContain('summaryNormalAlertCount');
    expect(csv).toContain('summaryWarningAlertCount');
    expect(csv).toContain('summaryCriticalAlertCount');
    expect(csv).toContain('summaryNormalAlertPercent');
    expect(csv).toContain('summaryWarningAlertPercent');
    expect(csv).toContain('summaryCriticalAlertPercent');
    expect(csv).toContain('summaryIssueMix');
    expect(csv).toContain('summaryActionHintMix');
    expect(csv).toContain('summaryDeltaNormalAlertPercent');
    expect(csv).toContain('summaryDeltaWarningAlertPercent');
    expect(csv).toContain('summaryDeltaCriticalAlertPercent');
    expect(csv).toContain('summarySeverityTrend');
    expect(csv).toContain('summaryPreviousAlertLevel');
    expect(csv).toContain('summaryAlertTransition');
    expect(csv).toContain('summaryAlertStatusChanged');
    expect(csv).toContain('summaryDeltaNormalAlertCount');
    expect(csv).toContain('summaryDeltaWarningAlertCount');
    expect(csv).toContain('summaryDeltaCriticalAlertCount');
    expect(csv).toContain('supplierNormalAlertCount');
    expect(csv).toContain('supplierWarningAlertCount');
    expect(csv).toContain('supplierCriticalAlertCount');
    expect(csv).toContain('supplierNormalAlertPercent');
    expect(csv).toContain('supplierWarningAlertPercent');
    expect(csv).toContain('supplierCriticalAlertPercent');
    expect(csv).toContain('supplierDeltaNormalAlertPercent');
    expect(csv).toContain('supplierDeltaWarningAlertPercent');
    expect(csv).toContain('supplierDeltaCriticalAlertPercent');
    expect(csv).toContain('supplierDeltaNormalAlertCount');
    expect(csv).toContain('supplierDeltaWarningAlertCount');
    expect(csv).toContain('supplierDeltaCriticalAlertCount');
    expect(csv).toContain('supplierSeverityTrend');
    expect(csv).toContain('supplierPreviousAlertLevel');
    expect(csv).toContain('supplierAlertTransition');
    expect(csv).toContain('supplierAlertStatusChanged');
    expect(csv).toContain('branchNormalAlertCount');
    expect(csv).toContain('branchWarningAlertCount');
    expect(csv).toContain('branchCriticalAlertCount');
    expect(csv).toContain('branchNormalAlertPercent');
    expect(csv).toContain('branchWarningAlertPercent');
    expect(csv).toContain('branchCriticalAlertPercent');
    expect(csv).toContain('branchDeltaNormalAlertPercent');
    expect(csv).toContain('branchDeltaWarningAlertPercent');
    expect(csv).toContain('branchDeltaCriticalAlertPercent');
    expect(csv).toContain('branchDeltaNormalAlertCount');
    expect(csv).toContain('branchDeltaWarningAlertCount');
    expect(csv).toContain('branchDeltaCriticalAlertCount');
    expect(csv).toContain('branchSeverityTrend');
    expect(csv).toContain('branchPreviousAlertLevel');
    expect(csv).toContain('branchAlertTransition');
    expect(csv).toContain('branchAlertStatusChanged');
    expect(csv).toContain('supplierAlertLevel');
    expect(csv).toContain('branchAlertLevel');
    expect(csv).toContain('"SUMMARY"');
    expect(csv).toContain('"TOP_SUPPLIER_HOTSPOT"');
    expect(csv).toContain('"TOP_BRANCH_HOTSPOT"');
    expect(csv).not.toContain('"SUPPLIER_ROLLUP"');
    expect(csv).not.toContain('"BRANCH_ROLLUP"');
    expect(csv).toContain('"Acme Supply"');
    expect(csv).toContain('"HQ"');
    expect(csv).toContain('"2026-02-09T15:59:59.999Z"');
    expect(csv).toContain('"2026-02-28T23:59:59.999Z"');
    expect(csv).toContain(',1,1,0,2,1,');
    expect(csv).toContain(',0,0,2,0,0,100,');
    expect(csv).toContain(',0,0,1,0,0,100,');
    expect(csv).toContain(',0,0,0,1,1,44.25,');
    expect(csv).toContain('LOW_FILL_RATE:2:100');
    expect(csv).toContain('OPEN_DISCREPANCIES:2:100');
    expect(csv).toContain('RESOLVE_OPEN_DISCREPANCIES:2:100');
    expect(csv).toContain('"ESCALATING"');
    expect(csv).toContain('"ESCALATED"');
    expect(csv).toContain('true');
    expect(csv).toContain('"WARNING"');
  });

  it('marks hotspot transitions as APPEARED when the comparison window has no hotspots', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 91,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-17T07:30:00.000Z'),
      },
    ]);

    const result = await service.getProcurementBranchInterventionOverview({
      windowDays: 30,
      limit: 10,
      sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      statuses: [PurchaseOrderStatus.SUBMITTED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(result.alertStatusTransitions.topSupplierHotspot).toEqual({
      previousAlertLevel: null,
      currentAlertLevel: SupplierProcurementOverviewAlertLevel.CRITICAL,
      transition: SupplierProcurementOverviewAlertStatusTransition.APPEARED,
      changed: true,
    });
    expect(result.alertStatusTransitions.topBranchHotspot).toEqual({
      previousAlertLevel: null,
      currentAlertLevel: SupplierProcurementOverviewAlertLevel.CRITICAL,
      transition: SupplierProcurementOverviewAlertStatusTransition.APPEARED,
      changed: true,
    });
    expect(result.severityTrends.topSupplierHotspot).toBe(
      SupplierProcurementOverviewSeverityTrend.ESCALATING,
    );
    expect(result.severityTrends.topBranchHotspot).toBe(
      SupplierProcurementOverviewSeverityTrend.ESCALATING,
    );
  });

  it('marks hotspot transitions as CLEARED when the current window has no hotspots', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 44,
        orderNumber: 'PO-44',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 5,
            shortageQuantity: 3,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-02-25T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-02-25T08:00:00.000Z'),
        updatedAt: new Date('2026-02-25T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 8,
        purchaseOrderId: 44,
        createdAt: new Date('2026-02-25T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 93,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-02-25T07:30:00.000Z'),
      },
    ]);

    const result = await service.getProcurementBranchInterventionOverview({
      windowDays: 30,
      limit: 10,
      sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      statuses: [PurchaseOrderStatus.SUBMITTED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(result.topSupplierHotspot).toBeNull();
    expect(result.topBranchHotspot).toBeNull();
    expect(result.alertStatusTransitions.topSupplierHotspot).toEqual({
      previousAlertLevel: SupplierProcurementOverviewAlertLevel.WARNING,
      currentAlertLevel: null,
      transition: SupplierProcurementOverviewAlertStatusTransition.CLEARED,
      changed: true,
    });
    expect(result.alertStatusTransitions.topBranchHotspot).toEqual({
      previousAlertLevel: SupplierProcurementOverviewAlertLevel.WARNING,
      currentAlertLevel: null,
      transition: SupplierProcurementOverviewAlertStatusTransition.CLEARED,
      changed: true,
    });
    expect(result.severityTrends.topSupplierHotspot).toBe(
      SupplierProcurementOverviewSeverityTrend.IMPROVING,
    );
    expect(result.severityTrends.topBranchHotspot).toBe(
      SupplierProcurementOverviewSeverityTrend.IMPROVING,
    );
  });

  it('exports trimmed procurement branch intervention dashboard rollups as CSV', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 9,
        userId: 10,
        companyName: 'Bravo Wholesale',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
      {
        id: 43,
        orderNumber: 'PO-43',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 9,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 3,
            shortageQuantity: 5,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-19T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
        updatedAt: new Date('2026-03-19T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 7,
        purchaseOrderId: 43,
        createdAt: new Date('2026-03-19T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 91,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-17T07:30:00.000Z'),
      },
      {
        id: 92,
        targetId: 9,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 4, assigneeUserId: 34 },
        createdAt: new Date('2026-03-18T07:30:00.000Z'),
      },
    ]);

    const csv = await service.exportProcurementBranchInterventionDashboardCsv({
      windowDays: 30,
      limit: 10,
      sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      statuses: [PurchaseOrderStatus.SUBMITTED],
      supplierRollupLimit: 1,
      branchRollupLimit: 1,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(csv).toContain(
      'section,generatedAt,windowDays,baselineWindowDays,totalBranchesEvaluated,filterIncludeInactive,filterOnboardingStatus,filterSupplierProfileIds,filterBranchIds,filterStatuses,filterLatestActions,filterActionAgeBuckets,filterSortBy,filterAssigneeUserIds,filterIncludeUntriaged,filterSupplierRollupSortBy,filterBranchRollupSortBy,filterSupplierRollupLimit,filterBranchRollupLimit,filterFrom,filterTo',
    );
    expect(csv).toContain('summaryAlertLevel');
    expect(csv).toContain('summaryNormalAlertCount');
    expect(csv).toContain('summaryWarningAlertCount');
    expect(csv).toContain('summaryCriticalAlertCount');
    expect(csv).toContain('summaryNormalAlertPercent');
    expect(csv).toContain('summaryWarningAlertPercent');
    expect(csv).toContain('summaryCriticalAlertPercent');
    expect(csv).toContain('summaryIssueMix');
    expect(csv).toContain('summaryActionHintMix');
    expect(csv).toContain('rollupNormalAlertCount');
    expect(csv).toContain('rollupWarningAlertCount');
    expect(csv).toContain('rollupCriticalAlertCount');
    expect(csv).toContain('rollupNormalAlertPercent');
    expect(csv).toContain('rollupWarningAlertPercent');
    expect(csv).toContain('rollupCriticalAlertPercent');
    expect(csv).toContain('rollupAlertLevel');
    expect(csv).toContain('"SUMMARY"');
    expect(csv).toContain('"SUPPLIER_ROLLUP"');
    expect(csv).toContain('"BRANCH_ROLLUP"');
    expect(csv).not.toContain('"INTERVENTION"');
    expect(csv).toContain('"Acme Supply"');
    expect(csv).toContain('"HQ"');
    expect(csv).toContain('"WARNING"');
    expect(csv).toContain('"CRITICAL"');
    expect(csv).toContain('LOW_FILL_RATE:2:100');
    expect(csv).toContain('OPEN_DISCREPANCIES:2:100');
    expect(csv).toContain(',true,"OVER_72H_DESC","OVER_72H_DESC","1","1",');
    expect(csv).toContain('"2026-03-01T00:00:00.000Z"');
    expect(csv).toContain('"2026-03-20T08:00:00.000Z"');
  });

  it('sorts dashboard rollups independently from the queue ordering', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 9,
        userId: 10,
        companyName: 'Bravo Wholesale',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 11,
        userId: 12,
        companyName: 'Cedar Foods',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
      {
        id: 43,
        orderNumber: 'PO-43',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 9,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 1,
            shortageQuantity: 7,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-19T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
        updatedAt: new Date('2026-03-19T08:00:00.000Z'),
      },
      {
        id: 44,
        orderNumber: 'PO-44',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 11,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 4,
            shortageQuantity: 4,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-19T09:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-19T09:00:00.000Z'),
        updatedAt: new Date('2026-03-19T09:00:00.000Z'),
      },
      {
        id: 45,
        orderNumber: 'PO-45',
        branchId: 5,
        branch: { id: 5, name: 'Summit', code: 'SUM' },
        supplierProfileId: 11,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 4,
            shortageQuantity: 4,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-19T11:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-19T11:00:00.000Z'),
        updatedAt: new Date('2026-03-19T11:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 7,
        purchaseOrderId: 43,
        createdAt: new Date('2026-03-19T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 8,
        purchaseOrderId: 44,
        createdAt: new Date('2026-03-19T10:30:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 9,
        purchaseOrderId: 45,
        createdAt: new Date('2026-03-19T11:30:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 91,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-17T07:30:00.000Z'),
      },
      {
        id: 92,
        targetId: 9,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 4, assigneeUserId: 34 },
        createdAt: new Date('2026-03-18T07:30:00.000Z'),
      },
    ]);

    const result = await service.getProcurementBranchInterventionDashboard({
      windowDays: 30,
      limit: 10,
      sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      statuses: [PurchaseOrderStatus.SUBMITTED],
      supplierRollupSortBy:
        SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
      branchRollupSortBy:
        SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(result.appliedFilters).toEqual(
      expect.objectContaining({
        supplierRollupSortBy:
          SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
        branchRollupSortBy:
          SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
      }),
    );
    expect(
      result.supplierRollups.map((rollup) => rollup.supplierProfileId),
    ).toEqual([11, 7, 9]);
    expect(result.branchRollups.map((rollup) => rollup.branchId)).toEqual([
      4, 3, 5,
    ]);
  });

  it('filters procurement branch interventions by workflow age bucket', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 9,
        userId: 10,
        companyName: 'Bravo Wholesale',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
      {
        id: 43,
        orderNumber: 'PO-43',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 9,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 3,
            shortageQuantity: 5,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-19T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
        updatedAt: new Date('2026-03-19T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 7,
        purchaseOrderId: 43,
        createdAt: new Date('2026-03-19T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 91,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-16T07:30:00.000Z'),
      },
      {
        id: 92,
        targetId: 9,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 4, assigneeUserId: 21 },
        createdAt: new Date('2026-03-20T07:30:00.000Z'),
      },
    ]);

    const result = await service.listProcurementBranchInterventions({
      windowDays: 30,
      limit: 10,
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_72H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      assigneeUserIds: [21],
      includeUntriaged: false,
      statuses: [PurchaseOrderStatus.SUBMITTED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(result.interventions).toHaveLength(1);
    expect(result.summary).toEqual({
      totalInterventions: 1,
      assignedCount: 1,
      untriagedCount: 0,
      over24hCount: 1,
      over72hCount: 1,
      alertCounts: {
        normal: 0,
        warning: 0,
        critical: 1,
      },
      alertMix: {
        normalPercent: 0,
        warningPercent: 0,
        criticalPercent: 100,
      },
      issueMix: expect.arrayContaining([
        expect.objectContaining({
          issue: 'LOW_FILL_RATE',
          count: 1,
          percent: 100,
        }),
        expect.objectContaining({
          issue: 'OPEN_DISCREPANCIES',
          count: 1,
          percent: 100,
        }),
      ]),
      actionHintMix: expect.arrayContaining([
        expect.objectContaining({
          actionHint: 'RESOLVE_OPEN_DISCREPANCIES',
          count: 1,
          percent: 100,
        }),
        expect.objectContaining({
          actionHint: 'CLEAR_RECEIPT_ACKNOWLEDGEMENTS',
          count: 1,
          percent: 100,
        }),
      ]),
    });
    expect(result.supplierRollups).toEqual([
      expect.objectContaining({
        supplierProfileId: 7,
        branchCount: 1,
        over24hCount: 1,
        over72hCount: 1,
        alertCounts: {
          normal: 0,
          warning: 0,
          critical: 1,
        },
        alertMix: {
          normalPercent: 0,
          warningPercent: 0,
          criticalPercent: 100,
        },
      }),
    ]);
    expect(result.branchRollups).toEqual([
      expect.objectContaining({
        branchId: 3,
        branchName: 'HQ',
        supplierCount: 1,
        interventionCount: 1,
        over24hCount: 1,
        over72hCount: 1,
        alertCounts: {
          normal: 0,
          warning: 0,
          critical: 1,
        },
        alertMix: {
          normalPercent: 0,
          warningPercent: 0,
          criticalPercent: 100,
        },
      }),
    ]);
    expect(result.interventions[0]).toEqual(
      expect.objectContaining({
        supplierProfileId: 7,
        branchId: 3,
        latestAction: SupplierProcurementBranchInterventionAction.ASSIGN,
      }),
    );
  });

  it('sorts procurement branch interventions with untriaged items first', async () => {
    supplierProfilesRepository.find.mockResolvedValue([
      {
        id: 7,
        userId: 8,
        companyName: 'Acme Supply',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 9,
        userId: 10,
        companyName: 'Bravo Wholesale',
        onboardingStatus: SupplierOnboardingStatus.APPROVED,
        countriesServed: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as SupplierProfile[]);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
      {
        id: 43,
        orderNumber: 'PO-43',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 9,
        status: PurchaseOrderStatus.SUBMITTED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 7,
        purchaseOrderId: 43,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTargets.mockResolvedValue([
      {
        id: 91,
        targetId: 7,
        action: 'procurement_branch_intervention.assign',
        actorEmail: 'ops@example.com',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-19T07:30:00.000Z'),
      },
    ]);

    const result = await service.listProcurementBranchInterventions({
      windowDays: 30,
      limit: 10,
      sortBy: SupplierProcurementBranchInterventionSortBy.UNTRIAGED_FIRST,
      statuses: [PurchaseOrderStatus.SUBMITTED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(result.appliedFilters.sortBy).toBe(
      SupplierProcurementBranchInterventionSortBy.UNTRIAGED_FIRST,
    );
    expect(result.interventions[0]).toEqual(
      expect.objectContaining({
        supplierProfileId: 9,
        branchId: 4,
        latestAction: null,
      }),
    );
  });

  it('returns procurement intervention detail for a supplier branch', async () => {
    supplierProfilesRepository.findOne.mockResolvedValue({
      id: 7,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 41,
        orderNumber: 'PO-41',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.RECEIVED,
        currency: 'USD',
        subtotal: 100,
        total: 100,
        expectedDeliveryDate: null,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 10,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
        submittedAt: new Date('2026-02-25T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-02-25T09:00:00.000Z'),
        shippedAt: new Date('2026-02-25T14:00:00.000Z'),
        receivedAt: new Date('2026-02-26T08:00:00.000Z'),
        createdAt: new Date('2026-02-25T08:00:00.000Z'),
        updatedAt: new Date('2026-02-26T08:00:00.000Z'),
      },
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        currency: 'USD',
        subtotal: 80,
        total: 80,
        expectedDeliveryDate: null,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        receivedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);

    const result = await service.getProcurementBranchInterventionDetail(7, 3, {
      windowDays: 30,
      limit: 10,
      statuses: [PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.RECEIVED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        appliedFilters: {
          windowDays: 30,
          limit: 10,
          statuses: [
            PurchaseOrderStatus.SUBMITTED,
            PurchaseOrderStatus.RECEIVED,
          ],
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-20T08:00:00.000Z',
        },
        intervention: expect.objectContaining({
          supplierProfileId: 7,
          branchId: 3,
          branchName: 'HQ',
          openDiscrepancyCount: 1,
        }),
        recentOrders: expect.arrayContaining([
          expect.objectContaining({ purchaseOrderId: 42, branchId: 3 }),
        ]),
        topContributingOrders: expect.arrayContaining([
          expect.objectContaining({ purchaseOrderId: 42, branchId: 3 }),
        ]),
        discrepancyEvents: expect.arrayContaining([
          expect.objectContaining({ receiptEventId: 6, purchaseOrderId: 42 }),
        ]),
        recentActions: [],
      }),
    );
  });

  it('records procurement intervention actions in audit history and returns refreshed detail', async () => {
    supplierProfilesRepository.findOne.mockResolvedValue({
      id: 7,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        currency: 'USD',
        subtotal: 80,
        total: 80,
        expectedDeliveryDate: null,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        receivedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.log.mockResolvedValue({ id: 91 });
    auditService.listForTarget.mockResolvedValue([
      {
        id: 91,
        action: 'procurement_branch_intervention.acknowledge',
        actorId: 3,
        actorEmail: 'admin@example.com',
        reason: 'Ops lead taking ownership',
        meta: { branchId: 3, assigneeUserId: null },
        createdAt: new Date('2026-03-20T09:30:00.000Z'),
      },
    ]);

    const result = await service.actOnProcurementBranchIntervention(
      7,
      3,
      {
        action: SupplierProcurementBranchInterventionAction.ACKNOWLEDGE,
        note: 'Ops lead taking ownership',
      },
      {
        id: 3,
        email: 'admin@example.com',
        roles: [UserRole.ADMIN],
      },
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'procurement_branch_intervention.acknowledge',
        targetType: 'SUPPLIER_PROFILE',
        targetId: 7,
        actorId: 3,
        actorEmail: 'admin@example.com',
        reason: 'Ops lead taking ownership',
        meta: { branchId: 3, assigneeUserId: null },
      }),
    );
    expect(result.recentActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'procurement_branch_intervention.acknowledge',
          actorEmail: 'admin@example.com',
        }),
      ]),
    );
    expect(
      realtimeGateway.notifyProcurementInterventionUpdated,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierProfileId: 7,
        branchId: 3,
        action: SupplierProcurementBranchInterventionAction.ACKNOWLEDGE,
        actorId: 3,
        actorEmail: 'admin@example.com',
        assigneeUserId: null,
        note: 'Ops lead taking ownership',
        intervention: expect.objectContaining({
          supplierProfileId: 7,
          branchId: 3,
          companyName: 'Acme Supply',
        }),
      }),
    );
    expect(
      procurementWebhooksService.dispatchProcurementEvent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 3,
        supplierProfileId: 7,
        eventType: 'PROCUREMENT_INTERVENTION_UPDATED',
        payload: expect.objectContaining({
          action: SupplierProcurementBranchInterventionAction.ACKNOWLEDGE,
          branchId: 3,
          supplierProfileId: 7,
        }),
      }),
    );
    expect(notificationsService.createAndDispatch).not.toHaveBeenCalled();
  });

  it('notifies the assignee when a procurement intervention is assigned', async () => {
    supplierProfilesRepository.findOne.mockResolvedValue({
      id: 7,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile);
    usersRepository.findOne.mockResolvedValue({
      id: 21,
      email: 'ops@example.com',
      roles: [UserRole.ADMIN],
    } as User);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        currency: 'USD',
        subtotal: 80,
        total: 80,
        expectedDeliveryDate: null,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        receivedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.log.mockResolvedValue({ id: 92 });
    auditService.listForTarget.mockResolvedValue([
      {
        id: 92,
        action: 'procurement_branch_intervention.assign',
        actorId: 3,
        actorEmail: 'admin@example.com',
        reason: 'Route to ops queue',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-20T09:45:00.000Z'),
      },
    ]);

    await service.actOnProcurementBranchIntervention(
      7,
      3,
      {
        action: SupplierProcurementBranchInterventionAction.ASSIGN,
        note: 'Route to ops queue',
        assigneeUserId: 21,
      },
      {
        id: 3,
        email: 'admin@example.com',
        roles: [UserRole.ADMIN],
      },
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(notificationsService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 21,
        title: 'Procurement intervention assigned: Acme Supply',
        body: 'HQ now requires attention for Acme Supply.',
        data: expect.objectContaining({
          category: 'procurement_intervention',
          route: '/admin/b2b/procurement/branch-interventions',
          supplierProfileId: 7,
          branchId: 3,
          action: SupplierProcurementBranchInterventionAction.ASSIGN,
        }),
      }),
    );
    expect(
      realtimeGateway.notifyProcurementInterventionUpdated,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierProfileId: 7,
        branchId: 3,
        action: SupplierProcurementBranchInterventionAction.ASSIGN,
        assigneeUserId: 21,
      }),
    );
    expect(
      procurementWebhooksService.dispatchProcurementEvent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 3,
        supplierProfileId: 7,
        eventType: 'PROCUREMENT_INTERVENTION_UPDATED',
        payload: expect.objectContaining({
          action: SupplierProcurementBranchInterventionAction.ASSIGN,
          assigneeUserId: 21,
        }),
      }),
    );
  });

  it('exports procurement intervention detail as CSV', async () => {
    supplierProfilesRepository.findOne.mockResolvedValue({
      id: 7,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.SUBMITTED,
        currency: 'USD',
        subtotal: 80,
        total: 80,
        expectedDeliveryDate: null,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 2,
            shortageQuantity: 6,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-03-18T08:00:00.000Z'),
        acknowledgedAt: null,
        shippedAt: null,
        receivedAt: null,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        updatedAt: new Date('2026-03-18T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
        supplierAcknowledgedAt: null,
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);
    auditService.listForTarget.mockResolvedValue([
      {
        id: 91,
        action: 'procurement_branch_intervention.assign',
        actorId: 3,
        actorEmail: 'ops@example.com',
        reason: 'Assigned to regional buyer',
        meta: { branchId: 3, assigneeUserId: 21 },
        createdAt: new Date('2026-03-20T07:30:00.000Z'),
      },
    ]);

    const csv = await service.exportProcurementBranchInterventionDetailCsv(
      7,
      3,
      {
        windowDays: 30,
        limit: 10,
        statuses: [PurchaseOrderStatus.SUBMITTED],
        from: new Date('2026-03-01T00:00:00.000Z'),
        to: new Date('2026-03-20T08:00:00.000Z'),
      },
    );

    expect(csv).toContain('section,generatedAt,supplierProfileId,companyName');
    expect(csv).toContain('"SUMMARY"');
    expect(csv).toContain('"ORDER"');
    expect(csv).toContain('"DISCREPANCY"');
    expect(csv).toContain('"ACTION"');
    expect(csv).toContain('"Acme Supply"');
    expect(csv).toContain('"PO-42"');
    expect(csv).toContain('"ASSIGN"');
    expect(csv).toContain('ops@example.com');
  });

  it('builds 7, 30, and 90 day procurement trend snapshots for a supplier', async () => {
    supplierProfilesRepository.findOne.mockResolvedValue({
      id: 7,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 41,
        orderNumber: 'PO-41',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.RECEIVED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 10,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
        submittedAt: new Date('2026-03-16T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-03-16T09:00:00.000Z'),
        shippedAt: new Date('2026-03-16T14:00:00.000Z'),
        createdAt: new Date('2026-03-16T08:00:00.000Z'),
        updatedAt: new Date('2026-03-17T08:00:00.000Z'),
      },
      {
        id: 42,
        orderNumber: 'PO-42',
        branchId: 4,
        branch: { id: 4, name: 'Bole', code: 'BOLE' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.RECEIVED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 8,
            shortageQuantity: 1,
            damagedQuantity: 1,
          },
        ],
        submittedAt: new Date('2026-03-01T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-03-02T08:00:00.000Z'),
        shippedAt: new Date('2026-03-05T08:00:00.000Z'),
        createdAt: new Date('2026-03-01T08:00:00.000Z'),
        updatedAt: new Date('2026-03-06T08:00:00.000Z'),
      },
      {
        id: 43,
        orderNumber: 'PO-43',
        branchId: 5,
        branch: { id: 5, name: 'Airport', code: 'AIR' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.RECEIVED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 5,
            shortageQuantity: 3,
            damagedQuantity: 2,
          },
        ],
        submittedAt: new Date('2026-01-25T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-01-27T08:00:00.000Z'),
        shippedAt: new Date('2026-02-01T08:00:00.000Z'),
        createdAt: new Date('2026-01-25T08:00:00.000Z'),
        updatedAt: new Date('2026-02-02T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 5,
        purchaseOrderId: 41,
        createdAt: new Date('2026-03-17T08:00:00.000Z'),
        supplierAcknowledgedAt: new Date('2026-03-17T09:00:00.000Z'),
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
      },
      {
        id: 6,
        purchaseOrderId: 42,
        createdAt: new Date('2026-03-06T08:00:00.000Z'),
        supplierAcknowledgedAt: new Date('2026-03-07T08:00:00.000Z'),
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
      {
        id: 7,
        purchaseOrderId: 43,
        createdAt: new Date('2026-02-02T08:00:00.000Z'),
        supplierAcknowledgedAt: new Date('2026-02-05T08:00:00.000Z'),
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      },
    ] as PurchaseOrderReceiptEvent[]);

    const result = await service.getProcurementTrend(
      7,
      {
        branchIds: [3],
        statuses: [PurchaseOrderStatus.RECEIVED],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        id: 1,
        email: 'admin@example.com',
        roles: [UserRole.ADMIN],
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        supplierProfileId: 7,
        trendDirection: 'IMPROVING',
        appliedFilters: {
          branchIds: [3],
          statuses: [PurchaseOrderStatus.RECEIVED],
          asOf: '2026-03-19T12:00:00.000Z',
        },
        branchBuckets: expect.arrayContaining([
          expect.objectContaining({
            branchId: 5,
            branchName: 'Airport',
            procurementScore: expect.any(Number),
            trendDirection: 'WORSENING',
            scoreDeltaFrom90d: expect.any(Number),
            fillRateDeltaFrom90d: expect.any(Number),
            impactScore: expect.any(Number),
          }),
        ]),
        topContributingOrders: expect.arrayContaining([
          expect.objectContaining({
            purchaseOrderId: 43,
            branchId: 5,
            branchName: 'Airport',
            dominantIssue: 'LOW_FILL_RATE',
          }),
        ]),
        topDiscrepancyEvents: expect.arrayContaining([
          expect.objectContaining({
            receiptEventId: 7,
            purchaseOrderId: 43,
            branchId: 5,
            branchName: 'Airport',
            discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.OPEN,
          }),
        ]),
        windows: expect.arrayContaining([
          expect.objectContaining({ windowDays: 7, totalOrders: 1 }),
          expect.objectContaining({ windowDays: 30, totalOrders: 2 }),
          expect.objectContaining({ windowDays: 90, totalOrders: 3 }),
        ]),
      }),
    );
    expect(result.scoreDeltaFrom90d).toBeGreaterThan(0);
    expect(result.fillRateDeltaFrom90d).toBeGreaterThan(0);
    expect(result.topContributingOrders[0].impactScore).toBeGreaterThan(
      result.topContributingOrders[1].impactScore,
    );
    expect(result.branchBuckets[0].impactSharePercent).toBeGreaterThan(0);
    expect(result.branchBuckets[0].scoreDeltaFrom90d).toBeLessThan(0);
    expect(purchaseOrdersRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: { branch: true },
        where: expect.objectContaining({
          branchId: In([3]),
        }),
      }),
    );
  });

  it('exports procurement trend snapshots and contributors as CSV', async () => {
    supplierProfilesRepository.findOne.mockResolvedValue({
      id: 7,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile);
    purchaseOrdersRepository.find.mockResolvedValue([
      {
        id: 41,
        orderNumber: 'PO-41',
        branchId: 3,
        branch: { id: 3, name: 'HQ', code: 'HQ' },
        supplierProfileId: 7,
        status: PurchaseOrderStatus.RECEIVED,
        items: [
          {
            orderedQuantity: 10,
            receivedQuantity: 10,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
        submittedAt: new Date('2026-03-16T08:00:00.000Z'),
        acknowledgedAt: new Date('2026-03-16T09:00:00.000Z'),
        shippedAt: new Date('2026-03-16T14:00:00.000Z'),
        createdAt: new Date('2026-03-16T08:00:00.000Z'),
        updatedAt: new Date('2026-03-17T08:00:00.000Z'),
      },
    ] as PurchaseOrder[]);
    purchaseOrderReceiptEventsRepository.find.mockResolvedValue([
      {
        id: 5,
        purchaseOrderId: 41,
        createdAt: new Date('2026-03-17T08:00:00.000Z'),
        receiptLines: [
          {
            itemId: 1,
            productId: 2,
            receivedQuantity: 10,
            shortageQuantity: 0,
            damagedQuantity: 0,
          },
        ],
        supplierAcknowledgedAt: new Date('2026-03-17T09:00:00.000Z'),
        discrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
      },
    ] as PurchaseOrderReceiptEvent[]);

    const csv = await service.exportProcurementTrendCsv(
      7,
      {
        statuses: [PurchaseOrderStatus.RECEIVED],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        id: 1,
        email: 'admin@example.com',
        roles: [UserRole.ADMIN],
      },
    );

    expect(csv).toContain('section,supplierProfileId,companyName,asOf');
    expect(csv).toContain('"SUMMARY",7,"Acme Supply"');
    expect(csv).toContain('"WINDOW",7,"Acme Supply"');
    expect(csv).toContain('"BRANCH_BUCKET",7,"Acme Supply"');
    expect(csv).toContain('"ORDER_CONTRIBUTOR",7,"Acme Supply"');
    expect(csv).toContain('"DISCREPANCY_CONTRIBUTOR",7,"Acme Supply"');
    expect(csv).toContain(',3,"HQ","HQ",');
    expect(csv).toContain('"STABLE"');
  });
});
