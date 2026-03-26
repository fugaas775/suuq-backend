import { Test, TestingModule } from '@nestjs/testing';
import { AdminB2bController } from './b2b.admin.controller';
import { AdminB2bService } from './b2b.admin.service';
import { AuditService } from '../audit/audit.service';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { SupplierOnboardingStatus } from '../suppliers/entities/supplier-profile.entity';
import { SupplierProcurementBranchInterventionAction } from '../suppliers/dto/act-on-supplier-procurement-branch-intervention.dto';
import { SupplierProcurementBranchInterventionAgeBucket } from '../suppliers/dto/supplier-procurement-branch-intervention-query.dto';
import { SupplierProcurementBranchInterventionSortBy } from '../suppliers/dto/supplier-procurement-branch-intervention-query.dto';
import { BranchTransferStatus } from '../branches/entities/branch-transfer.entity';
import { PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';
import {
  SupplierProcurementDashboardBranchRollupSortBy,
  SupplierProcurementDashboardSupplierRollupSortBy,
} from '../suppliers/dto/supplier-procurement-branch-intervention-dashboard-query.dto';
import { SupplierProcurementOverviewSeverityTrend } from '../suppliers/dto/supplier-procurement-branch-intervention-response.dto';
import {
  SupplierProcurementOverviewAlertStatusTransition,
  SupplierProcurementOverviewAlertLevel,
} from '../suppliers/dto/supplier-procurement-branch-intervention-response.dto';

describe('AdminB2bController', () => {
  let controller: AdminB2bController;
  let suppliersService: {
    findReviewQueue: jest.Mock;
    updateStatus: jest.Mock;
    listProcurementScorecard: jest.Mock;
    getProcurementBranchInterventionDashboard: jest.Mock;
    getProcurementBranchInterventionOverview: jest.Mock;
    exportProcurementBranchInterventionOverviewCsv: jest.Mock;
    exportProcurementBranchInterventionDashboardCsv: jest.Mock;
    listProcurementBranchInterventions: jest.Mock;
    getProcurementBranchInterventionDetail: jest.Mock;
    actOnProcurementBranchIntervention: jest.Mock;
    exportProcurementScorecardCsv: jest.Mock;
    exportProcurementBranchInterventionsCsv: jest.Mock;
    exportProcurementBranchInterventionDetailCsv: jest.Mock;
    getProcurementTrend: jest.Mock;
    exportProcurementTrendCsv: jest.Mock;
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
      listProcurementScorecard: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-19T10:00:00.000Z',
        windowDays: 30,
        totalSuppliersEvaluated: 1,
        appliedFilters: {
          includeInactive: false,
          onboardingStatus: null,
          supplierProfileIds: [],
          branchIds: [],
          statuses: [],
          from: '2026-02-18T10:00:00.000Z',
          to: null,
        },
        rankedSuppliers: [],
      }),
      getProcurementBranchInterventionDashboard: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-20T08:00:00.000Z',
        windowDays: 30,
        baselineWindowDays: 90,
        totalBranchesEvaluated: 1,
        summaryAlertLevel: 'WARNING',
        summary: {
          totalInterventions: 1,
          assignedCount: 0,
          untriagedCount: 1,
          over24hCount: 0,
          over72hCount: 0,
          alertCounts: {
            normal: 0,
            warning: 1,
            critical: 0,
          },
          alertMix: {
            normalPercent: 0,
            warningPercent: 100,
            criticalPercent: 0,
          },
          issueMix: [],
          actionHintMix: [],
        },
        appliedFilters: {
          includeInactive: false,
          onboardingStatus: null,
          supplierProfileIds: [],
          branchIds: [],
          statuses: [],
          latestActions: [],
          actionAgeBuckets: [],
          sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
          assigneeUserIds: [],
          includeUntriaged: true,
          supplierRollupSortBy:
            SupplierProcurementDashboardSupplierRollupSortBy.OVER_72H_DESC,
          branchRollupSortBy:
            SupplierProcurementDashboardBranchRollupSortBy.OVER_72H_DESC,
          supplierRollupLimit: null,
          branchRollupLimit: null,
          from: '2026-02-19T08:00:00.000Z',
          to: '2026-03-20T08:00:00.000Z',
        },
        supplierRollups: [],
        branchRollups: [],
      }),
      getProcurementBranchInterventionOverview: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-20T08:00:00.000Z',
        windowDays: 30,
        baselineWindowDays: 90,
        totalBranchesEvaluated: 1,
        summary: {
          totalInterventions: 1,
          assignedCount: 0,
          untriagedCount: 1,
          over24hCount: 0,
          over72hCount: 0,
          alertCounts: {
            normal: 0,
            warning: 1,
            critical: 0,
          },
          alertMix: {
            normalPercent: 0,
            warningPercent: 100,
            criticalPercent: 0,
          },
          issueMix: [],
          actionHintMix: [],
        },
        appliedFilters: {
          includeInactive: false,
          onboardingStatus: null,
          supplierProfileIds: [],
          branchIds: [],
          statuses: [],
          latestActions: [],
          actionAgeBuckets: [],
          sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
          assigneeUserIds: [],
          includeUntriaged: true,
          supplierRollupSortBy:
            SupplierProcurementDashboardSupplierRollupSortBy.OVER_72H_DESC,
          branchRollupSortBy:
            SupplierProcurementDashboardBranchRollupSortBy.OVER_72H_DESC,
          supplierRollupLimit: null,
          branchRollupLimit: null,
          from: '2026-02-19T08:00:00.000Z',
          to: '2026-03-20T08:00:00.000Z',
        },
        comparisonWindow: {
          previousFrom: '2026-01-21T07:59:59.999Z',
          previousTo: '2026-02-19T07:59:59.999Z',
        },
        summaryDelta: {
          totalInterventionsDelta: 1,
          assignedCountDelta: 0,
          untriagedCountDelta: 1,
          over24hCountDelta: 0,
          over72hCountDelta: 0,
          alertMixDelta: {
            normalPercentDelta: 0,
            warningPercentDelta: 100,
            criticalPercentDelta: 0,
          },
          alertCountsDelta: {
            normalDelta: 0,
            warningDelta: 1,
            criticalDelta: 0,
          },
        },
        alertStatuses: {
          summary: 'WARNING',
          topSupplierHotspot: null,
          topBranchHotspot: null,
        },
        severityTrends: {
          summary: SupplierProcurementOverviewSeverityTrend.ESCALATING,
          topSupplierHotspot: null,
          topBranchHotspot: null,
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
            previousAlertLevel: null,
            currentAlertLevel: null,
            transition:
              SupplierProcurementOverviewAlertStatusTransition.UNCHANGED,
            changed: false,
          },
          topBranchHotspot: {
            previousAlertLevel: null,
            currentAlertLevel: null,
            transition:
              SupplierProcurementOverviewAlertStatusTransition.UNCHANGED,
            changed: false,
          },
        },
        topSupplierHotspot: null,
        topSupplierHotspotDelta: null,
        topBranchHotspot: null,
        topBranchHotspotDelta: null,
      }),
      exportProcurementBranchInterventionOverviewCsv: jest
        .fn()
        .mockResolvedValue(
          'section,generatedAt,windowDays,baselineWindowDays,totalBranchesEvaluated\n"SUMMARY","2026-03-20T08:00:00.000Z",30,90,1',
        ),
      exportProcurementBranchInterventionDashboardCsv: jest
        .fn()
        .mockResolvedValue(
          'section,generatedAt,windowDays,baselineWindowDays,totalBranchesEvaluated\n"SUMMARY","2026-03-20T08:00:00.000Z",30,90,1',
        ),
      listProcurementBranchInterventions: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-20T08:00:00.000Z',
        windowDays: 30,
        baselineWindowDays: 90,
        totalBranchesEvaluated: 1,
        summary: {
          totalInterventions: 1,
          assignedCount: 0,
          untriagedCount: 1,
          over24hCount: 0,
          over72hCount: 0,
          alertCounts: {
            normal: 0,
            warning: 1,
            critical: 0,
          },
        },
        appliedFilters: {
          includeInactive: false,
          onboardingStatus: null,
          supplierProfileIds: [],
          branchIds: [],
          statuses: [],
          latestActions: [],
          actionAgeBuckets: [],
          sortBy: SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
          assigneeUserIds: [],
          includeUntriaged: true,
          from: '2026-02-19T08:00:00.000Z',
          to: '2026-03-20T08:00:00.000Z',
        },
        interventions: [],
        supplierRollups: [],
        branchRollups: [],
      }),
      getProcurementBranchInterventionDetail: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-20T08:00:00.000Z',
        appliedFilters: {
          windowDays: 30,
          limit: 10,
          statuses: ['RECEIVED'],
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-20T08:00:00.000Z',
        },
        intervention: {
          supplierProfileId: 7,
          branchId: 3,
        },
        recentOrders: [],
        topContributingOrders: [],
        discrepancyEvents: [],
        recentActions: [],
      }),
      actOnProcurementBranchIntervention: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-20T08:00:00.000Z',
        appliedFilters: {
          windowDays: 30,
          limit: 10,
          statuses: [],
          from: '2026-02-19T08:00:00.000Z',
          to: '2026-03-20T08:00:00.000Z',
        },
        intervention: {
          supplierProfileId: 7,
          branchId: 3,
        },
        recentOrders: [],
        topContributingOrders: [],
        discrepancyEvents: [],
        recentActions: [
          {
            id: 11,
            action: 'procurement_branch_intervention.acknowledge',
          },
        ],
      }),
      exportProcurementBranchInterventionsCsv: jest
        .fn()
        .mockResolvedValue(
          'generatedAt,windowDays,baselineWindowDays\n"2026-03-20T08:00:00.000Z",30,90',
        ),
      exportProcurementBranchInterventionDetailCsv: jest
        .fn()
        .mockResolvedValue(
          'section,generatedAt,supplierProfileId,companyName\n"SUMMARY","2026-03-20T08:00:00.000Z",7,"Acme Supply"',
        ),
      exportProcurementScorecardCsv: jest
        .fn()
        .mockResolvedValue(
          'generatedAt,windowDays,filterIncludeInactive,filterOnboardingStatus,filterSupplierProfileIds,filterBranchIds,filterStatuses,filterFrom,filterTo,supplierProfileId,companyName,procurementScore\n"2026-03-19T10:00:00.000Z",30,false,"","","","","2026-02-18T10:00:00.000Z","",7,"Acme Supply",98.5',
        ),
      getProcurementTrend: jest.fn().mockResolvedValue({
        supplierProfileId: 7,
        windows: [],
      }),
      exportProcurementTrendCsv: jest
        .fn()
        .mockResolvedValue('section,supplierProfileId\n"SUMMARY",7'),
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
    await controller.purchaseOrderAudit(42, { limit: 15 });

    expect(auditService.listForTarget).toHaveBeenCalledWith(
      'PURCHASE_ORDER',
      42,
      15,
    );
  });

  it('returns the supplier procurement scorecard from the admin surface', async () => {
    await controller.procurementScorecard({
      windowDays: 30,
      limit: 15,
      includeInactive: false,
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
      supplierProfileIds: [7, 9],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.RECEIVED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-19T23:59:59.999Z'),
    });

    expect(suppliersService.listProcurementScorecard).toHaveBeenCalledWith({
      windowDays: 30,
      limit: 15,
      includeInactive: false,
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
      supplierProfileIds: [7, 9],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.RECEIVED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-19T23:59:59.999Z'),
    });
  });

  it('exports the supplier procurement scorecard from the admin surface', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.procurementScorecardExport(
      {
        windowDays: 30,
        limit: 15,
        includeInactive: true,
        supplierProfileIds: [7],
        branchIds: [3],
        statuses: [PurchaseOrderStatus.RECEIVED],
        from: new Date('2026-03-01T00:00:00.000Z'),
        to: new Date('2026-03-19T23:59:59.999Z'),
      },
      res,
    );

    expect(suppliersService.exportProcurementScorecardCsv).toHaveBeenCalledWith(
      {
        windowDays: 30,
        limit: 15,
        includeInactive: true,
        supplierProfileIds: [7],
        branchIds: [3],
        statuses: [PurchaseOrderStatus.RECEIVED],
        from: new Date('2026-03-01T00:00:00.000Z'),
        to: new Date('2026-03-19T23:59:59.999Z'),
      },
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('supplier_procurement_scorecard_'),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'generatedAt,windowDays,filterIncludeInactive,filterOnboardingStatus,filterSupplierProfileIds,filterBranchIds,filterStatuses,filterFrom,filterTo,supplierProfileId,companyName,procurementScore\n"2026-03-19T10:00:00.000Z",30,false,"","","","","2026-02-18T10:00:00.000Z","",7,"Acme Supply",98.5',
    );
  });

  it('returns procurement branch intervention dashboard rollups from the admin surface', async () => {
    await controller.procurementBranchInterventionsDashboard({
      windowDays: 30,
      limit: 10,
      supplierProfileIds: [7],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.RECEIVED],
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
      assigneeUserIds: [21],
      includeUntriaged: false,
      supplierRollupSortBy:
        SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
      branchRollupSortBy:
        SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
      supplierRollupLimit: 5,
      branchRollupLimit: 3,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(
      suppliersService.getProcurementBranchInterventionDashboard,
    ).toHaveBeenCalledWith({
      windowDays: 30,
      limit: 10,
      supplierProfileIds: [7],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.RECEIVED],
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
      assigneeUserIds: [21],
      includeUntriaged: false,
      supplierRollupSortBy:
        SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
      branchRollupSortBy:
        SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
      supplierRollupLimit: 5,
      branchRollupLimit: 3,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
  });

  it('returns procurement branch intervention overview cards from the admin surface', async () => {
    await controller.procurementBranchInterventionsDashboardOverview({
      windowDays: 30,
      limit: 10,
      supplierProfileIds: [7],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.RECEIVED],
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
      assigneeUserIds: [21],
      includeUntriaged: false,
      supplierRollupSortBy:
        SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
      branchRollupSortBy:
        SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
      supplierRollupLimit: 5,
      branchRollupLimit: 3,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(
      suppliersService.getProcurementBranchInterventionOverview,
    ).toHaveBeenCalledWith({
      windowDays: 30,
      limit: 10,
      supplierProfileIds: [7],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.RECEIVED],
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
      assigneeUserIds: [21],
      includeUntriaged: false,
      supplierRollupSortBy:
        SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
      branchRollupSortBy:
        SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
      supplierRollupLimit: 5,
      branchRollupLimit: 3,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
  });

  it('exports procurement branch intervention overview cards from the admin surface', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.procurementBranchInterventionsDashboardOverviewExport(
      {
        windowDays: 30,
        limit: 10,
        supplierProfileIds: [7],
        branchIds: [3, 4],
        statuses: [PurchaseOrderStatus.RECEIVED],
        latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
        actionAgeBuckets: [
          SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
        ],
        sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
        assigneeUserIds: [21],
        includeUntriaged: false,
        supplierRollupSortBy:
          SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
        branchRollupSortBy:
          SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
        supplierRollupLimit: 5,
        branchRollupLimit: 3,
        from: new Date('2026-03-01T00:00:00.000Z'),
        to: new Date('2026-03-20T08:00:00.000Z'),
      },
      res,
    );

    expect(
      suppliersService.exportProcurementBranchInterventionOverviewCsv,
    ).toHaveBeenCalledWith({
      windowDays: 30,
      limit: 10,
      supplierProfileIds: [7],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.RECEIVED],
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
      assigneeUserIds: [21],
      includeUntriaged: false,
      supplierRollupSortBy:
        SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
      branchRollupSortBy:
        SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
      supplierRollupLimit: 5,
      branchRollupLimit: 3,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining(
        'supplier_procurement_branch_intervention_overview_',
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'section,generatedAt,windowDays,baselineWindowDays,totalBranchesEvaluated\n"SUMMARY","2026-03-20T08:00:00.000Z",30,90,1',
    );
  });

  it('exports procurement branch intervention dashboard rollups from the admin surface', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.procurementBranchInterventionsDashboardExport(
      {
        windowDays: 30,
        limit: 10,
        supplierProfileIds: [7],
        branchIds: [3, 4],
        statuses: [PurchaseOrderStatus.RECEIVED],
        latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
        actionAgeBuckets: [
          SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
        ],
        sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
        assigneeUserIds: [21],
        includeUntriaged: false,
        supplierRollupSortBy:
          SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
        branchRollupSortBy:
          SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
        supplierRollupLimit: 5,
        branchRollupLimit: 3,
        from: new Date('2026-03-01T00:00:00.000Z'),
        to: new Date('2026-03-20T08:00:00.000Z'),
      },
      res,
    );

    expect(
      suppliersService.exportProcurementBranchInterventionDashboardCsv,
    ).toHaveBeenCalledWith({
      windowDays: 30,
      limit: 10,
      supplierProfileIds: [7],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.RECEIVED],
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
      assigneeUserIds: [21],
      includeUntriaged: false,
      supplierRollupSortBy:
        SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
      branchRollupSortBy:
        SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
      supplierRollupLimit: 5,
      branchRollupLimit: 3,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining(
        'supplier_procurement_branch_intervention_dashboard_',
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'section,generatedAt,windowDays,baselineWindowDays,totalBranchesEvaluated\n"SUMMARY","2026-03-20T08:00:00.000Z",30,90,1',
    );
  });

  it('returns procurement branch interventions from the admin surface', async () => {
    await controller.procurementBranchInterventions({
      windowDays: 30,
      limit: 10,
      supplierProfileIds: [7],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.RECEIVED],
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
      assigneeUserIds: [21],
      includeUntriaged: false,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(
      suppliersService.listProcurementBranchInterventions,
    ).toHaveBeenCalledWith({
      windowDays: 30,
      limit: 10,
      supplierProfileIds: [7],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.RECEIVED],
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
      assigneeUserIds: [21],
      includeUntriaged: false,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
  });

  it('exports procurement branch interventions from the admin surface', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.procurementBranchInterventionsExport(
      {
        windowDays: 30,
        limit: 10,
        supplierProfileIds: [7],
        branchIds: [3, 4],
        statuses: [PurchaseOrderStatus.RECEIVED],
        latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
        actionAgeBuckets: [
          SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
        ],
        sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
        assigneeUserIds: [21],
        includeUntriaged: false,
        from: new Date('2026-03-01T00:00:00.000Z'),
        to: new Date('2026-03-20T08:00:00.000Z'),
      },
      res,
    );

    expect(
      suppliersService.exportProcurementBranchInterventionsCsv,
    ).toHaveBeenCalledWith({
      windowDays: 30,
      limit: 10,
      supplierProfileIds: [7],
      branchIds: [3, 4],
      statuses: [PurchaseOrderStatus.RECEIVED],
      latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
      actionAgeBuckets: [
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
      ],
      sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
      assigneeUserIds: [21],
      includeUntriaged: false,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('supplier_procurement_branch_interventions_'),
    );
    expect(res.send).toHaveBeenCalledWith(
      'generatedAt,windowDays,baselineWindowDays\n"2026-03-20T08:00:00.000Z",30,90',
    );
  });

  it('returns procurement intervention detail from the admin surface', async () => {
    await controller.procurementBranchInterventionDetail(7, 3, {
      windowDays: 30,
      limit: 10,
      statuses: [PurchaseOrderStatus.RECEIVED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });

    expect(
      suppliersService.getProcurementBranchInterventionDetail,
    ).toHaveBeenCalledWith(7, 3, {
      windowDays: 30,
      limit: 10,
      statuses: [PurchaseOrderStatus.RECEIVED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
  });

  it('records procurement intervention actions from the admin surface', async () => {
    await controller.procurementBranchInterventionAction(
      7,
      3,
      {
        action: SupplierProcurementBranchInterventionAction.ACKNOWLEDGE,
        note: 'Ops lead taking ownership',
      },
      {
        user: {
          id: 7,
          email: 'admin@example.com',
          roles: ['ADMIN'],
        },
      },
    );

    expect(
      suppliersService.actOnProcurementBranchIntervention,
    ).toHaveBeenCalledWith(
      7,
      3,
      {
        action: SupplierProcurementBranchInterventionAction.ACKNOWLEDGE,
        note: 'Ops lead taking ownership',
      },
      {
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
    );
  });

  it('exports procurement intervention detail from the admin surface', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.procurementBranchInterventionDetailExport(
      7,
      3,
      {
        windowDays: 30,
        limit: 10,
        statuses: [PurchaseOrderStatus.RECEIVED],
        from: new Date('2026-03-01T00:00:00.000Z'),
        to: new Date('2026-03-20T08:00:00.000Z'),
      },
      res,
    );

    expect(
      suppliersService.exportProcurementBranchInterventionDetailCsv,
    ).toHaveBeenCalledWith(7, 3, {
      windowDays: 30,
      limit: 10,
      statuses: [PurchaseOrderStatus.RECEIVED],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('supplier_procurement_branch_intervention_7_3_'),
    );
    expect(res.send).toHaveBeenCalledWith(
      'section,generatedAt,supplierProfileId,companyName\n"SUMMARY","2026-03-20T08:00:00.000Z",7,"Acme Supply"',
    );
  });

  it('returns supplier procurement trend snapshots from the admin surface', async () => {
    const req = {
      user: {
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
    };

    await controller.procurementTrend(
      7,
      {
        branchIds: [3],
        statuses: [PurchaseOrderStatus.RECEIVED],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      req,
    );

    expect(suppliersService.getProcurementTrend).toHaveBeenCalledWith(
      7,
      {
        branchIds: [3],
        statuses: [PurchaseOrderStatus.RECEIVED],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
    );
  });

  it('exports supplier procurement trend snapshots from the admin surface', async () => {
    const req = {
      user: {
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
    };
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.procurementTrendExport(
      7,
      {
        branchIds: [3],
        statuses: [PurchaseOrderStatus.RECEIVED],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      req,
      res,
    );

    expect(suppliersService.exportProcurementTrendCsv).toHaveBeenCalledWith(
      7,
      {
        branchIds: [3],
        statuses: [PurchaseOrderStatus.RECEIVED],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        id: 7,
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('supplier_procurement_trend_7_'),
    );
    expect(res.send).toHaveBeenCalledWith(
      'section,supplierProfileId\n"SUMMARY",7',
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
    await controller.purchaseOrderReceiptEvents(42, { page: 2, limit: 10 });

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
