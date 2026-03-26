import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RetailAttendanceService } from './retail-attendance.service';
import { RetailOpsController } from './retail-ops.controller';
import { RetailEntitlementsService } from './retail-entitlements.service';
import { RetailModulesGuard } from './retail-modules.guard';
import { RetailOpsService } from './retail-ops.service';

describe('RetailOpsController', () => {
  let controller: RetailOpsController;
  let retailOpsService: {
    getNetworkCommandCenterSummary: jest.Mock;
    getLatestNetworkCommandCenterReportSnapshot: jest.Mock;
    captureNetworkCommandCenterReportSnapshot: jest.Mock;
    exportNetworkCommandCenterSummaryCsv: jest.Mock;
    getPosOperations: jest.Mock;
    exportPosOperationsCsv: jest.Mock;
    getPosNetworkSummary: jest.Mock;
    exportPosNetworkSummaryCsv: jest.Mock;
    getPosExceptions: jest.Mock;
    exportPosExceptionsCsv: jest.Mock;
    getPosExceptionNetworkSummary: jest.Mock;
    exportPosExceptionNetworkSummaryCsv: jest.Mock;
    getPosOrderDetail: jest.Mock;
    getStockHealth: jest.Mock;
    exportStockHealthCsv: jest.Mock;
    getStockHealthNetworkSummary: jest.Mock;
    exportStockHealthNetworkSummaryCsv: jest.Mock;
    getAiInsights: jest.Mock;
    exportAiInsightsCsv: jest.Mock;
    getAiNetworkSummary: jest.Mock;
    exportAiNetworkSummaryCsv: jest.Mock;
    getAccountingOverview: jest.Mock;
    exportAccountingOverviewCsv: jest.Mock;
    getAccountingNetworkSummary: jest.Mock;
    exportAccountingNetworkSummaryCsv: jest.Mock;
    getAccountingPayoutExceptions: jest.Mock;
    exportAccountingPayoutExceptionsCsv: jest.Mock;
    getAccountingPayoutNetworkSummary: jest.Mock;
    exportAccountingPayoutNetworkSummaryCsv: jest.Mock;
    getDesktopWorkbench: jest.Mock;
    exportDesktopWorkbenchCsv: jest.Mock;
    getDesktopNetworkSummary: jest.Mock;
    exportDesktopNetworkSummaryCsv: jest.Mock;
    getDesktopSyncJobFailedEntries: jest.Mock;
    getDesktopTransferDetail: jest.Mock;
    getDesktopStockExceptionDetail: jest.Mock;
    listReplenishmentDrafts: jest.Mock;
    getReplenishmentNetworkSummary: jest.Mock;
    exportReplenishmentNetworkSummaryCsv: jest.Mock;
    reevaluateReplenishmentDraft: jest.Mock;
  };
  let retailAttendanceService: {
    getAttendanceSummary: jest.Mock;
    getAttendanceDetail: jest.Mock;
    exportAttendanceDetailCsv: jest.Mock;
    getAttendanceExceptions: jest.Mock;
    exportAttendanceExceptionsCsv: jest.Mock;
    checkIn: jest.Mock;
    checkOut: jest.Mock;
    overrideCheckIn: jest.Mock;
    overrideCheckOut: jest.Mock;
    getAttendanceNetworkSummary: jest.Mock;
    exportAttendanceNetworkSummaryCsv: jest.Mock;
    getAttendanceComplianceSummary: jest.Mock;
    exportAttendanceComplianceCsv: jest.Mock;
  };

  beforeEach(async () => {
    retailOpsService = {
      getNetworkCommandCenterSummary: jest
        .fn()
        .mockResolvedValue({ enabledModuleCount: 0, alerts: [], modules: [] }),
      getLatestNetworkCommandCenterReportSnapshot: jest.fn().mockResolvedValue({
        snapshotKey: 'snapshot-key',
        summary: { enabledModuleCount: 0 },
      }),
      captureNetworkCommandCenterReportSnapshot: jest.fn().mockResolvedValue({
        snapshotKey: 'snapshot-key',
        summary: { enabledModuleCount: 0 },
      }),
      exportNetworkCommandCenterSummaryCsv: jest
        .fn()
        .mockResolvedValue('module,status\nINVENTORY_CORE,CRITICAL'),
      getPosOperations: jest.fn().mockResolvedValue({
        summary: {},
        alerts: [],
        paymentMix: [],
        statusMix: [],
        topItems: [],
      }),
      exportPosOperationsCsv: jest
        .fn()
        .mockResolvedValue('branchId,orderCount\n3,12'),
      getPosNetworkSummary: jest
        .fn()
        .mockResolvedValue({ branchCount: 0, alerts: [], branches: [] }),
      exportPosNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName\n3,"HQ"'),
      getPosExceptions: jest
        .fn()
        .mockResolvedValue({ summary: {}, actions: [], items: [] }),
      exportPosExceptionsCsv: jest
        .fn()
        .mockResolvedValue('branchId,orderId,queueType\n3,18,FAILED_PAYMENT'),
      getPosExceptionNetworkSummary: jest
        .fn()
        .mockResolvedValue({ branchCount: 0, alerts: [], branches: [] }),
      exportPosExceptionNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName,exceptionCount\n3,"HQ",2'),
      getPosOrderDetail: jest
        .fn()
        .mockResolvedValue({ summary: {}, actions: [], items: [] }),
      getStockHealth: jest.fn().mockResolvedValue({ summary: {}, items: [] }),
      exportStockHealthCsv: jest
        .fn()
        .mockResolvedValue('branchId,inventoryId\n3,11'),
      getStockHealthNetworkSummary: jest
        .fn()
        .mockResolvedValue({ branchCount: 0, alerts: [], branches: [] }),
      exportStockHealthNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName\n3,"HQ"'),
      getAiInsights: jest
        .fn()
        .mockResolvedValue({ summary: {}, insights: [], productRisks: [] }),
      exportAiInsightsCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,generatedAt,healthScore\n3,"2026-03-18T10:00:00.000Z",71',
        ),
      getAiNetworkSummary: jest
        .fn()
        .mockResolvedValue({ branchCount: 0, alerts: [], branches: [] }),
      exportAiNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName\n3,"HQ"'),
      getAccountingOverview: jest
        .fn()
        .mockResolvedValue({ summary: {}, items: [] }),
      exportAccountingOverviewCsv: jest
        .fn()
        .mockResolvedValue('branchId,purchaseOrderId\n3,82'),
      getAccountingNetworkSummary: jest
        .fn()
        .mockResolvedValue({ branchCount: 0, alerts: [], branches: [] }),
      exportAccountingNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName\n3,"HQ"'),
      getAccountingPayoutExceptions: jest
        .fn()
        .mockResolvedValue({ summary: {}, alerts: [], items: [] }),
      exportAccountingPayoutExceptionsCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,payoutLogId,exceptionType\n3,901,AUTO_RETRY_REQUIRED',
        ),
      getAccountingPayoutNetworkSummary: jest
        .fn()
        .mockResolvedValue({ branchCount: 0, alerts: [], branches: [] }),
      exportAccountingPayoutNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName,exceptionCount\n3,"HQ",2'),
      getDesktopWorkbench: jest.fn().mockResolvedValue({
        summary: {},
        alerts: [],
        syncQueue: [],
        transferQueue: [],
        stockExceptions: [],
      }),
      exportDesktopWorkbenchCsv: jest
        .fn()
        .mockResolvedValue('branchId,queueType,recordId\n3,SYNC_QUEUE,401'),
      getDesktopNetworkSummary: jest
        .fn()
        .mockResolvedValue({ branchCount: 0, alerts: [], branches: [] }),
      exportDesktopNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName\n3,"HQ"'),
      getDesktopSyncJobFailedEntries: jest
        .fn()
        .mockResolvedValue({ summary: {}, actions: [], items: [] }),
      getDesktopTransferDetail: jest
        .fn()
        .mockResolvedValue({ summary: {}, actions: [], items: [] }),
      getDesktopStockExceptionDetail: jest
        .fn()
        .mockResolvedValue({ summary: {}, actions: [] }),
      listReplenishmentDrafts: jest
        .fn()
        .mockResolvedValue({ summary: {}, items: [] }),
      getReplenishmentNetworkSummary: jest
        .fn()
        .mockResolvedValue({ branchCount: 0, alerts: [], branches: [] }),
      exportReplenishmentNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName\n3,"HQ"'),
      reevaluateReplenishmentDraft: jest.fn().mockResolvedValue({ id: 42 }),
    };
    retailAttendanceService = {
      getAttendanceSummary: jest
        .fn()
        .mockResolvedValue({ summary: {}, items: [] }),
      getAttendanceDetail: jest
        .fn()
        .mockResolvedValue({ summary: {}, actions: [], logs: [] }),
      exportAttendanceDetailCsv: jest
        .fn()
        .mockResolvedValue('branchId,userId\n3,11'),
      getAttendanceExceptions: jest
        .fn()
        .mockResolvedValue({ summary: {}, actions: [], items: [] }),
      exportAttendanceExceptionsCsv: jest
        .fn()
        .mockResolvedValue('branchId,userId,queueType\n3,11,ABSENT'),
      checkIn: jest.fn().mockResolvedValue({ attendanceLogId: 1 }),
      checkOut: jest.fn().mockResolvedValue({ attendanceLogId: 1 }),
      overrideCheckIn: jest.fn().mockResolvedValue({ attendanceLogId: 2 }),
      overrideCheckOut: jest.fn().mockResolvedValue({ attendanceLogId: 2 }),
      getAttendanceNetworkSummary: jest
        .fn()
        .mockResolvedValue({ branchCount: 0, alerts: [], branches: [] }),
      exportAttendanceNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName\n3,"HQ"'),
      getAttendanceComplianceSummary: jest.fn().mockResolvedValue({
        summary: {
          anchorBranchId: 3,
          retailTenantId: 9,
          branchCount: 2,
          filteredBranchCount: 1,
          windowHours: 168,
          totalStaffCount: 4,
          filteredStaffCount: 2,
          totalExceptionCount: 3,
          filteredExceptionCount: 1,
          lastActivityAt: '2026-03-19T08:00:00.000Z',
          permissions: { canOverrideAttendance: false },
        },
        statusCounts: [],
        queueTypeCounts: [],
        priorityCounts: [],
      }),
      exportAttendanceComplianceCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName,userId\n3,"HQ",11'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RetailOpsController],
      providers: [
        { provide: RetailOpsService, useValue: retailOpsService },
        { provide: RetailAttendanceService, useValue: retailAttendanceService },
        {
          provide: JwtAuthGuard,
          useValue: { canActivate: jest.fn(() => true) },
        },
        { provide: RolesGuard, useValue: { canActivate: jest.fn(() => true) } },
        {
          provide: RetailModulesGuard,
          useValue: { canActivate: jest.fn(() => true) },
        },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        {
          provide: RetailEntitlementsService,
          useValue: { assertBranchHasModules: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(RetailOpsController);
  });

  it('delegates HR attendance queries to the retail attendance service', async () => {
    await controller.hrAttendance(
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
      { branchId: 3, windowHours: 24, limit: 20 },
    );

    expect(retailAttendanceService.getAttendanceSummary).toHaveBeenCalledWith(
      {
        branchId: 3,
        windowHours: 24,
        limit: 20,
      },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('delegates HR attendance detail queries to the retail attendance service', async () => {
    await controller.hrAttendanceDetail(
      11,
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
      {
        branchId: 3,
        limit: 10,
        windowHours: 168,
      },
    );

    expect(retailAttendanceService.getAttendanceDetail).toHaveBeenCalledWith(
      11,
      {
        branchId: 3,
        limit: 10,
        windowHours: 168,
      },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('streams HR attendance detail exports from the retail attendance service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.hrAttendanceDetailExport(
      11,
      res,
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
      {
        branchId: 3,
        limit: 10,
        windowHours: 168,
      },
    );

    expect(
      retailAttendanceService.exportAttendanceDetailCsv,
    ).toHaveBeenCalledWith(
      11,
      {
        branchId: 3,
        limit: 10,
        windowHours: 168,
      },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_hr_attendance_staff_11_3_\d+\.csv"$/,
      ),
    );
  });

  it('delegates HR attendance exception queries to the retail attendance service', async () => {
    await controller.hrAttendanceExceptions(
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
      {
        branchId: 3,
        limit: 10,
        queueType: 'ABSENT' as any,
        priority: 'CRITICAL' as any,
        windowHours: 24,
      },
    );

    expect(
      retailAttendanceService.getAttendanceExceptions,
    ).toHaveBeenCalledWith(
      {
        branchId: 3,
        limit: 10,
        queueType: 'ABSENT',
        priority: 'CRITICAL',
        windowHours: 24,
      },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('streams HR attendance exception exports from the retail attendance service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.hrAttendanceExceptionsExport(
      res,
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
      {
        branchId: 3,
        limit: 10,
        queueType: 'ABSENT' as any,
        priority: 'CRITICAL' as any,
        windowHours: 24,
      },
    );

    expect(
      retailAttendanceService.exportAttendanceExceptionsCsv,
    ).toHaveBeenCalledWith(
      {
        branchId: 3,
        limit: 10,
        queueType: 'ABSENT',
        priority: 'CRITICAL',
        windowHours: 24,
      },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_hr_attendance_exceptions_3_\d+\.csv"$/,
      ),
    );
  });

  it('delegates HR attendance network summary queries to the retail attendance service', async () => {
    await controller.hrAttendanceNetworkSummary(
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
      {
        branchId: 3,
        limit: 10,
        risk: 'CRITICAL' as any,
        windowHours: 24,
      },
    );

    expect(
      retailAttendanceService.getAttendanceNetworkSummary,
    ).toHaveBeenCalledWith(
      {
        branchId: 3,
        limit: 10,
        risk: 'CRITICAL',
        windowHours: 24,
      },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('streams HR attendance network summary exports from the retail attendance service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.hrAttendanceNetworkSummaryExport(res, {
      branchId: 3,
      limit: 10,
      risk: 'CRITICAL' as any,
      windowHours: 24,
    });

    expect(
      retailAttendanceService.exportAttendanceNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 10,
      risk: 'CRITICAL',
      windowHours: 24,
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_hr_attendance_network_\d+\.csv"$/,
      ),
    );
  });

  it('streams HR attendance compliance exports from the retail attendance service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.hrAttendanceComplianceExport(res, {
      branchId: 3,
      windowHours: 168,
      branchIds: [3, 4],
      userIds: [11, 18],
      statuses: ['ABSENT', 'LATE'] as any,
      queueTypes: ['ABSENT'] as any,
      priorities: ['CRITICAL'] as any,
    });

    expect(
      retailAttendanceService.exportAttendanceComplianceCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      windowHours: 168,
      branchIds: [3, 4],
      userIds: [11, 18],
      statuses: ['ABSENT', 'LATE'],
      queueTypes: ['ABSENT'],
      priorities: ['CRITICAL'],
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_hr_attendance_compliance_\d+\.csv"$/,
      ),
    );
  });

  it('delegates HR attendance compliance summaries to the retail attendance service', async () => {
    await controller.hrAttendanceComplianceSummary(
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
      {
        branchId: 3,
        windowHours: 168,
        branchIds: [3, 4],
        userIds: [11, 18],
        statuses: ['ABSENT', 'LATE'] as any,
        queueTypes: ['ABSENT'] as any,
        priorities: ['CRITICAL'] as any,
      },
    );

    expect(
      retailAttendanceService.getAttendanceComplianceSummary,
    ).toHaveBeenCalledWith(
      {
        branchId: 3,
        windowHours: 168,
        branchIds: [3, 4],
        userIds: [11, 18],
        statuses: ['ABSENT', 'LATE'],
        queueTypes: ['ABSENT'],
        priorities: ['CRITICAL'],
      },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('delegates HR attendance check-in to the retail attendance service', async () => {
    await controller.hrAttendanceCheckIn(
      { branchId: 3, source: 'MOBILE_APP', note: 'Start shift' },
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
    );

    expect(retailAttendanceService.checkIn).toHaveBeenCalledWith(
      { branchId: 3, source: 'MOBILE_APP', note: 'Start shift' },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('delegates HR attendance check-out to the retail attendance service', async () => {
    await controller.hrAttendanceCheckOut(
      { branchId: 3, note: 'End shift' },
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
    );

    expect(retailAttendanceService.checkOut).toHaveBeenCalledWith(
      { branchId: 3, note: 'End shift' },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('delegates HR attendance override check-in to the retail attendance service', async () => {
    await controller.hrAttendanceOverrideCheckIn(
      {
        branchId: 3,
        targetUserId: 12,
        checkInAt: '2026-03-19T08:00:00.000Z',
        note: 'Backfill',
      },
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
    );

    expect(retailAttendanceService.overrideCheckIn).toHaveBeenCalledWith(
      {
        branchId: 3,
        targetUserId: 12,
        checkInAt: '2026-03-19T08:00:00.000Z',
        note: 'Backfill',
      },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('delegates HR attendance override check-out to the retail attendance service', async () => {
    await controller.hrAttendanceOverrideCheckOut(
      {
        branchId: 3,
        targetUserId: 12,
        checkOutAt: '2026-03-19T17:00:00.000Z',
        note: 'Forced close',
      },
      {
        user: {
          id: 18,
          email: 'buyer@suuq.test',
          roles: ['B2B_BUYER'],
        },
      },
    );

    expect(retailAttendanceService.overrideCheckOut).toHaveBeenCalledWith(
      {
        branchId: 3,
        targetUserId: 12,
        checkOutAt: '2026-03-19T17:00:00.000Z',
        note: 'Forced close',
      },
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('delegates network command center queries to the retail ops service', async () => {
    await controller.networkCommandCenter({
      branchId: 3,
      branchLimit: 2,
      module: 'INVENTORY_CORE' as any,
      status: 'CRITICAL' as any,
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL' as any,
    });

    expect(
      retailOpsService.getNetworkCommandCenterSummary,
    ).toHaveBeenCalledWith({
      branchId: 3,
      branchLimit: 2,
      module: 'INVENTORY_CORE',
      status: 'CRITICAL',
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL',
    });
  });

  it('delegates network command center report snapshot requests to the retail ops service', async () => {
    await controller.networkCommandCenterReportSnapshot({
      branchId: 3,
      branchLimit: 2,
      module: 'INVENTORY_CORE' as any,
      status: 'CRITICAL' as any,
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL' as any,
    });

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

  it('delegates latest network command center snapshot requests to the retail ops service', async () => {
    await controller.latestNetworkCommandCenterReportSnapshot({
      branchId: 3,
      branchLimit: 2,
      module: 'INVENTORY_CORE' as any,
      status: 'CRITICAL' as any,
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL' as any,
    });

    expect(
      retailOpsService.getLatestNetworkCommandCenterReportSnapshot,
    ).toHaveBeenCalledWith({
      branchId: 3,
      branchLimit: 2,
      module: 'INVENTORY_CORE',
      status: 'CRITICAL',
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL',
    });
  });

  it('streams network command center exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.networkCommandCenterExport(res, {
      branchId: 3,
      branchLimit: 2,
      module: 'INVENTORY_CORE' as any,
      status: 'CRITICAL' as any,
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL' as any,
    });

    expect(
      retailOpsService.exportNetworkCommandCenterSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      branchLimit: 2,
      module: 'INVENTORY_CORE',
      status: 'CRITICAL',
      hasAlertsOnly: true,
      alertSeverity: 'CRITICAL',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_network_command_center_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'module,status\nINVENTORY_CORE,CRITICAL',
    );
  });

  it('delegates stock-health queries to the retail ops service', async () => {
    await controller.stockHealth({ branchId: 3, page: 1, limit: 20 });

    expect(retailOpsService.getStockHealth).toHaveBeenCalledWith({
      branchId: 3,
      page: 1,
      limit: 20,
    });
  });

  it('streams stock-health exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.stockHealthExport(res, {
      branchId: 3,
      page: 1,
      limit: 20,
    });

    expect(retailOpsService.exportStockHealthCsv).toHaveBeenCalledWith({
      branchId: 3,
      page: 1,
      limit: 20,
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_stock_health_3_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith('branchId,inventoryId\n3,11');
  });

  it('delegates POS operations queries to the retail ops service', async () => {
    await controller.posOperations({
      branchId: 3,
      windowHours: 24,
      topItemsLimit: 5,
    });

    expect(retailOpsService.getPosOperations).toHaveBeenCalledWith({
      branchId: 3,
      windowHours: 24,
      topItemsLimit: 5,
    });
  });

  it('streams POS operations exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.posOperationsExport(res, {
      branchId: 3,
      windowHours: 24,
      topItemsLimit: 5,
    });

    expect(retailOpsService.exportPosOperationsCsv).toHaveBeenCalledWith({
      branchId: 3,
      windowHours: 24,
      topItemsLimit: 5,
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_pos_operations_3_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith('branchId,orderCount\n3,12');
  });

  it('delegates POS network summary queries to the retail ops service', async () => {
    await controller.posNetworkSummary({
      branchId: 3,
      limit: 5,
      windowHours: 48,
      status: 'CRITICAL' as any,
    });

    expect(retailOpsService.getPosNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 48,
      status: 'CRITICAL',
    });
  });

  it('streams POS network summary exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.posNetworkSummaryExport(res, {
      branchId: 3,
      limit: 5,
      windowHours: 48,
      status: 'CRITICAL' as any,
    });

    expect(retailOpsService.exportPosNetworkSummaryCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 48,
      status: 'CRITICAL',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_pos_operations_network_summary_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith('branchId,branchName\n3,"HQ"');
  });

  it('delegates POS exception queue queries to the retail ops service', async () => {
    await controller.posExceptions({
      branchId: 3,
      limit: 25,
      windowHours: 24,
      queueType: 'FAILED_PAYMENT' as any,
      priority: 'CRITICAL' as any,
    });

    expect(retailOpsService.getPosExceptions).toHaveBeenCalledWith({
      branchId: 3,
      limit: 25,
      windowHours: 24,
      queueType: 'FAILED_PAYMENT',
      priority: 'CRITICAL',
    });
  });

  it('streams POS exception queue exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.posExceptionsExport(res, {
      branchId: 3,
      limit: 25,
      windowHours: 24,
      queueType: 'FAILED_PAYMENT' as any,
      priority: 'CRITICAL' as any,
    });

    expect(retailOpsService.exportPosExceptionsCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 25,
      windowHours: 24,
      queueType: 'FAILED_PAYMENT',
      priority: 'CRITICAL',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_pos_exceptions_3_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'branchId,orderId,queueType\n3,18,FAILED_PAYMENT',
    );
  });

  it('delegates POS exception network summary queries to the retail ops service', async () => {
    await controller.posExceptionNetworkSummary({
      branchId: 3,
      limit: 5,
      windowHours: 24,
      queueType: 'FAILED_PAYMENT' as any,
      priority: 'CRITICAL' as any,
    });

    expect(retailOpsService.getPosExceptionNetworkSummary).toHaveBeenCalledWith(
      {
        branchId: 3,
        limit: 5,
        windowHours: 24,
        queueType: 'FAILED_PAYMENT',
        priority: 'CRITICAL',
      },
    );
  });

  it('streams POS exception network summary exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.posExceptionNetworkSummaryExport(res, {
      branchId: 3,
      limit: 5,
      windowHours: 24,
      queueType: 'FAILED_PAYMENT' as any,
      priority: 'CRITICAL' as any,
    });

    expect(
      retailOpsService.exportPosExceptionNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 24,
      queueType: 'FAILED_PAYMENT',
      priority: 'CRITICAL',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_pos_exception_network_summary_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'branchId,branchName,exceptionCount\n3,"HQ",2',
    );
  });

  it('delegates POS order detail queries to the retail ops service', async () => {
    await controller.posOrderDetail(12, { branchId: 3 });

    expect(retailOpsService.getPosOrderDetail).toHaveBeenCalledWith(12, {
      branchId: 3,
    });
  });

  it('delegates stock-health network summary queries to the retail ops service', async () => {
    await controller.stockHealthNetworkSummary({
      branchId: 3,
      limit: 5,
      stockStatus: 'OUT_OF_STOCK' as any,
    });

    expect(retailOpsService.getStockHealthNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      stockStatus: 'OUT_OF_STOCK',
    });
  });

  it('streams stock-health network summary exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.stockHealthNetworkSummaryExport(res, {
      branchId: 3,
      limit: 5,
      stockStatus: 'OUT_OF_STOCK' as any,
    });

    expect(
      retailOpsService.exportStockHealthNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      stockStatus: 'OUT_OF_STOCK',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_stock_health_network_summary_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith('branchId,branchName\n3,"HQ"');
  });

  it('delegates replenishment-draft queries to the retail ops service', async () => {
    await controller.replenishmentDrafts({
      branchId: 3,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT' as any,
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      page: 1,
      limit: 20,
    });

    expect(retailOpsService.listReplenishmentDrafts).toHaveBeenCalledWith({
      branchId: 3,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      page: 1,
      limit: 20,
    });
  });

  it('delegates replenishment network summary queries to the retail ops service', async () => {
    await controller.replenishmentNetworkSummary({
      branchId: 3,
      supplierProfileId: 14,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT' as any,
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      limit: 5,
    });

    expect(
      retailOpsService.getReplenishmentNetworkSummary,
    ).toHaveBeenCalledWith({
      branchId: 3,
      supplierProfileId: 14,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      limit: 5,
    });
  });

  it('streams replenishment network summary exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.replenishmentNetworkSummaryExport(res, {
      branchId: 3,
      supplierProfileId: 14,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT' as any,
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      limit: 5,
    });

    expect(
      retailOpsService.exportReplenishmentNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      supplierProfileId: 14,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      limit: 5,
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_replenishment_network_summary_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith('branchId,branchName\n3,"HQ"');
  });

  it('delegates AI insight queries to the retail ops service', async () => {
    await controller.aiInsights({ branchId: 3, limit: 10 });

    expect(retailOpsService.getAiInsights).toHaveBeenCalledWith({
      branchId: 3,
      limit: 10,
    });
  });

  it('streams AI insight exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.aiInsightsExport(res, { branchId: 3, limit: 10 });

    expect(retailOpsService.exportAiInsightsCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 10,
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_ai_insights_3_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'branchId,generatedAt,healthScore\n3,"2026-03-18T10:00:00.000Z",71',
    );
  });

  it('delegates AI network summary queries to the retail ops service', async () => {
    await controller.aiNetworkSummary({
      branchId: 3,
      limit: 5,
      severity: 'CRITICAL' as any,
    });

    expect(retailOpsService.getAiNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      severity: 'CRITICAL',
    });
  });

  it('streams AI network summary exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.aiNetworkSummaryExport(res, {
      branchId: 3,
      limit: 5,
      severity: 'CRITICAL' as any,
    });

    expect(retailOpsService.exportAiNetworkSummaryCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      severity: 'CRITICAL',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_ai_network_summary_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith('branchId,branchName\n3,"HQ"');
  });

  it('delegates accounting overview queries to the retail ops service', async () => {
    await controller.accountingOverview({
      branchId: 3,
      limit: 20,
      accountingState: 'DISCREPANCY_REVIEW' as any,
      supplierProfileId: 14,
      slaBreachedOnly: true,
      priority: 'CRITICAL' as any,
    });

    expect(retailOpsService.getAccountingOverview).toHaveBeenCalledWith({
      branchId: 3,
      limit: 20,
      accountingState: 'DISCREPANCY_REVIEW',
      supplierProfileId: 14,
      slaBreachedOnly: true,
      priority: 'CRITICAL',
    });
  });

  it('streams accounting overview exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.accountingOverviewExport(res, {
      branchId: 3,
      limit: 20,
      accountingState: 'DISCREPANCY_REVIEW' as any,
      supplierProfileId: 14,
      slaBreachedOnly: true,
      priority: 'CRITICAL' as any,
    });

    expect(retailOpsService.exportAccountingOverviewCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 20,
      accountingState: 'DISCREPANCY_REVIEW',
      supplierProfileId: 14,
      slaBreachedOnly: true,
      priority: 'CRITICAL',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_accounting_overview_3_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith('branchId,purchaseOrderId\n3,82');
  });

  it('delegates accounting network summary queries to the retail ops service', async () => {
    await controller.accountingNetworkSummary({
      branchId: 3,
      limit: 5,
      priority: 'CRITICAL' as any,
      accountingState: 'DISCREPANCY_REVIEW' as any,
    });

    expect(retailOpsService.getAccountingNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      priority: 'CRITICAL',
      accountingState: 'DISCREPANCY_REVIEW',
    });
  });

  it('streams accounting network summary exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.accountingNetworkSummaryExport(res, {
      branchId: 3,
      limit: 5,
      priority: 'CRITICAL' as any,
      accountingState: 'DISCREPANCY_REVIEW' as any,
    });

    expect(
      retailOpsService.exportAccountingNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      priority: 'CRITICAL',
      accountingState: 'DISCREPANCY_REVIEW',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_accounting_network_summary_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith('branchId,branchName\n3,"HQ"');
  });

  it('delegates accounting payout exception queries to the retail ops service', async () => {
    await controller.accountingPayoutExceptions({
      branchId: 3,
      limit: 25,
      windowHours: 168,
      exceptionType: 'AUTO_RETRY_REQUIRED' as any,
      priority: 'CRITICAL' as any,
    });

    expect(retailOpsService.getAccountingPayoutExceptions).toHaveBeenCalledWith(
      {
        branchId: 3,
        limit: 25,
        windowHours: 168,
        exceptionType: 'AUTO_RETRY_REQUIRED',
        priority: 'CRITICAL',
      },
    );
  });

  it('streams accounting payout exception exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.accountingPayoutExceptionsExport(res, {
      branchId: 3,
      limit: 25,
      windowHours: 168,
      exceptionType: 'AUTO_RETRY_REQUIRED' as any,
      priority: 'CRITICAL' as any,
    });

    expect(
      retailOpsService.exportAccountingPayoutExceptionsCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 25,
      windowHours: 168,
      exceptionType: 'AUTO_RETRY_REQUIRED',
      priority: 'CRITICAL',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_accounting_payout_exceptions_3_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'branchId,payoutLogId,exceptionType\n3,901,AUTO_RETRY_REQUIRED',
    );
  });

  it('delegates accounting payout network summary queries to the retail ops service', async () => {
    await controller.accountingPayoutNetworkSummary({
      branchId: 3,
      limit: 5,
      windowHours: 168,
      exceptionType: 'AUTO_RETRY_REQUIRED' as any,
      priority: 'CRITICAL' as any,
    });

    expect(
      retailOpsService.getAccountingPayoutNetworkSummary,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 168,
      exceptionType: 'AUTO_RETRY_REQUIRED',
      priority: 'CRITICAL',
    });
  });

  it('streams accounting payout network summary exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.accountingPayoutNetworkSummaryExport(res, {
      branchId: 3,
      limit: 5,
      windowHours: 168,
      exceptionType: 'AUTO_RETRY_REQUIRED' as any,
      priority: 'CRITICAL' as any,
    });

    expect(
      retailOpsService.exportAccountingPayoutNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 168,
      exceptionType: 'AUTO_RETRY_REQUIRED',
      priority: 'CRITICAL',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_accounting_payout_network_summary_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'branchId,branchName,exceptionCount\n3,"HQ",2',
    );
  });

  it('delegates desktop workbench queries to the retail ops service', async () => {
    await controller.desktopWorkbench({
      branchId: 3,
      limit: 10,
      windowHours: 72,
      queueType: 'SYNC_QUEUE' as any,
      priority: 'CRITICAL' as any,
    });

    expect(retailOpsService.getDesktopWorkbench).toHaveBeenCalledWith({
      branchId: 3,
      limit: 10,
      windowHours: 72,
      queueType: 'SYNC_QUEUE',
      priority: 'CRITICAL',
    });
  });

  it('streams desktop workbench exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.desktopWorkbenchExport(res, {
      branchId: 3,
      limit: 10,
      windowHours: 72,
      queueType: 'SYNC_QUEUE' as any,
      priority: 'CRITICAL' as any,
    });

    expect(retailOpsService.exportDesktopWorkbenchCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 10,
      windowHours: 72,
      queueType: 'SYNC_QUEUE',
      priority: 'CRITICAL',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_desktop_workbench_3_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'branchId,queueType,recordId\n3,SYNC_QUEUE,401',
    );
  });

  it('delegates desktop network summary queries to the retail ops service', async () => {
    await controller.desktopNetworkSummary({
      branchId: 3,
      limit: 5,
      windowHours: 72,
      queueType: 'STOCK_EXCEPTIONS' as any,
      priority: 'HIGH' as any,
    });

    expect(retailOpsService.getDesktopNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 72,
      queueType: 'STOCK_EXCEPTIONS',
      priority: 'HIGH',
    });
  });

  it('streams desktop network summary exports from the retail ops service', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.desktopNetworkSummaryExport(res, {
      branchId: 3,
      limit: 5,
      windowHours: 72,
      queueType: 'STOCK_EXCEPTIONS' as any,
      priority: 'HIGH' as any,
    });

    expect(
      retailOpsService.exportDesktopNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 72,
      queueType: 'STOCK_EXCEPTIONS',
      priority: 'HIGH',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="retail_desktop_network_summary_\d+\.csv"$/,
      ),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith('branchId,branchName\n3,"HQ"');
  });

  it('delegates desktop sync failed-entry queries to the retail ops service', async () => {
    await controller.desktopSyncJobFailedEntries(401, {
      branchId: 3,
      limit: 25,
      priority: 'CRITICAL' as any,
      movementType: 'TRANSFER',
      transferOnly: true,
    });

    expect(
      retailOpsService.getDesktopSyncJobFailedEntries,
    ).toHaveBeenCalledWith(401, {
      branchId: 3,
      limit: 25,
      priority: 'CRITICAL',
      movementType: 'TRANSFER',
      transferOnly: true,
    });
  });

  it('delegates desktop transfer detail queries to the retail ops service', async () => {
    await controller.desktopTransferDetail(
      301,
      { branchId: 3, includeItems: true },
      { user: { id: 18, roles: ['B2B_BUYER'] } },
    );

    expect(retailOpsService.getDesktopTransferDetail).toHaveBeenCalledWith(
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
  });

  it('delegates desktop stock exception detail queries to the retail ops service', async () => {
    await controller.desktopStockExceptionDetail(201, { branchId: 3 });

    expect(
      retailOpsService.getDesktopStockExceptionDetail,
    ).toHaveBeenCalledWith(201, {
      branchId: 3,
    });
  });

  it('delegates retail draft re-evaluation to the retail ops service', async () => {
    await controller.reevaluateReplenishmentDraft(42, 3, {
      user: {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    });

    expect(retailOpsService.reevaluateReplenishmentDraft).toHaveBeenCalledWith(
      3,
      42,
      {
        id: 18,
        email: 'buyer@suuq.test',
        roles: ['B2B_BUYER'],
      },
    );
  });
});
