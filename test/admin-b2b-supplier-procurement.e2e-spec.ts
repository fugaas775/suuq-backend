import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import { AuditService } from '../src/audit/audit.service';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminB2bController } from '../src/admin/b2b.admin.controller';
import { AdminB2bService } from '../src/admin/b2b.admin.service';
import { PartnerCredentialsService } from '../src/partner-credentials/partner-credentials.service';
import { PurchaseOrdersService } from '../src/purchase-orders/purchase-orders.service';
import { PurchaseOrderStatus } from '../src/purchase-orders/entities/purchase-order.entity';
import { SuppliersService } from '../src/suppliers/suppliers.service';

describe('AdminB2bController supplier procurement (e2e)', () => {
  let app: INestApplication;
  let suppliersService: {
    listProcurementScorecard: jest.Mock;
    exportProcurementScorecardCsv: jest.Mock;
    getProcurementBranchInterventionDashboard: jest.Mock;
    getProcurementBranchInterventionOverview: jest.Mock;
    exportProcurementBranchInterventionOverviewCsv: jest.Mock;
    exportProcurementBranchInterventionDashboardCsv: jest.Mock;
    listProcurementBranchInterventions: jest.Mock;
    exportProcurementBranchInterventionsCsv: jest.Mock;
    getProcurementBranchInterventionDetail: jest.Mock;
    exportProcurementBranchInterventionDetailCsv: jest.Mock;
    actOnProcurementBranchIntervention: jest.Mock;
    getProcurementTrend: jest.Mock;
    exportProcurementTrendCsv: jest.Mock;
  };

  beforeAll(async () => {
    suppliersService = {
      listProcurementScorecard: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-19T10:00:00.000Z',
        windowDays: 30,
        totalSuppliersEvaluated: 1,
        appliedFilters: {
          includeInactive: false,
          onboardingStatus: 'APPROVED',
          supplierProfileIds: [7],
          branchIds: [3],
          statuses: ['RECEIVED'],
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-19T23:59:59.999Z',
        },
        rankedSuppliers: [
          {
            supplierProfileId: 7,
            companyName: 'Acme Supply',
            procurementScore: 98.5,
          },
        ],
      }),
      exportProcurementScorecardCsv: jest
        .fn()
        .mockResolvedValue(
          'generatedAt,supplierProfileId\n"2026-03-19T10:00:00.000Z",7',
        ),
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
          onboardingStatus: 'APPROVED',
          supplierProfileIds: [7],
          branchIds: [3],
          statuses: ['RECEIVED'],
          latestActions: ['ASSIGN'],
          actionAgeBuckets: ['OVER_24H'],
          sortBy: 'STALE_FIRST',
          assigneeUserIds: [21],
          includeUntriaged: false,
          supplierRollupSortBy: 'UNTRIAGED_DESC',
          branchRollupSortBy: 'INTERVENTION_COUNT_DESC',
          supplierRollupLimit: 5,
          branchRollupLimit: 3,
          from: '2026-03-01T00:00:00.000Z',
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
          onboardingStatus: 'APPROVED',
          supplierProfileIds: [7],
          branchIds: [3],
          statuses: ['RECEIVED'],
          latestActions: ['ASSIGN'],
          actionAgeBuckets: ['OVER_24H'],
          sortBy: 'STALE_FIRST',
          assigneeUserIds: [21],
          includeUntriaged: false,
          supplierRollupSortBy: 'UNTRIAGED_DESC',
          branchRollupSortBy: 'INTERVENTION_COUNT_DESC',
          supplierRollupLimit: 5,
          branchRollupLimit: 3,
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-20T08:00:00.000Z',
        },
        comparisonWindow: {
          previousFrom: '2025-12-01T00:00:00.000Z',
          previousTo: '2026-02-29T23:59:59.999Z',
        },
        summaryDelta: {
          totalInterventionsDelta: -1,
          assignedCountDelta: 0,
          untriagedCountDelta: 1,
          over24hCountDelta: 0,
          over72hCountDelta: 0,
          alertMixDelta: {
            normalPercentDelta: 0,
            warningPercentDelta: 20,
            criticalPercentDelta: -20,
          },
          alertCountsDelta: {
            normalDelta: 0,
            warningDelta: 1,
            criticalDelta: -1,
          },
          issueMixDelta: [],
          actionHintMixDelta: [],
        },
        alertStatuses: {
          summary: 'WARNING',
          topSupplierHotspot: 'WARNING',
          topBranchHotspot: 'WARNING',
        },
        severityTrends: {
          summary: 'ESCALATING',
          topSupplierHotspot: 'ESCALATING',
          topBranchHotspot: 'ESCALATING',
        },
        alertStatusTransitions: {
          summary: {
            previousAlertLevel: 'NORMAL',
            currentAlertLevel: 'WARNING',
            transition: 'ESCALATED',
            changed: true,
          },
          topSupplierHotspot: {
            previousAlertLevel: 'NORMAL',
            currentAlertLevel: 'WARNING',
            transition: 'ESCALATED',
            changed: true,
          },
          topBranchHotspot: {
            previousAlertLevel: 'NORMAL',
            currentAlertLevel: 'WARNING',
            transition: 'ESCALATED',
            changed: true,
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
          onboardingStatus: 'APPROVED',
          supplierProfileIds: [7],
          branchIds: [3],
          statuses: ['RECEIVED'],
          latestActions: ['ASSIGN'],
          actionAgeBuckets: ['OVER_24H'],
          sortBy: 'STALE_FIRST',
          assigneeUserIds: [21],
          includeUntriaged: false,
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-20T08:00:00.000Z',
        },
        interventions: [
          {
            supplierProfileId: 7,
            companyName: 'Acme Supply',
            branchId: 3,
            branchName: 'Bole',
            branchCode: 'BOLE',
            latestAction: 'ASSIGN',
            interventionPriorityScore: 82,
            alertLevel: 'WARNING',
            topIssues: ['LOW_FILL_RATE'],
            actionHints: ['FOLLOW_UP'],
          },
        ],
        supplierRollups: [],
        branchRollups: [],
      }),
      exportProcurementBranchInterventionsCsv: jest
        .fn()
        .mockResolvedValue(
          'generatedAt,windowDays,baselineWindowDays\n"2026-03-20T08:00:00.000Z",30,90',
        ),
      getProcurementBranchInterventionDetail: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-20T08:00:00.000Z',
        supplierProfileId: 7,
        branchId: 3,
        companyName: 'Acme Supply',
        branchName: 'Bole',
        branchCode: 'BOLE',
        appliedFilters: {
          windowDays: 30,
          limit: 10,
          statuses: ['RECEIVED'],
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-20T08:00:00.000Z',
        },
        actions: [],
        purchaseOrders: [],
        discrepancyEvents: [],
      }),
      exportProcurementBranchInterventionDetailCsv: jest
        .fn()
        .mockResolvedValue(
          'section,generatedAt,supplierProfileId,companyName\n"SUMMARY","2026-03-20T08:00:00.000Z",7,"Acme Supply"',
        ),
      actOnProcurementBranchIntervention: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-20T08:00:00.000Z',
        supplierProfileId: 7,
        branchId: 3,
        companyName: 'Acme Supply',
        branchName: 'Bole',
        branchCode: 'BOLE',
        appliedFilters: {
          windowDays: 30,
          limit: 10,
          statuses: [],
          from: null,
          to: null,
        },
        actions: [],
        purchaseOrders: [],
        discrepancyEvents: [],
      }),
      getProcurementTrend: jest.fn().mockResolvedValue({
        supplierProfileId: 7,
        companyName: 'Acme Supply',
        onboardingStatus: 'APPROVED',
        isActive: true,
        generatedAt: '2026-03-19T12:00:00.000Z',
        asOf: '2026-03-19T12:00:00.000Z',
        trendDirection: 'IMPROVING',
        scoreDeltaFrom90d: 18.5,
        fillRateDeltaFrom90d: 12,
        appliedFilters: {
          branchIds: [3, 4],
          statuses: ['RECEIVED'],
          asOf: '2026-03-19T12:00:00.000Z',
        },
        windows: [
          {
            windowDays: 7,
            procurementScore: 98,
          },
        ],
        branchBuckets: [
          {
            branchId: 3,
            branchName: 'Bole',
            branchCode: 'BOLE',
            procurementScore: 91.5,
            trendDirection: 'IMPROVING',
          },
        ],
        topContributingOrders: [
          {
            purchaseOrderId: 42,
            branchId: 3,
          },
        ],
        topDiscrepancyEvents: [
          {
            receiptEventId: 9,
            branchId: 3,
          },
        ],
      }),
      exportProcurementTrendCsv: jest
        .fn()
        .mockResolvedValue('section,supplierProfileId\n"SUMMARY",7'),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminB2bController],
      providers: [
        {
          provide: SuppliersService,
          useValue: suppliersService,
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
        {
          provide: AdminB2bService,
          useValue: {
            listPurchaseOrders: jest.fn(),
            listBranchTransfers: jest.fn(),
            getBranchTransfer: jest.fn(),
            listBranchInventory: jest.fn(),
            listStockMovements: jest.fn(),
            listPurchaseOrderReceiptEvents: jest.fn(),
            reevaluateAutoReplenishmentDraft: jest.fn(),
            listPosSyncJobs: jest.fn(),
            getPosSyncJob: jest.fn(),
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

  it('returns the supplier procurement scorecard with parsed admin filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/supplier-profiles/procurement-scorecard')
      .query({
        windowDays: 30,
        limit: 15,
        includeInactive: 'false',
        onboardingStatus: 'APPROVED',
        supplierProfileIds: '7,9',
        branchIds: '3,4',
        statuses: 'SUBMITTED,RECEIVED',
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-19T23:59:59.999Z',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        totalSuppliersEvaluated: 1,
        rankedSuppliers: expect.arrayContaining([
          expect.objectContaining({
            supplierProfileId: 7,
            procurementScore: 98.5,
          }),
        ]),
      }),
    );
    expect(suppliersService.listProcurementScorecard).toHaveBeenCalledWith({
      windowDays: 30,
      limit: 15,
      includeInactive: false,
      onboardingStatus: 'APPROVED',
      supplierProfileIds: [7, 9],
      branchIds: [3, 4],
      statuses: ['SUBMITTED', 'RECEIVED'],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-19T23:59:59.999Z'),
    });
  });

  it('exports the supplier procurement scorecard as csv from the admin surface', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/supplier-profiles/procurement-scorecard/export')
      .query({
        supplierProfileIds: '7',
        statuses: 'RECEIVED',
      })
      .expect(200);

    expect(response.text).toContain('generatedAt,supplierProfileId');
    expect(suppliersService.exportProcurementScorecardCsv).toHaveBeenCalledWith(
      {
        supplierProfileIds: [7],
        statuses: ['RECEIVED'],
      },
    );
  });

  it('returns procurement intervention dashboard rollups with parsed admin filters', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/supplier-profiles/procurement-branch-interventions/dashboard',
      )
      .query({
        supplierProfileIds: '7',
        branchIds: '3',
        statuses: 'RECEIVED',
        latestActions: 'ASSIGN',
        actionAgeBuckets: 'OVER_24H',
        sortBy: 'STALE_FIRST',
        assigneeUserIds: '21',
        includeUntriaged: 'false',
        supplierRollupSortBy: 'UNTRIAGED_DESC',
        branchRollupSortBy: 'INTERVENTION_COUNT_DESC',
        supplierRollupLimit: 5,
        branchRollupLimit: 3,
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T08:00:00.000Z',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        totalBranchesEvaluated: 1,
        summary: expect.objectContaining({
          totalInterventions: 1,
          untriagedCount: 1,
        }),
      }),
    );
    expect(
      suppliersService.getProcurementBranchInterventionDashboard,
    ).toHaveBeenCalledWith({
      supplierProfileIds: [7],
      branchIds: [3],
      statuses: ['RECEIVED'],
      latestActions: ['ASSIGN'],
      actionAgeBuckets: ['OVER_24H'],
      sortBy: 'STALE_FIRST',
      assigneeUserIds: [21],
      includeUntriaged: false,
      supplierRollupSortBy: 'UNTRIAGED_DESC',
      branchRollupSortBy: 'INTERVENTION_COUNT_DESC',
      supplierRollupLimit: 5,
      branchRollupLimit: 3,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
  });

  it('returns procurement intervention overview cards with parsed admin filters', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/supplier-profiles/procurement-branch-interventions/dashboard/overview',
      )
      .query({
        supplierProfileIds: '7',
        branchIds: '3',
        statuses: 'RECEIVED',
        latestActions: 'ASSIGN',
        actionAgeBuckets: 'OVER_24H',
        sortBy: 'STALE_FIRST',
        assigneeUserIds: '21',
        includeUntriaged: 'false',
        supplierRollupSortBy: 'UNTRIAGED_DESC',
        branchRollupSortBy: 'INTERVENTION_COUNT_DESC',
        supplierRollupLimit: 5,
        branchRollupLimit: 3,
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T08:00:00.000Z',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        totalBranchesEvaluated: 1,
        alertStatuses: expect.objectContaining({
          summary: 'WARNING',
        }),
      }),
    );
    expect(
      suppliersService.getProcurementBranchInterventionOverview,
    ).toHaveBeenCalledWith({
      supplierProfileIds: [7],
      branchIds: [3],
      statuses: ['RECEIVED'],
      latestActions: ['ASSIGN'],
      actionAgeBuckets: ['OVER_24H'],
      sortBy: 'STALE_FIRST',
      assigneeUserIds: [21],
      includeUntriaged: false,
      supplierRollupSortBy: 'UNTRIAGED_DESC',
      branchRollupSortBy: 'INTERVENTION_COUNT_DESC',
      supplierRollupLimit: 5,
      branchRollupLimit: 3,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
  });

  it('exports procurement intervention overview cards as csv from the admin surface', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/supplier-profiles/procurement-branch-interventions/dashboard/overview/export',
      )
      .query({
        supplierProfileIds: '7',
        branchIds: '3',
        latestActions: 'ASSIGN',
      })
      .expect(200);

    expect(response.text).toContain('section,generatedAt,windowDays');
    expect(
      suppliersService.exportProcurementBranchInterventionOverviewCsv,
    ).toHaveBeenCalledWith({
      supplierProfileIds: [7],
      branchIds: [3],
      latestActions: ['ASSIGN'],
    });
  });

  it('exports procurement intervention dashboard rollups as csv from the admin surface', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/supplier-profiles/procurement-branch-interventions/dashboard/export',
      )
      .query({
        supplierProfileIds: '7',
        branchIds: '3',
        latestActions: 'ASSIGN',
      })
      .expect(200);

    expect(response.text).toContain('section,generatedAt,windowDays');
    expect(
      suppliersService.exportProcurementBranchInterventionDashboardCsv,
    ).toHaveBeenCalledWith({
      supplierProfileIds: [7],
      branchIds: [3],
      latestActions: ['ASSIGN'],
    });
  });

  it('returns procurement branch interventions with parsed admin filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/supplier-profiles/procurement-branch-interventions')
      .query({
        supplierProfileIds: '7',
        branchIds: '3',
        statuses: 'RECEIVED',
        latestActions: 'ASSIGN',
        actionAgeBuckets: 'OVER_24H',
        sortBy: 'STALE_FIRST',
        assigneeUserIds: '21',
        includeUntriaged: 'false',
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T08:00:00.000Z',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        totalBranchesEvaluated: 1,
        interventions: expect.arrayContaining([
          expect.objectContaining({
            supplierProfileId: 7,
            branchId: 3,
            alertLevel: 'WARNING',
          }),
        ]),
      }),
    );
    expect(
      suppliersService.listProcurementBranchInterventions,
    ).toHaveBeenCalledWith({
      supplierProfileIds: [7],
      branchIds: [3],
      statuses: ['RECEIVED'],
      latestActions: ['ASSIGN'],
      actionAgeBuckets: ['OVER_24H'],
      sortBy: 'STALE_FIRST',
      assigneeUserIds: [21],
      includeUntriaged: false,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
  });

  it('exports procurement branch interventions as csv from the admin surface', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/supplier-profiles/procurement-branch-interventions/export',
      )
      .query({
        supplierProfileIds: '7',
        branchIds: '3',
        statuses: 'RECEIVED',
      })
      .expect(200);

    expect(response.text).toContain(
      'generatedAt,windowDays,baselineWindowDays',
    );
    expect(
      suppliersService.exportProcurementBranchInterventionsCsv,
    ).toHaveBeenCalledWith({
      supplierProfileIds: [7],
      branchIds: [3],
      statuses: ['RECEIVED'],
    });
  });

  it('returns procurement intervention detail with parsed filters', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/supplier-profiles/7/branches/3/procurement-intervention-detail',
      )
      .query({
        windowDays: 30,
        limit: 10,
        statuses: 'RECEIVED',
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T08:00:00.000Z',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        supplierProfileId: 7,
        branchId: 3,
      }),
    );
    expect(
      suppliersService.getProcurementBranchInterventionDetail,
    ).toHaveBeenCalledWith(7, 3, {
      windowDays: 30,
      limit: 10,
      statuses: ['RECEIVED'],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
  });

  it('records procurement intervention actions with the authenticated admin actor', async () => {
    const response = await request(app.getHttpServer())
      .patch(
        '/api/admin/b2b/supplier-profiles/7/branches/3/procurement-intervention-action',
      )
      .send({
        action: 'ASSIGN',
        note: 'Ops lead taking ownership',
        assigneeUserId: 21,
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        supplierProfileId: 7,
        branchId: 3,
      }),
    );
    expect(
      suppliersService.actOnProcurementBranchIntervention,
    ).toHaveBeenCalledWith(
      7,
      3,
      {
        action: 'ASSIGN',
        note: 'Ops lead taking ownership',
        assigneeUserId: 21,
      },
      {
        id: 7,
        email: 'admin@test.com',
        roles: ['ADMIN'],
      },
    );
  });

  it('exports procurement intervention detail as csv from the admin surface', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/supplier-profiles/7/branches/3/procurement-intervention-detail/export',
      )
      .query({
        windowDays: 30,
        limit: 10,
        statuses: 'RECEIVED',
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T08:00:00.000Z',
      })
      .expect(200);

    expect(response.text).toContain(
      'section,generatedAt,supplierProfileId,companyName',
    );
    expect(
      suppliersService.exportProcurementBranchInterventionDetailCsv,
    ).toHaveBeenCalledWith(7, 3, {
      windowDays: 30,
      limit: 10,
      statuses: ['RECEIVED'],
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-20T08:00:00.000Z'),
    });
  });

  it('returns supplier procurement trend snapshots with parsed filters from the admin surface', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/supplier-profiles/7/procurement-trend')
      .query({
        branchIds: '3,4',
        statuses: 'RECEIVED',
        asOf: '2026-03-19T12:00:00.000Z',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        supplierProfileId: 7,
        trendDirection: 'IMPROVING',
        branchBuckets: expect.arrayContaining([
          expect.objectContaining({
            branchId: 3,
            trendDirection: 'IMPROVING',
          }),
        ]),
      }),
    );
    expect(suppliersService.getProcurementTrend).toHaveBeenCalledWith(
      7,
      {
        branchIds: [3, 4],
        statuses: ['RECEIVED'],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        id: 7,
        email: 'admin@test.com',
        roles: ['ADMIN'],
      },
    );
  });

  it('exports supplier procurement trend snapshots with parsed filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/b2b/supplier-profiles/7/procurement-trend/export')
      .query({
        branchIds: '3,4',
        statuses: 'RECEIVED',
        asOf: '2026-03-19T12:00:00.000Z',
      })
      .expect(200);

    expect(response.text).toContain('section,supplierProfileId');
    expect(suppliersService.exportProcurementTrendCsv).toHaveBeenCalledWith(
      7,
      {
        branchIds: [3, 4],
        statuses: ['RECEIVED'],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        id: 7,
        email: 'admin@test.com',
        roles: ['ADMIN'],
      },
    );
  });

  it('returns HTTP 400 for malformed scorecard status filters', async () => {
    const callCount =
      suppliersService.listProcurementScorecard.mock.calls.length;

    await request(app.getHttpServer())
      .get('/api/admin/b2b/supplier-profiles/procurement-scorecard')
      .query({ statuses: 'NOT_A_REAL_STATUS' })
      .expect(400);

    expect(suppliersService.listProcurementScorecard).toHaveBeenCalledTimes(
      callCount,
    );
  });

  it('returns HTTP 400 for malformed dashboard assignee filters', async () => {
    const callCount =
      suppliersService.getProcurementBranchInterventionDashboard.mock.calls
        .length;

    await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/supplier-profiles/procurement-branch-interventions/dashboard',
      )
      .query({ assigneeUserIds: 'abc' })
      .expect(400);

    expect(
      suppliersService.getProcurementBranchInterventionDashboard,
    ).toHaveBeenCalledTimes(callCount);
  });

  it('returns HTTP 400 for malformed trend asOf filters', async () => {
    const callCount =
      suppliersService.exportProcurementTrendCsv.mock.calls.length;

    await request(app.getHttpServer())
      .get('/api/admin/b2b/supplier-profiles/7/procurement-trend/export')
      .query({ asOf: 'not-a-date' })
      .expect(400);

    expect(suppliersService.exportProcurementTrendCsv).toHaveBeenCalledTimes(
      callCount,
    );
  });

  it('returns HTTP 400 for malformed procurement intervention actions', async () => {
    const callCount =
      suppliersService.actOnProcurementBranchIntervention.mock.calls.length;

    await request(app.getHttpServer())
      .patch(
        '/api/admin/b2b/supplier-profiles/7/branches/3/procurement-intervention-action',
      )
      .send({
        action: 'INVALID_ACTION',
        assigneeUserId: 0,
      })
      .expect(400);

    expect(
      suppliersService.actOnProcurementBranchIntervention,
    ).toHaveBeenCalledTimes(callCount);
  });

  it('returns HTTP 400 for malformed procurement intervention detail dates', async () => {
    const callCount =
      suppliersService.getProcurementBranchInterventionDetail.mock.calls.length;

    await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/supplier-profiles/7/branches/3/procurement-intervention-detail',
      )
      .query({ from: 'invalid-date' })
      .expect(400);

    expect(
      suppliersService.getProcurementBranchInterventionDetail,
    ).toHaveBeenCalledTimes(callCount);
  });

  it('returns HTTP 400 for inverted procurement intervention detail date ranges', async () => {
    suppliersService.getProcurementBranchInterventionDetail.mockRejectedValueOnce(
      new BadRequestException(
        'from date must be earlier than or equal to to date',
      ),
    );

    await request(app.getHttpServer())
      .get(
        '/api/admin/b2b/supplier-profiles/7/branches/3/procurement-intervention-detail',
      )
      .query({
        from: '2026-03-20T08:00:00.000Z',
        to: '2026-03-01T00:00:00.000Z',
      })
      .expect(400);
  });
});
