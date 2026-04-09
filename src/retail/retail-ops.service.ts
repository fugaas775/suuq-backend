import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { UserRole } from '../auth/roles.enum';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import {
  PurchaseOrderReceiptDiscrepancyStatus,
  PurchaseOrderReceiptEvent,
} from '../purchase-orders/entities/purchase-order-receipt-event.entity';
import {
  PurchaseOrderReevaluationOutcome,
  PurchaseOrdersService,
} from '../purchase-orders/purchase-orders.service';
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
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import {
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../orders/entities/order.entity';
import {
  PosSyncJob,
  PosSyncStatus,
} from '../pos-sync/entities/pos-sync-job.entity';
import { RedisService } from '../redis/redis.service';
import {
  PayoutLog,
  PayoutProvider,
  PayoutStatus,
} from '../wallet/entities/payout-log.entity';
import { RetailEntitlementsService } from './retail-entitlements.service';
import { RetailAttendanceService } from './retail-attendance.service';
import { RetailModule as RetailOsModule } from './entities/tenant-module-entitlement.entity';
import {
  PurchaseOrderAutoReplenishmentStatusResponseDto,
  PurchaseOrderResponseDto,
} from '../admin/dto/purchase-order-response.dto';
import {
  RetailCommandCenterAlertSeverityFilter,
  RetailCommandCenterStatusFilter,
  RetailCommandCenterSummaryQueryDto,
} from './dto/retail-command-center-summary-query.dto';
import {
  RetailCommandCenterModuleSummaryResponseDto,
  RetailCommandCenterModuleTrendResponseDto,
  RetailCommandCenterReportSnapshotFilterResponseDto,
  RetailCommandCenterReportSnapshotResponseDto,
  RetailCommandCenterSummaryActionResponseDto,
  RetailCommandCenterSummaryAlertResponseDto,
  RetailCommandCenterSummaryMetricResponseDto,
  RetailCommandCenterSummaryResponseDto,
} from './dto/retail-command-center-summary-response.dto';
import { RetailPosOperationsQueryDto } from './dto/retail-pos-operations-query.dto';
import {
  RetailPosOperationsAlertResponseDto,
  RetailPosOperationsPaymentMixResponseDto,
  RetailPosOperationsResponseDto,
  RetailPosOperationsActionResponseDto,
  RetailPosOperationsStatusMixResponseDto,
  RetailPosOperationsSummaryResponseDto,
  RetailPosOperationsTopItemResponseDto,
} from './dto/retail-pos-operations-response.dto';
import {
  RetailPosExceptionPriorityFilter,
  RetailPosExceptionQueueFilter,
  RetailPosExceptionsQueryDto,
} from './dto/retail-pos-exceptions-query.dto';
import { RetailPosExceptionNetworkSummaryQueryDto } from './dto/retail-pos-exception-network-summary-query.dto';
import {
  RetailPosExceptionNetworkBranchResponseDto,
  RetailPosExceptionNetworkSummaryResponseDto,
} from './dto/retail-pos-exception-network-summary-response.dto';
import {
  RetailPosExceptionItemResponseDto,
  RetailPosExceptionsResponseDto,
} from './dto/retail-pos-exceptions-response.dto';
import {
  RetailPosNetworkStatusFilter,
  RetailPosNetworkSummaryQueryDto,
} from './dto/retail-pos-network-summary-query.dto';
import {
  RetailPosNetworkSummaryBranchResponseDto,
  RetailPosNetworkSummaryResponseDto,
} from './dto/retail-pos-network-summary-response.dto';
import { RetailPosOrderDetailQueryDto } from './dto/retail-pos-order-detail-query.dto';
import {
  RetailPosOrderDetailItemResponseDto,
  RetailPosOrderDetailResponseDto,
} from './dto/retail-pos-order-detail-response.dto';
import { RetailReplenishmentReviewQueryDto } from './dto/retail-replenishment-review-query.dto';
import { RetailReplenishmentNetworkSummaryQueryDto } from './dto/retail-replenishment-network-summary-query.dto';
import {
  RetailReplenishmentNetworkAlertResponseDto,
  RetailReplenishmentNetworkBranchResponseDto,
  RetailReplenishmentNetworkSummaryResponseDto,
} from './dto/retail-replenishment-network-summary-response.dto';
import {
  RetailReplenishmentActionResponseDto,
  RetailReplenishmentPurchaseOrderResponseDto,
  RetailReplenishmentReevaluationResponseDto,
  RetailReplenishmentBlockedReasonCountResponseDto,
  RetailReplenishmentReviewResponseDto,
  RetailReplenishmentReviewSummaryResponseDto,
} from './dto/retail-replenishment-review-response.dto';
import { RetailAiInsightsQueryDto } from './dto/retail-ai-insights-query.dto';
import {
  RetailAiInsightCardResponseDto,
  RetailAiInsightsResponseDto,
  RetailAiInsightSummaryResponseDto,
  RetailAiProductRiskResponseDto,
} from './dto/retail-ai-insights-response.dto';
import {
  RetailAccountingOverviewQueryDto,
  RetailAccountingPriorityFilter,
} from './dto/retail-accounting-overview-query.dto';
import { RetailAccountingNetworkSummaryQueryDto } from './dto/retail-accounting-network-summary-query.dto';
import {
  RetailAiNetworkSeverityFilter,
  RetailAiNetworkSummaryQueryDto,
} from './dto/retail-ai-network-summary-query.dto';
import {
  RetailAiNetworkAlertResponseDto,
  RetailAiNetworkBranchResponseDto,
  RetailAiNetworkSummaryResponseDto,
} from './dto/retail-ai-network-summary-response.dto';
import {
  RetailAccountingNetworkBranchResponseDto,
  RetailAccountingNetworkSummaryResponseDto,
} from './dto/retail-accounting-network-summary-response.dto';
import {
  RetailAccountingActionResponseDto,
  RetailAccountingAlertResponseDto,
  RetailAccountingOverviewItemResponseDto,
  RetailAccountingOverviewResponseDto,
} from './dto/retail-accounting-overview-response.dto';
import {
  RetailAccountingPayoutExceptionTypeFilter,
  RetailAccountingPayoutExceptionsQueryDto,
  RetailAccountingPayoutPriorityFilter,
} from './dto/retail-accounting-payout-exceptions-query.dto';
import {
  RetailAccountingPayoutExceptionItemResponseDto,
  RetailAccountingPayoutExceptionsResponseDto,
} from './dto/retail-accounting-payout-exceptions-response.dto';
import { RetailAccountingPayoutNetworkSummaryQueryDto } from './dto/retail-accounting-payout-network-summary-query.dto';
import {
  RetailAccountingPayoutNetworkBranchResponseDto,
  RetailAccountingPayoutNetworkSummaryResponseDto,
} from './dto/retail-accounting-payout-network-summary-response.dto';
import { RetailAccountingStateFilter } from './dto/retail-accounting-overview-query.dto';
import { RetailDesktopWorkbenchQueryDto } from './dto/retail-desktop-workbench-query.dto';
import { RetailDesktopNetworkSummaryQueryDto } from './dto/retail-desktop-network-summary-query.dto';
import {
  RetailDesktopNetworkSummaryBranchResponseDto,
  RetailDesktopNetworkSummaryResponseDto,
} from './dto/retail-desktop-network-summary-response.dto';
import {
  RetailDesktopWorkbenchActionResponseDto,
  RetailDesktopWorkbenchAlertResponseDto,
  RetailDesktopWorkbenchResponseDto,
  RetailDesktopWorkbenchStockExceptionResponseDto,
  RetailDesktopWorkbenchSyncJobResponseDto,
  RetailDesktopWorkbenchTransferResponseDto,
} from './dto/retail-desktop-workbench-response.dto';
import {
  RetailDesktopWorkbenchPriorityFilter,
  RetailDesktopWorkbenchQueueFilter,
} from './dto/retail-desktop-workbench-query.dto';
import {
  RetailDesktopSyncFailedEntryPriorityFilter,
  RetailDesktopSyncFailedEntriesQueryDto,
} from './dto/retail-desktop-sync-failed-entries-query.dto';
import {
  RetailDesktopSyncFailedEntriesResponseDto,
  RetailDesktopSyncFailedEntryResponseDto,
} from './dto/retail-desktop-sync-failed-entries-response.dto';
import { RetailDesktopTransferDetailQueryDto } from './dto/retail-desktop-transfer-detail-query.dto';
import { RetailDesktopTransferDetailResponseDto } from './dto/retail-desktop-transfer-detail-response.dto';
import { RetailDesktopStockExceptionDetailQueryDto } from './dto/retail-desktop-stock-exception-detail-query.dto';
import { RetailDesktopStockExceptionDetailResponseDto } from './dto/retail-desktop-stock-exception-detail-response.dto';
import {
  RetailStockHealthNetworkStatusFilter,
  RetailStockHealthNetworkSummaryQueryDto,
} from './dto/retail-stock-health-network-summary-query.dto';
import {
  RetailStockHealthNetworkAlertResponseDto,
  RetailStockHealthNetworkBranchResponseDto,
  RetailStockHealthNetworkSummaryResponseDto,
} from './dto/retail-stock-health-network-summary-response.dto';
import { RetailStockHealthQueryDto } from './dto/retail-stock-health-query.dto';
import {
  RetailStockHealthItemResponseDto,
  RetailStockHealthResponseDto,
  RetailStockHealthSummaryResponseDto,
} from './dto/retail-stock-health-response.dto';
import {
  RetailHrAttendanceNetworkAlertResponseDto,
  RetailHrAttendanceNetworkSummaryResponseDto,
} from './dto/retail-hr-attendance-network-summary-response.dto';

@Injectable()
export class RetailOpsService {
  private readonly commandCenterSnapshotTtlSeconds = 60 * 60 * 24 * 30;

  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly branchStaffAssignmentsRepository: Repository<BranchStaffAssignment>,
    @InjectRepository(BranchInventory)
    private readonly branchInventoryRepository: Repository<BranchInventory>,
    @InjectRepository(BranchTransfer)
    private readonly branchTransfersRepository: Repository<BranchTransfer>,
    @InjectRepository(StockMovement)
    private readonly stockMovementsRepository: Repository<StockMovement>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderReceiptEvent)
    private readonly purchaseOrderReceiptEventsRepository: Repository<PurchaseOrderReceiptEvent>,
    @InjectRepository(PosSyncJob)
    private readonly posSyncJobsRepository: Repository<PosSyncJob>,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(PayoutLog)
    private readonly payoutLogRepository: Repository<PayoutLog>,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly retailEntitlementsService: RetailEntitlementsService,
    private readonly retailAttendanceService: RetailAttendanceService,
    private readonly redisService: RedisService,
  ) {}

  async getNetworkCommandCenterSummary(
    query: RetailCommandCenterSummaryQueryDto,
  ): Promise<RetailCommandCenterSummaryResponseDto> {
    const access =
      await this.retailEntitlementsService.getActiveBranchRetailAccess(
        query.branchId,
      );
    const branchLimit = Math.min(Math.max(query.branchLimit ?? 3, 1), 10);
    const enabledModules = new Set(
      access.entitlements.map((entry) => entry.module),
    );
    const shouldLoadModule = (module: RetailOsModule) =>
      enabledModules.has(module) && (!query.module || query.module === module);

    const [
      pos,
      stockHealth,
      replenishment,
      ai,
      accounting,
      desktop,
      attendance,
    ] = await Promise.all([
      shouldLoadModule(RetailOsModule.POS_CORE)
        ? this.getPosNetworkSummary({
            branchId: query.branchId,
            limit: branchLimit,
            windowHours: 24,
          })
        : Promise.resolve(null),
      shouldLoadModule(RetailOsModule.INVENTORY_CORE)
        ? this.getStockHealthNetworkSummary({
            branchId: query.branchId,
            limit: branchLimit,
          })
        : Promise.resolve(null),
      shouldLoadModule(RetailOsModule.INVENTORY_AUTOMATION)
        ? this.getReplenishmentNetworkSummary({
            branchId: query.branchId,
            limit: branchLimit,
          })
        : Promise.resolve(null),
      shouldLoadModule(RetailOsModule.AI_ANALYTICS)
        ? this.getAiNetworkSummary({
            branchId: query.branchId,
            limit: branchLimit,
          })
        : Promise.resolve(null),
      shouldLoadModule(RetailOsModule.ACCOUNTING)
        ? this.getAccountingNetworkSummary({
            branchId: query.branchId,
            limit: branchLimit,
          })
        : Promise.resolve(null),
      shouldLoadModule(RetailOsModule.DESKTOP_BACKOFFICE)
        ? this.getDesktopNetworkSummary({
            branchId: query.branchId,
            limit: branchLimit,
            windowHours: 72,
          })
        : Promise.resolve(null),
      shouldLoadModule(RetailOsModule.HR_ATTENDANCE)
        ? this.retailAttendanceService.getAttendanceNetworkSummary({
            branchId: query.branchId,
            limit: branchLimit,
            windowHours: 24,
          })
        : Promise.resolve(null),
    ]);

    const previousSnapshot =
      await this.getStoredNetworkCommandCenterReportSnapshot(query);

    const modules = [
      pos
        ? {
            module: this.buildPosCommandCenterModule(query.branchId, pos),
            alerts: pos.alerts,
          }
        : null,
      stockHealth
        ? {
            module: this.buildStockHealthCommandCenterModule(
              query.branchId,
              stockHealth,
            ),
            alerts: stockHealth.alerts,
          }
        : null,
      replenishment
        ? {
            module: this.buildReplenishmentCommandCenterModule(
              query.branchId,
              replenishment,
            ),
            alerts: replenishment.alerts,
          }
        : null,
      ai
        ? {
            module: this.buildAiCommandCenterModule(query.branchId, ai),
            alerts: ai.alerts,
          }
        : null,
      accounting
        ? {
            module: this.buildAccountingCommandCenterModule(
              query.branchId,
              accounting,
            ),
            alerts: accounting.alerts,
          }
        : null,
      desktop
        ? {
            module: this.buildDesktopCommandCenterModule(
              query.branchId,
              desktop,
            ),
            alerts: desktop.alerts,
          }
        : null,
      attendance
        ? {
            module: this.buildAttendanceCommandCenterModule(
              query.branchId,
              attendance,
            ),
            alerts: attendance.alerts,
          }
        : null,
    ]
      .filter(
        (
          entry,
        ): entry is {
          module: RetailCommandCenterModuleSummaryResponseDto;
          alerts: Array<{ severity: 'INFO' | 'WATCH' | 'CRITICAL' }>;
        } => entry != null,
      )
      .filter((entry) =>
        this.matchesCommandCenterStatus(entry.module.status, query.status),
      )
      .filter((entry) =>
        this.matchesCommandCenterAlertFilters(entry.alerts, query),
      )
      .map((entry) =>
        this.attachCommandCenterTrend(entry.module, previousSnapshot),
      );

    return {
      anchorBranchId: access.branch.id,
      retailTenantId: access.branch.retailTenantId ?? null,
      branchCount: access.tenant.branches.filter(
        (branch) => branch.isActive !== false,
      ).length,
      enabledModuleCount: modules.length,
      criticalModuleCount: modules.filter(
        (module) => module.status === 'CRITICAL',
      ).length,
      highModuleCount: modules.filter((module) => module.status === 'HIGH')
        .length,
      normalModuleCount: modules.filter((module) => module.status === 'NORMAL')
        .length,
      alerts: modules
        .flatMap((module) => (module.topAlert ? [module.topAlert] : []))
        .sort((left, right) => this.compareCommandCenterAlerts(left, right)),
      modules,
    };
  }

  async captureNetworkCommandCenterReportSnapshot(
    query: RetailCommandCenterSummaryQueryDto,
  ): Promise<RetailCommandCenterReportSnapshotResponseDto> {
    const summary = await this.getNetworkCommandCenterSummary(query);
    const generatedAt = new Date();
    const expiresAt = new Date(
      generatedAt.getTime() + this.commandCenterSnapshotTtlSeconds * 1000,
    );
    const snapshot: RetailCommandCenterReportSnapshotResponseDto = {
      snapshotKey: this.buildCommandCenterSnapshotKey(query),
      generatedAt,
      expiresAt,
      filters: this.buildCommandCenterSnapshotFilters(query),
      summary,
    };

    await this.redisService.set(
      snapshot.snapshotKey,
      JSON.stringify(snapshot),
      this.commandCenterSnapshotTtlSeconds,
    );

    return snapshot;
  }

  async getLatestNetworkCommandCenterReportSnapshot(
    query: RetailCommandCenterSummaryQueryDto,
  ): Promise<RetailCommandCenterReportSnapshotResponseDto> {
    const snapshot =
      await this.getStoredNetworkCommandCenterReportSnapshot(query);
    if (!snapshot) {
      throw new NotFoundException(
        'No saved network command center report snapshot was found for the requested filter set',
      );
    }

    return snapshot;
  }

  async exportNetworkCommandCenterSummaryCsv(
    query: RetailCommandCenterSummaryQueryDto,
  ): Promise<string> {
    const summary = await this.getNetworkCommandCenterSummary(query);
    const header = [
      'anchorBranchId',
      'retailTenantId',
      'enabledModuleCount',
      'module',
      'title',
      'status',
      'statusReason',
      'branchCount',
      'alertCount',
      'topAlertCode',
      'topAlertSeverity',
      'topAlertTitle',
      'topAlertMetric',
      'metricSummary',
      'actionTypes',
      'trendPreviousStatus',
      'trendStatusDelta',
      'trendDirection',
      'trendPreviousAlertCount',
      'trendPreviousHeadlineMetricKey',
      'trendPreviousHeadlineMetricValue',
      'trendHeadlineMetricDelta',
      'previewBranchId',
      'previewBranchName',
      'previewBranchCode',
      'previewStatus',
      'previewStatusReason',
      'previewActionPath',
    ];
    const lines = [header.join(',')];

    for (const module of summary.modules) {
      const metricSummary = module.metrics
        .map((metric) => `${metric.key}:${metric.value}`)
        .join('|');
      const actionTypes = module.actions.map((action) => action.type).join('|');
      const previews =
        module.branchPreviews.length > 0
          ? module.branchPreviews
          : [
              {
                branchId: null,
                branchName: null,
                branchCode: null,
                status: null,
                statusReason: null,
                actionPath: null,
              },
            ];

      for (const preview of previews) {
        lines.push(
          [
            summary.anchorBranchId,
            summary.retailTenantId ?? '',
            summary.enabledModuleCount,
            this.escapeCsvValue(module.module),
            this.escapeCsvValue(module.title),
            this.escapeCsvValue(module.status),
            this.escapeCsvValue(module.statusReason),
            module.branchCount,
            module.alertCount,
            this.escapeCsvValue(module.topAlert?.code ?? ''),
            this.escapeCsvValue(module.topAlert?.severity ?? ''),
            this.escapeCsvValue(module.topAlert?.title ?? ''),
            module.topAlert?.metric ?? '',
            this.escapeCsvValue(metricSummary),
            this.escapeCsvValue(actionTypes),
            this.escapeCsvValue(module.trend.previousStatus ?? ''),
            module.trend.statusDelta ?? '',
            this.escapeCsvValue(module.trend.direction),
            module.trend.previousAlertCount ?? '',
            this.escapeCsvValue(module.trend.previousHeadlineMetricKey ?? ''),
            module.trend.previousHeadlineMetricValue ?? '',
            module.trend.headlineMetricDelta ?? '',
            preview.branchId ?? '',
            this.escapeCsvValue(preview.branchName ?? ''),
            this.escapeCsvValue(preview.branchCode ?? ''),
            this.escapeCsvValue(preview.status ?? ''),
            this.escapeCsvValue(preview.statusReason ?? ''),
            this.escapeCsvValue(preview.actionPath ?? ''),
          ].join(','),
        );
      }
    }

    return lines.join('\n');
  }

  async getPosOperations(
    query: RetailPosOperationsQueryDto,
  ): Promise<RetailPosOperationsResponseDto> {
    await this.assertBranchExists(query.branchId);

    const windowHours = this.normalizePosWindowHours(query.windowHours);
    const topItemsLimit = this.normalizePosTopItemsLimit(query.topItemsLimit);
    const windowStart = this.getPosWindowStart(windowHours);

    const [orders, staffAssignments] = await Promise.all([
      this.ordersRepository.find({
        where: {
          fulfillmentBranchId: query.branchId,
          createdAt: MoreThanOrEqual(windowStart),
        },
        order: { createdAt: 'DESC' },
      }),
      this.branchStaffAssignmentsRepository.find({
        where: {
          branchId: query.branchId,
          isActive: true,
        },
      }),
    ]);

    const summary = this.mapPosOperationsSummary(
      query.branchId,
      windowHours,
      orders,
      staffAssignments,
    );

    return {
      summary,
      alerts: this.buildPosOperationsAlerts(summary),
      paymentMix: this.buildPosPaymentMix(orders),
      statusMix: this.buildPosStatusMix(orders),
      topItems: this.buildPosTopItems(orders, topItemsLimit),
    };
  }

  async exportPosOperationsCsv(
    query: RetailPosOperationsQueryDto,
  ): Promise<string> {
    const posOperations = await this.getPosOperations(query);
    const header = [
      'branchId',
      'windowHours',
      'orderCount',
      'grossSales',
      'paidSales',
      'averageOrderValue',
      'paidOrderCount',
      'unpaidOrderCount',
      'failedPaymentOrderCount',
      'openOrderCount',
      'delayedFulfillmentOrderCount',
      'deliveredOrderCount',
      'cancelledOrderCount',
      'activeStaffCount',
      'managerCount',
      'operatorCount',
      'lastOrderAt',
      'alertCodes',
      'paymentMix',
      'statusMix',
      'topItemProductId',
      'topItemProductName',
      'topItemQuantity',
      'topItemGrossSales',
    ];
    const lines = [header.join(',')];
    const topItems =
      posOperations.topItems.length > 0
        ? posOperations.topItems
        : [{ productId: null, productName: '', quantity: 0, grossSales: 0 }];
    const paymentMix = this.escapeCsvValue(
      posOperations.paymentMix
        .map(
          (item) =>
            `${item.paymentMethod}:${item.orderCount}:${item.grossSales}`,
        )
        .join('|'),
    );
    const statusMix = this.escapeCsvValue(
      posOperations.statusMix
        .map((item) => `${item.status}:${item.orderCount}:${item.grossSales}`)
        .join('|'),
    );
    const alertCodes = this.escapeCsvValue(
      posOperations.alerts.map((alert) => alert.code).join('|'),
    );

    for (const item of topItems) {
      lines.push(
        [
          posOperations.summary.branchId,
          posOperations.summary.windowHours,
          posOperations.summary.orderCount,
          posOperations.summary.grossSales,
          posOperations.summary.paidSales,
          posOperations.summary.averageOrderValue,
          posOperations.summary.paidOrderCount,
          posOperations.summary.unpaidOrderCount,
          posOperations.summary.failedPaymentOrderCount,
          posOperations.summary.openOrderCount,
          posOperations.summary.delayedFulfillmentOrderCount,
          posOperations.summary.deliveredOrderCount,
          posOperations.summary.cancelledOrderCount,
          posOperations.summary.activeStaffCount,
          posOperations.summary.managerCount,
          posOperations.summary.operatorCount,
          this.formatCsvDate(posOperations.summary.lastOrderAt),
          alertCodes,
          paymentMix,
          statusMix,
          item.productId ?? '',
          this.escapeCsvValue(item.productName),
          item.quantity,
          item.grossSales,
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getPosNetworkSummary(
    query: RetailPosNetworkSummaryQueryDto,
  ): Promise<RetailPosNetworkSummaryResponseDto> {
    const anchorBranch = await this.branchesRepository.findOne({
      where: { id: query.branchId },
    });

    if (!anchorBranch) {
      throw new NotFoundException(`Branch with ID ${query.branchId} not found`);
    }

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);
    const windowHours = this.normalizePosWindowHours(query.windowHours);
    const windowStart = this.getPosWindowStart(windowHours);
    const tenantBranches =
      anchorBranch.retailTenantId != null
        ? await this.branchesRepository.find({
            where: {
              retailTenantId: anchorBranch.retailTenantId,
              isActive: true,
            },
            order: { name: 'ASC' },
          })
        : [anchorBranch];
    const branchIds = tenantBranches.map((branch) => branch.id);

    const [orders, staffAssignments] = await Promise.all([
      this.ordersRepository.find({
        where: {
          fulfillmentBranchId: In(branchIds),
          createdAt: MoreThanOrEqual(windowStart),
        },
        order: { createdAt: 'DESC' },
      }),
      this.branchStaffAssignmentsRepository.find({
        where: {
          branchId: In(branchIds),
          isActive: true,
        },
      }),
    ]);

    const matchedBranches = tenantBranches
      .map((branch) => {
        const branchOrders = orders.filter(
          (order) => order.fulfillmentBranchId === branch.id,
        );
        const branchStaffAssignments = staffAssignments.filter(
          (assignment) => assignment.branchId === branch.id,
        );
        const summary = this.mapPosOperationsSummary(
          branch.id,
          windowHours,
          branchOrders,
          branchStaffAssignments,
        );

        return this.mapPosNetworkBranch(branch, summary);
      })
      .filter((branch) =>
        this.matchesPosNetworkStatus(branch.highestPriority, query.status),
      );

    const branches = [...matchedBranches]
      .sort((left, right) => this.comparePosNetworkBranch(left, right))
      .slice(0, limit);

    return {
      anchorBranchId: anchorBranch.id,
      retailTenantId: anchorBranch.retailTenantId ?? null,
      branchCount: tenantBranches.length,
      matchedBranchCount: matchedBranches.length,
      visibleBranchCount: branches.length,
      windowHours,
      totalOrderCount: matchedBranches.reduce(
        (sum, branch) => sum + branch.orderCount,
        0,
      ),
      totalGrossSales: matchedBranches.reduce(
        (sum, branch) => sum + branch.grossSales,
        0,
      ),
      totalPaidSales: matchedBranches.reduce(
        (sum, branch) => sum + branch.paidSales,
        0,
      ),
      totalUnpaidOrderCount: matchedBranches.reduce(
        (sum, branch) => sum + branch.unpaidOrderCount,
        0,
      ),
      totalFailedPaymentOrderCount: matchedBranches.reduce(
        (sum, branch) => sum + branch.failedPaymentOrderCount,
        0,
      ),
      totalDelayedFulfillmentOrderCount: matchedBranches.reduce(
        (sum, branch) => sum + branch.delayedFulfillmentOrderCount,
        0,
      ),
      criticalBranchCount: matchedBranches.filter(
        (branch) => branch.highestPriority === 'CRITICAL',
      ).length,
      highBranchCount: matchedBranches.filter(
        (branch) => branch.highestPriority === 'HIGH',
      ).length,
      normalBranchCount: matchedBranches.filter(
        (branch) => branch.highestPriority === 'NORMAL',
      ).length,
      alerts: this.buildPosNetworkAlerts(matchedBranches),
      branches,
    };
  }

  async exportPosNetworkSummaryCsv(
    query: RetailPosNetworkSummaryQueryDto,
  ): Promise<string> {
    const summary = await this.getPosNetworkSummary(query);
    const header = [
      'branchId',
      'branchName',
      'branchCode',
      'highestPriority',
      'highestPriorityReason',
      'orderCount',
      'grossSales',
      'paidSales',
      'averageOrderValue',
      'unpaidOrderCount',
      'failedPaymentOrderCount',
      'delayedFulfillmentOrderCount',
      'activeStaffCount',
      'lastOrderAt',
    ];
    const lines = [header.join(',')];

    for (const branch of summary.branches) {
      lines.push(
        [
          branch.branchId,
          this.escapeCsvValue(branch.branchName),
          this.escapeCsvValue(branch.branchCode ?? ''),
          this.escapeCsvValue(branch.highestPriority),
          this.escapeCsvValue(branch.highestPriorityReason),
          branch.orderCount,
          branch.grossSales,
          branch.paidSales,
          branch.averageOrderValue,
          branch.unpaidOrderCount,
          branch.failedPaymentOrderCount,
          branch.delayedFulfillmentOrderCount,
          branch.activeStaffCount,
          this.formatCsvDate(branch.lastOrderAt),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getPosExceptions(
    query: RetailPosExceptionsQueryDto,
  ): Promise<RetailPosExceptionsResponseDto> {
    await this.assertBranchExists(query.branchId);

    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const windowHours = this.normalizePosWindowHours(query.windowHours);
    const windowStart = this.getPosWindowStart(windowHours);
    const orders = await this.ordersRepository.find({
      where: {
        fulfillmentBranchId: query.branchId,
        createdAt: MoreThanOrEqual(windowStart),
      },
      order: { createdAt: 'DESC' },
      relations: {
        deliverer: true,
      },
    });

    const allItems = orders
      .map((order) => this.mapPosExceptionItem(order, windowHours))
      .filter(
        (item): item is RetailPosExceptionItemResponseDto => item != null,
      );
    const filteredItems = allItems
      .filter((item) =>
        this.matchesPosExceptionQueue(item.queueType, query.queueType),
      )
      .filter((item) =>
        this.matchesPosExceptionPriority(item.priority, query.priority),
      )
      .sort((left, right) => this.comparePosExceptionItem(left, right));
    const visibleItems = filteredItems.slice(0, limit);

    return {
      summary: {
        branchId: query.branchId,
        windowHours,
        totalExceptionCount: allItems.length,
        filteredExceptionCount: filteredItems.length,
        failedPaymentCount: allItems.filter(
          (item) =>
            item.queueType === RetailPosExceptionQueueFilter.FAILED_PAYMENT,
        ).length,
        paymentReviewCount: allItems.filter(
          (item) =>
            item.queueType === RetailPosExceptionQueueFilter.PAYMENT_REVIEW,
        ).length,
        delayedFulfillmentCount: allItems.filter(
          (item) =>
            item.queueType === RetailPosExceptionQueueFilter.FULFILLMENT_DELAY,
        ).length,
        criticalCount: filteredItems.filter(
          (item) => item.priority === 'CRITICAL',
        ).length,
        highCount: filteredItems.filter((item) => item.priority === 'HIGH')
          .length,
        normalCount: filteredItems.filter((item) => item.priority === 'NORMAL')
          .length,
        lastOrderAt: orders[0]?.createdAt ?? null,
      },
      actions: [
        {
          type: 'VIEW_POS_OPERATIONS',
          method: 'GET',
          path: `/retail/v1/ops/pos-operations?branchId=${query.branchId}&windowHours=${windowHours}`,
          body: null,
          enabled: true,
        },
      ],
      items: visibleItems,
    };
  }

  async exportPosExceptionsCsv(
    query: RetailPosExceptionsQueryDto,
  ): Promise<string> {
    const exceptions = await this.getPosExceptions(query);
    const header = [
      'branchId',
      'windowHours',
      'orderId',
      'queueType',
      'priority',
      'priorityReason',
      'status',
      'paymentMethod',
      'paymentStatus',
      'paymentProofStatus',
      'total',
      'itemCount',
      'ageHours',
      'createdAt',
      'deliveryAssignedAt',
      'outForDeliveryAt',
      'deliveryResolvedAt',
      'customerName',
      'customerPhoneNumber',
      'actionTypes',
    ];
    const lines = [header.join(',')];

    for (const item of exceptions.items) {
      lines.push(
        [
          exceptions.summary.branchId,
          exceptions.summary.windowHours,
          item.orderId,
          this.escapeCsvValue(item.queueType),
          this.escapeCsvValue(item.priority),
          this.escapeCsvValue(item.priorityReason),
          this.escapeCsvValue(item.status),
          this.escapeCsvValue(item.paymentMethod),
          this.escapeCsvValue(item.paymentStatus),
          this.escapeCsvValue(item.paymentProofStatus ?? ''),
          item.total,
          item.itemCount,
          item.ageHours,
          this.formatCsvDate(item.createdAt),
          this.formatCsvDate(item.deliveryAssignedAt),
          this.formatCsvDate(item.outForDeliveryAt),
          this.formatCsvDate(item.deliveryResolvedAt),
          this.escapeCsvValue(item.customerName ?? ''),
          this.escapeCsvValue(item.customerPhoneNumber ?? ''),
          this.escapeCsvValue(
            item.actions.map((action) => action.type).join('|'),
          ),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getPosExceptionNetworkSummary(
    query: RetailPosExceptionNetworkSummaryQueryDto,
  ): Promise<RetailPosExceptionNetworkSummaryResponseDto> {
    const anchorBranch = await this.branchesRepository.findOne({
      where: { id: query.branchId },
    });

    if (!anchorBranch) {
      throw new NotFoundException(`Branch with ID ${query.branchId} not found`);
    }

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);
    const windowHours = this.normalizePosWindowHours(query.windowHours);
    const windowStart = this.getPosWindowStart(windowHours);
    const tenantBranches =
      anchorBranch.retailTenantId != null
        ? await this.branchesRepository.find({
            where: {
              retailTenantId: anchorBranch.retailTenantId,
              isActive: true,
            },
            order: { name: 'ASC' },
          })
        : [anchorBranch];
    const branchIds = tenantBranches.map((branch) => branch.id);
    const orders = await this.ordersRepository.find({
      where: {
        fulfillmentBranchId: In(branchIds),
        createdAt: MoreThanOrEqual(windowStart),
      },
      order: { createdAt: 'DESC' },
      relations: {
        deliverer: true,
      },
    });

    const matchedBranches = tenantBranches
      .map((branch) => {
        const branchOrders = orders.filter(
          (order) => order.fulfillmentBranchId === branch.id,
        );
        const branchItems = branchOrders
          .map((order) => this.mapPosExceptionItem(order, windowHours))
          .filter(
            (item): item is RetailPosExceptionItemResponseDto => item != null,
          )
          .filter((item) =>
            this.matchesPosExceptionQueue(item.queueType, query.queueType),
          );

        return this.mapPosExceptionNetworkBranch(
          branch,
          branchItems,
          windowHours,
        );
      })
      .filter((branch) => branch.exceptionCount > 0)
      .filter((branch) =>
        this.matchesPosExceptionPriority(
          branch.highestPriority,
          query.priority,
        ),
      );

    const branches = [...matchedBranches]
      .sort((left, right) => this.comparePosExceptionNetworkBranch(left, right))
      .slice(0, limit);

    return {
      anchorBranchId: anchorBranch.id,
      retailTenantId: anchorBranch.retailTenantId ?? null,
      branchCount: tenantBranches.length,
      matchedBranchCount: matchedBranches.length,
      visibleBranchCount: branches.length,
      windowHours,
      totalExceptionCount: matchedBranches.reduce(
        (sum, branch) => sum + branch.exceptionCount,
        0,
      ),
      totalFailedPaymentCount: matchedBranches.reduce(
        (sum, branch) => sum + branch.failedPaymentCount,
        0,
      ),
      totalPaymentReviewCount: matchedBranches.reduce(
        (sum, branch) => sum + branch.paymentReviewCount,
        0,
      ),
      totalDelayedFulfillmentCount: matchedBranches.reduce(
        (sum, branch) => sum + branch.delayedFulfillmentCount,
        0,
      ),
      criticalBranchCount: matchedBranches.filter(
        (branch) => branch.highestPriority === 'CRITICAL',
      ).length,
      highBranchCount: matchedBranches.filter(
        (branch) => branch.highestPriority === 'HIGH',
      ).length,
      normalBranchCount: matchedBranches.filter(
        (branch) => branch.highestPriority === 'NORMAL',
      ).length,
      alerts: this.buildPosExceptionNetworkAlerts(matchedBranches),
      branches,
    };
  }

  async exportPosExceptionNetworkSummaryCsv(
    query: RetailPosExceptionNetworkSummaryQueryDto,
  ): Promise<string> {
    const summary = await this.getPosExceptionNetworkSummary(query);
    const header = [
      'branchId',
      'branchName',
      'branchCode',
      'highestPriority',
      'highestPriorityReason',
      'exceptionCount',
      'failedPaymentCount',
      'paymentReviewCount',
      'delayedFulfillmentCount',
      'criticalCount',
      'highCount',
      'normalCount',
      'oldestExceptionAgeHours',
      'lastOrderAt',
    ];
    const lines = [header.join(',')];

    for (const branch of summary.branches) {
      lines.push(
        [
          branch.branchId,
          this.escapeCsvValue(branch.branchName),
          this.escapeCsvValue(branch.branchCode ?? ''),
          this.escapeCsvValue(branch.highestPriority),
          this.escapeCsvValue(branch.highestPriorityReason),
          branch.exceptionCount,
          branch.failedPaymentCount,
          branch.paymentReviewCount,
          branch.delayedFulfillmentCount,
          branch.criticalCount,
          branch.highCount,
          branch.normalCount,
          branch.oldestExceptionAgeHours ?? '',
          this.formatCsvDate(branch.lastOrderAt),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getPosOrderDetail(
    orderId: number,
    query: RetailPosOrderDetailQueryDto,
  ): Promise<RetailPosOrderDetailResponseDto> {
    await this.assertBranchExists(query.branchId);

    const order = await this.ordersRepository.findOne({
      where: {
        id: orderId,
        fulfillmentBranchId: query.branchId,
      },
      relations: {
        deliverer: true,
      },
    });

    if (!order) {
      throw new NotFoundException(
        `POS order ${orderId} was not found for branch ${query.branchId}`,
      );
    }

    const exception = this.mapPosExceptionItem(order, 24);

    return {
      summary: {
        orderId: order.id,
        branchId: order.fulfillmentBranchId ?? query.branchId,
        queueType: exception?.queueType ?? null,
        priority: exception?.priority ?? null,
        priorityReason: exception?.priorityReason ?? null,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentProofStatus: order.paymentProofStatus ?? null,
        total: Number(order.total ?? 0),
        currency: order.currency,
        itemCount: order.items?.length ?? 0,
        totalUnits: (order.items ?? []).reduce(
          (sum, item) => sum + Number(item.quantity ?? 0),
          0,
        ),
        ageHours: this.calculateOrderAgeHours(order.createdAt),
        createdAt: order.createdAt,
        deliveryAssignedAt: order.deliveryAssignedAt ?? null,
        outForDeliveryAt: order.outForDeliveryAt ?? null,
        deliveryResolvedAt: order.deliveryResolvedAt ?? null,
        proofOfDeliveryUrl: order.proofOfDeliveryUrl ?? null,
        deliveryFailureReasonCode: order.deliveryFailureReasonCode ?? null,
        deliveryFailureNotes: order.deliveryFailureNotes ?? null,
        customerName: order.shippingAddress?.fullName ?? null,
        customerPhoneNumber: order.shippingAddress?.phoneNumber ?? null,
        shippingCity: order.shippingAddress?.city ?? null,
      },
      actions: this.buildPosOrderActions(order, exception?.queueType ?? null),
      items: (order.items ?? []).map((item) => ({
        productId: item.product?.id ?? null,
        productName: item.product?.name ?? 'Unknown product',
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.price ?? 0),
        lineTotal: Number(item.quantity ?? 0) * Number(item.price ?? 0),
      })),
    };
  }

  async reevaluateReplenishmentDraft(
    branchId: number,
    purchaseOrderId: number,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<RetailReplenishmentReevaluationResponseDto> {
    await this.assertBranchExists(branchId);

    const purchaseOrder = await this.purchaseOrdersRepository.findOne({
      where: {
        id: purchaseOrderId,
        branchId,
      },
    });

    if (!purchaseOrder) {
      throw new NotFoundException(
        `Auto-replenishment draft ${purchaseOrderId} was not found for branch ${branchId}`,
      );
    }

    const reevaluated =
      await this.purchaseOrdersService.reevaluateAutoReplenishmentDraftDetailed(
        purchaseOrderId,
        actor,
      );

    return this.mapRetailReplenishmentReevaluationResponse(
      reevaluated.purchaseOrder,
      reevaluated.outcome,
    );
  }

  async getStockHealth(
    query: RetailStockHealthQueryDto,
  ): Promise<RetailStockHealthResponseDto> {
    await this.assertBranchExists(query.branchId);

    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 20, 1), 200);

    const [items, total, rawSummary] = await Promise.all([
      this.branchInventoryRepository.find({
        where: { branchId: query.branchId },
        order: {
          availableToSell: 'ASC',
          quantityOnHand: 'ASC',
          updatedAt: 'DESC',
        },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.branchInventoryRepository.count({
        where: { branchId: query.branchId },
      }),
      this.branchInventoryRepository
        .createQueryBuilder('inventory')
        .select('COUNT(*)', 'totalSkus')
        .addSelect(
          'SUM(CASE WHEN inventory.quantityOnHand <= 0 THEN 1 ELSE 0 END)',
          'outOfStockCount',
        )
        .addSelect(
          'SUM(CASE WHEN inventory.availableToSell <= inventory.safetyStock THEN 1 ELSE 0 END)',
          'replenishmentCandidateCount',
        )
        .addSelect(
          'SUM(CASE WHEN inventory.availableToSell < 0 THEN 1 ELSE 0 END)',
          'negativeAvailableCount',
        )
        .addSelect(
          'SUM(COALESCE(inventory.inboundOpenPo, 0))',
          'inboundOpenPoUnits',
        )
        .addSelect(
          'SUM(COALESCE(inventory.reservedQuantity, 0) + COALESCE(inventory.reservedOnline, 0) + COALESCE(inventory.reservedStoreOps, 0) + COALESCE(inventory.outboundTransfers, 0))',
          'committedUnits',
        )
        .addSelect('MAX(inventory.updatedAt)', 'lastUpdatedAt')
        .where('inventory.branchId = :branchId', { branchId: query.branchId })
        .getRawOne(),
    ]);

    const summary = this.mapStockHealthSummary(query.branchId, rawSummary);

    return {
      summary,
      items: items.map((item) => this.mapStockHealthItem(item)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async exportStockHealthCsv(
    query: RetailStockHealthQueryDto,
  ): Promise<string> {
    const stockHealth = await this.getStockHealth(query);
    const header = [
      'branchId',
      'inventoryId',
      'productId',
      'quantityOnHand',
      'reservedQuantity',
      'reservedOnline',
      'reservedStoreOps',
      'inboundOpenPo',
      'outboundTransfers',
      'safetyStock',
      'availableToSell',
      'shortageToSafetyStock',
      'stockStatus',
      'version',
      'lastReceivedAt',
      'lastPurchaseOrderId',
      'createdAt',
      'updatedAt',
    ];

    const lines = [header.join(',')];
    for (const item of stockHealth.items) {
      lines.push(
        [
          item.branchId,
          item.id,
          item.productId,
          item.quantityOnHand,
          item.reservedQuantity,
          item.reservedOnline,
          item.reservedStoreOps,
          item.inboundOpenPo,
          item.outboundTransfers,
          item.safetyStock,
          item.availableToSell,
          item.shortageToSafetyStock,
          item.stockStatus,
          item.version,
          this.formatCsvDate(item.lastReceivedAt),
          item.lastPurchaseOrderId ?? '',
          this.formatCsvDate(item.createdAt),
          this.formatCsvDate(item.updatedAt),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getStockHealthNetworkSummary(
    query: RetailStockHealthNetworkSummaryQueryDto,
  ): Promise<RetailStockHealthNetworkSummaryResponseDto> {
    const anchorBranch = await this.branchesRepository.findOne({
      where: { id: query.branchId },
    });

    if (!anchorBranch) {
      throw new NotFoundException(`Branch with ID ${query.branchId} not found`);
    }

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);
    const tenantBranches =
      anchorBranch.retailTenantId != null
        ? await this.branchesRepository.find({
            where: {
              retailTenantId: anchorBranch.retailTenantId,
              isActive: true,
            },
            order: { name: 'ASC' },
          })
        : [anchorBranch];
    const branchIds = tenantBranches.map((branch) => branch.id);
    const inventories = await this.branchInventoryRepository.find({
      where: { branchId: In(branchIds) },
      order: {
        updatedAt: 'DESC',
      },
    });

    const matchedBranchCards = tenantBranches
      .map((branch) => {
        const branchItems = inventories
          .filter((item) => item.branchId === branch.id)
          .map((item) => this.mapStockHealthItem(item));

        return this.mapStockHealthNetworkBranch(branch, branchItems);
      })
      .filter(
        (branch) =>
          branch.outOfStockCount > 0 ||
          branch.replenishmentCandidateCount > 0 ||
          branch.negativeAvailableCount > 0 ||
          branch.worstStockStatus === 'LOW_STOCK',
      )
      .filter((branch) =>
        this.matchesStockHealthNetworkStatus(
          branch.worstStockStatus,
          query.stockStatus,
        ),
      );

    const branchCards = [...matchedBranchCards]
      .sort((left, right) => this.compareStockHealthNetworkBranch(left, right))
      .slice(0, limit);

    return {
      anchorBranchId: anchorBranch.id,
      retailTenantId: anchorBranch.retailTenantId ?? null,
      branchCount: tenantBranches.length,
      totalSkus: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.totalSkus,
        0,
      ),
      healthyCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.healthyCount,
        0,
      ),
      replenishmentCandidateCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.replenishmentCandidateCount,
        0,
      ),
      outOfStockCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.outOfStockCount,
        0,
      ),
      negativeAvailableCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.negativeAvailableCount,
        0,
      ),
      inboundOpenPoUnits: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.inboundOpenPoUnits,
        0,
      ),
      committedUnits: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.committedUnits,
        0,
      ),
      outOfStockBranchCount: matchedBranchCards.filter(
        (branch) => branch.worstStockStatus === 'OUT_OF_STOCK',
      ).length,
      reorderNowBranchCount: matchedBranchCards.filter(
        (branch) => branch.worstStockStatus === 'REORDER_NOW',
      ).length,
      lowStockBranchCount: matchedBranchCards.filter(
        (branch) => branch.worstStockStatus === 'LOW_STOCK',
      ).length,
      alerts: this.buildStockHealthNetworkAlerts(matchedBranchCards),
      branches: branchCards,
    };
  }

  async exportStockHealthNetworkSummaryCsv(
    query: RetailStockHealthNetworkSummaryQueryDto,
  ): Promise<string> {
    const summary = await this.getStockHealthNetworkSummary(query);
    const header = [
      'branchId',
      'branchName',
      'branchCode',
      'worstStockStatus',
      'worstStockStatusReason',
      'totalSkus',
      'healthyCount',
      'replenishmentCandidateCount',
      'outOfStockCount',
      'negativeAvailableCount',
      'inboundOpenPoUnits',
      'committedUnits',
      'lastUpdatedAt',
    ];

    const lines = [header.join(',')];
    for (const branch of summary.branches) {
      lines.push(
        [
          branch.branchId,
          this.escapeCsvValue(branch.branchName),
          this.escapeCsvValue(branch.branchCode ?? ''),
          branch.worstStockStatus,
          this.escapeCsvValue(branch.worstStockStatusReason),
          branch.totalSkus,
          branch.healthyCount,
          branch.replenishmentCandidateCount,
          branch.outOfStockCount,
          branch.negativeAvailableCount,
          branch.inboundOpenPoUnits,
          branch.committedUnits,
          this.formatCsvDate(branch.lastUpdatedAt),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getAiInsights(
    query: RetailAiInsightsQueryDto,
  ): Promise<RetailAiInsightsResponseDto> {
    await this.assertBranchExists(query.branchId);

    const entitlement =
      await this.retailEntitlementsService.getActiveBranchModuleEntitlement(
        query.branchId,
        'AI_ANALYTICS' as any,
      );
    const aiAnalyticsPolicy = this.resolveAiAnalyticsPolicy(
      entitlement?.metadata?.aiAnalyticsPolicy,
    );

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);
    const staleBefore = new Date(
      Date.now() - aiAnalyticsPolicy.stalePurchaseOrderHours * 60 * 60 * 1000,
    ).toISOString();

    const [rawInventorySummary, riskItems, rawOpenPurchaseOrderSummary] =
      await Promise.all([
        this.branchInventoryRepository
          .createQueryBuilder('inventory')
          .select('COUNT(*)', 'totalSkus')
          .addSelect(
            'SUM(CASE WHEN inventory.quantityOnHand <= 0 THEN 1 ELSE 0 END)',
            'outOfStockCount',
          )
          .addSelect(
            'SUM(CASE WHEN inventory.availableToSell <= inventory.safetyStock THEN 1 ELSE 0 END)',
            'replenishmentCandidateCount',
          )
          .addSelect(
            'SUM(CASE WHEN inventory.availableToSell < 0 THEN 1 ELSE 0 END)',
            'negativeAvailableCount',
          )
          .addSelect(
            'SUM(COALESCE(inventory.inboundOpenPo, 0))',
            'inboundOpenPoUnits',
          )
          .where('inventory.branchId = :branchId', { branchId: query.branchId })
          .getRawOne(),
        this.branchInventoryRepository.find({
          where: { branchId: query.branchId },
          order: {
            availableToSell: 'ASC',
            quantityOnHand: 'ASC',
            updatedAt: 'DESC',
          },
          take: limit,
        }),
        this.purchaseOrdersRepository
          .createQueryBuilder('purchaseOrder')
          .select('COUNT(*)', 'openPurchaseOrderCount')
          .addSelect(
            'COALESCE(SUM(purchaseOrder.total), 0)',
            'openPurchaseOrderValue',
          )
          .addSelect(
            'SUM(CASE WHEN purchaseOrder.createdAt < :staleBefore THEN 1 ELSE 0 END)',
            'staleOpenPurchaseOrderCount',
          )
          .addSelect(
            `SUM(CASE WHEN purchaseOrder.status = :draftStatus AND COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishmentSubmissionMode', '') = 'AUTO_SUBMIT' AND COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') != '' THEN 1 ELSE 0 END)`,
            'blockedAutoSubmitDraftCount',
          )
          .where('purchaseOrder.branchId = :branchId', {
            branchId: query.branchId,
          })
          .andWhere('purchaseOrder.status IN (:...statuses)', {
            statuses: [
              PurchaseOrderStatus.DRAFT,
              PurchaseOrderStatus.SUBMITTED,
              PurchaseOrderStatus.ACKNOWLEDGED,
              PurchaseOrderStatus.SHIPPED,
            ],
          })
          .setParameter('staleBefore', staleBefore)
          .setParameter('draftStatus', PurchaseOrderStatus.DRAFT)
          .getRawOne(),
      ]);

    const summary = this.mapAiInsightSummary(
      query.branchId,
      rawInventorySummary,
      rawOpenPurchaseOrderSummary,
    );

    return {
      summary,
      insights: this.buildAiInsights(
        summary,
        aiAnalyticsPolicy.targetHealthScore,
      ),
      productRisks: riskItems.map((item) => this.mapAiProductRisk(item)),
    };
  }

  async exportAiInsightsCsv(query: RetailAiInsightsQueryDto): Promise<string> {
    const aiInsights = await this.getAiInsights(query);
    const header = [
      'branchId',
      'generatedAt',
      'healthScore',
      'insightCodes',
      'insightSeverities',
      'productId',
      'stockStatus',
      'availableToSell',
      'safetyStock',
      'inboundOpenPo',
      'shortageToSafetyStock',
      'riskScore',
      'recommendedReorderUnits',
      'lastReceivedAt',
      'lastPurchaseOrderId',
    ];

    const insightCodes = this.escapeCsvValue(
      aiInsights.insights.map((item) => item.code).join('|'),
    );
    const insightSeverities = this.escapeCsvValue(
      aiInsights.insights
        .map((item) => `${item.code}:${item.severity}`)
        .join('|'),
    );
    const lines = [header.join(',')];

    for (const item of aiInsights.productRisks) {
      lines.push(
        [
          aiInsights.summary.branchId,
          this.formatCsvDate(aiInsights.summary.generatedAt),
          aiInsights.summary.healthScore,
          insightCodes,
          insightSeverities,
          item.productId,
          item.stockStatus,
          item.availableToSell,
          item.safetyStock,
          item.inboundOpenPo,
          item.shortageToSafetyStock,
          item.riskScore,
          item.recommendedReorderUnits,
          this.formatCsvDate(item.lastReceivedAt),
          item.lastPurchaseOrderId ?? '',
        ].join(','),
      );
    }

    if (!aiInsights.productRisks.length) {
      lines.push(
        [
          aiInsights.summary.branchId,
          this.formatCsvDate(aiInsights.summary.generatedAt),
          aiInsights.summary.healthScore,
          insightCodes,
          insightSeverities,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getAiNetworkSummary(
    query: RetailAiNetworkSummaryQueryDto,
  ): Promise<RetailAiNetworkSummaryResponseDto> {
    const anchorBranch = await this.branchesRepository.findOne({
      where: { id: query.branchId },
    });

    if (!anchorBranch) {
      throw new NotFoundException(`Branch with ID ${query.branchId} not found`);
    }

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);
    const tenantBranches =
      anchorBranch.retailTenantId != null
        ? await this.branchesRepository.find({
            where: {
              retailTenantId: anchorBranch.retailTenantId,
              isActive: true,
            },
            order: { name: 'ASC' },
          })
        : [anchorBranch];
    const branchIds = tenantBranches.map((branch) => branch.id);

    const [inventories, openPurchaseOrders] = await Promise.all([
      this.branchInventoryRepository.find({
        where: { branchId: In(branchIds) },
        order: {
          availableToSell: 'ASC',
          quantityOnHand: 'ASC',
          updatedAt: 'DESC',
        },
      }),
      this.purchaseOrdersRepository.find({
        where: {
          branchId: In(branchIds),
          status: In([
            PurchaseOrderStatus.DRAFT,
            PurchaseOrderStatus.SUBMITTED,
            PurchaseOrderStatus.ACKNOWLEDGED,
            PurchaseOrderStatus.SHIPPED,
          ]),
        },
        order: {
          createdAt: 'DESC',
        },
      }),
    ]);

    const matchedBranchCards = (
      await Promise.all(
        tenantBranches.map(async (branch) => {
          const entitlement =
            await this.retailEntitlementsService.getActiveBranchModuleEntitlement(
              branch.id,
              'AI_ANALYTICS' as any,
            );
          const aiAnalyticsPolicy = this.resolveAiAnalyticsPolicy(
            entitlement?.metadata?.aiAnalyticsPolicy,
          );
          const branchInventory = inventories.filter(
            (item) => item.branchId === branch.id,
          );
          const rawInventorySummary =
            this.summarizeBranchInventoryForAi(branchInventory);
          const rawOpenPurchaseOrderSummary =
            this.summarizeBranchOpenPurchaseOrdersForAi(
              openPurchaseOrders.filter(
                (order) => order.branchId === branch.id,
              ),
              aiAnalyticsPolicy.stalePurchaseOrderHours,
            );
          const summary = this.mapAiInsightSummary(
            branch.id,
            rawInventorySummary,
            rawOpenPurchaseOrderSummary,
          );
          const insights = this.buildAiInsights(
            summary,
            aiAnalyticsPolicy.targetHealthScore,
          );

          return this.mapAiNetworkBranch(branch, summary, insights);
        }),
      )
    ).filter((branch) =>
      this.matchesAiNetworkSeverity(branch.highestSeverity, query.severity),
    );

    const branchCards = [...matchedBranchCards]
      .sort((left, right) => this.compareAiNetworkBranch(left, right))
      .slice(0, limit);

    return {
      anchorBranchId: anchorBranch.id,
      retailTenantId: anchorBranch.retailTenantId ?? null,
      branchCount: tenantBranches.length,
      averageHealthScore: matchedBranchCards.length
        ? Math.round(
            matchedBranchCards.reduce(
              (sum, branch) => sum + branch.healthScore,
              0,
            ) / matchedBranchCards.length,
          )
        : 0,
      criticalBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestSeverity === 'CRITICAL',
      ).length,
      watchBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestSeverity === 'WATCH',
      ).length,
      infoBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestSeverity === 'INFO',
      ).length,
      totalAtRiskSkus: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.atRiskSkus,
        0,
      ),
      totalOutOfStockSkus: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.outOfStockSkus,
        0,
      ),
      totalNegativeAvailableSkus: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.negativeAvailableSkus,
        0,
      ),
      totalStaleOpenPurchaseOrderCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.staleOpenPurchaseOrderCount,
        0,
      ),
      totalBlockedAutoSubmitDraftCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.blockedAutoSubmitDraftCount,
        0,
      ),
      alerts: this.buildAiNetworkAlerts(matchedBranchCards),
      branches: branchCards,
    };
  }

  async exportAiNetworkSummaryCsv(
    query: RetailAiNetworkSummaryQueryDto,
  ): Promise<string> {
    const summary = await this.getAiNetworkSummary(query);
    const header = [
      'branchId',
      'branchName',
      'branchCode',
      'healthScore',
      'highestSeverity',
      'highestSeverityReason',
      'totalSkus',
      'atRiskSkus',
      'outOfStockSkus',
      'negativeAvailableSkus',
      'inboundOpenPoUnits',
      'openPurchaseOrderCount',
      'staleOpenPurchaseOrderCount',
      'blockedAutoSubmitDraftCount',
      'topInsightCodes',
    ];

    const lines = [header.join(',')];
    for (const branch of summary.branches) {
      lines.push(
        [
          branch.branchId,
          this.escapeCsvValue(branch.branchName),
          this.escapeCsvValue(branch.branchCode ?? ''),
          branch.healthScore,
          branch.highestSeverity,
          this.escapeCsvValue(branch.highestSeverityReason),
          branch.totalSkus,
          branch.atRiskSkus,
          branch.outOfStockSkus,
          branch.negativeAvailableSkus,
          branch.inboundOpenPoUnits,
          branch.openPurchaseOrderCount,
          branch.staleOpenPurchaseOrderCount,
          branch.blockedAutoSubmitDraftCount,
          this.escapeCsvValue(branch.topInsightCodes.join('|')),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getAccountingOverview(
    query: RetailAccountingOverviewQueryDto,
  ): Promise<RetailAccountingOverviewResponseDto> {
    await this.assertBranchExists(query.branchId);

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const candidateStatuses = [
      PurchaseOrderStatus.DRAFT,
      PurchaseOrderStatus.SUBMITTED,
      PurchaseOrderStatus.ACKNOWLEDGED,
      PurchaseOrderStatus.SHIPPED,
      PurchaseOrderStatus.RECEIVED,
    ];

    const orders = await this.purchaseOrdersRepository.find({
      where: {
        branchId: query.branchId,
        status: In(candidateStatuses),
      },
      order: {
        createdAt: 'DESC',
      },
      take: Math.max(limit * 3, 50),
    });

    const receiptEvents = orders.length
      ? await this.purchaseOrderReceiptEventsRepository.find({
          where: {
            purchaseOrderId: In(orders.map((order) => order.id)),
          },
          order: {
            createdAt: 'DESC',
          },
        })
      : [];

    const receiptEventsByOrderId = receiptEvents.reduce<
      Map<number, PurchaseOrderReceiptEvent[]>
    >((accumulator, event) => {
      const bucket = accumulator.get(event.purchaseOrderId) ?? [];
      bucket.push(event);
      accumulator.set(event.purchaseOrderId, bucket);
      return accumulator;
    }, new Map());

    const filteredOrders =
      query.supplierProfileId != null
        ? orders.filter(
            (order) => order.supplierProfileId === query.supplierProfileId,
          )
        : orders;

    const items = filteredOrders
      .map((order) =>
        this.mapAccountingOverviewItem(
          order,
          receiptEventsByOrderId.get(order.id) ?? [],
        ),
      )
      .filter((item) =>
        this.matchesAccountingStateFilter(item, query.accountingState),
      )
      .filter((item) =>
        this.matchesAccountingSlaFilter(item, query.slaBreachedOnly),
      )
      .filter((item) =>
        this.matchesAccountingPriorityFilter(item, query.priority),
      )
      .sort((left, right) => {
        const priorityRank = {
          CRITICAL: 0,
          HIGH: 1,
          NORMAL: 2,
        } as const;
        const rank = {
          DISCREPANCY_REVIEW: 0,
          DISCREPANCY_AWAITING_APPROVAL: 1,
          READY_TO_RECONCILE: 2,
          RECEIVED_PENDING_RECONCILIATION: 3,
          OPEN_COMMITMENT: 4,
        } as const;

        const leftPriorityRank = priorityRank[left.priority];
        const rightPriorityRank = priorityRank[right.priority];
        if (leftPriorityRank !== rightPriorityRank) {
          return leftPriorityRank - rightPriorityRank;
        }

        const leftRank = rank[left.accountingState];
        const rightRank = rank[right.accountingState];
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return right.purchaseOrderId - left.purchaseOrderId;
      })
      .slice(0, limit);

    const summary = this.mapAccountingOverviewSummary(query.branchId, items);

    return {
      summary,
      alerts: this.buildAccountingAlerts(summary, items),
      items,
    };
  }

  async exportAccountingOverviewCsv(
    query: RetailAccountingOverviewQueryDto,
  ): Promise<string> {
    const overview = await this.getAccountingOverview(query);
    const header = [
      'branchId',
      'purchaseOrderId',
      'orderNumber',
      'status',
      'supplierProfileId',
      'currency',
      'total',
      'outstandingUnitCount',
      'shortageUnitCount',
      'damagedUnitCount',
      'orderAgeHours',
      'accountingState',
      'lastDiscrepancyStatus',
      'lastReceiptEventId',
      'lastReceiptEventAgeHours',
      'priority',
      'priorityReason',
      'actionTypes',
    ];

    const lines = [header.join(',')];
    for (const item of overview.items) {
      lines.push(
        [
          overview.summary.branchId,
          item.purchaseOrderId,
          this.escapeCsvValue(item.orderNumber),
          item.status,
          item.supplierProfileId,
          item.currency,
          item.total,
          item.outstandingUnitCount,
          item.shortageUnitCount,
          item.damagedUnitCount,
          item.orderAgeHours,
          item.accountingState,
          item.lastDiscrepancyStatus ?? '',
          item.lastReceiptEventId ?? '',
          item.lastReceiptEventAgeHours ?? '',
          item.priority,
          this.escapeCsvValue(item.priorityReason),
          this.escapeCsvValue(
            item.actions.map((action) => action.type).join('|'),
          ),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getAccountingNetworkSummary(
    query: RetailAccountingNetworkSummaryQueryDto,
  ): Promise<RetailAccountingNetworkSummaryResponseDto> {
    const anchorBranch = await this.branchesRepository.findOne({
      where: { id: query.branchId },
    });

    if (!anchorBranch) {
      throw new NotFoundException(`Branch with ID ${query.branchId} not found`);
    }

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);
    const tenantBranches =
      anchorBranch.retailTenantId != null
        ? await this.branchesRepository.find({
            where: {
              retailTenantId: anchorBranch.retailTenantId,
              isActive: true,
            },
            order: { name: 'ASC' },
          })
        : [anchorBranch];
    const branchIds = tenantBranches.map((branch) => branch.id);
    const candidateStatuses = [
      PurchaseOrderStatus.DRAFT,
      PurchaseOrderStatus.SUBMITTED,
      PurchaseOrderStatus.ACKNOWLEDGED,
      PurchaseOrderStatus.SHIPPED,
      PurchaseOrderStatus.RECEIVED,
    ];

    const orders = await this.purchaseOrdersRepository.find({
      where: {
        branchId: In(branchIds),
        status: In(candidateStatuses),
      },
      order: {
        createdAt: 'DESC',
      },
      take: Math.max(branchIds.length * 50, 100),
    });
    const receiptEvents = orders.length
      ? await this.purchaseOrderReceiptEventsRepository.find({
          where: {
            purchaseOrderId: In(orders.map((order) => order.id)),
          },
          order: {
            createdAt: 'DESC',
          },
        })
      : [];
    const receiptEventsByOrderId = receiptEvents.reduce<
      Map<number, PurchaseOrderReceiptEvent[]>
    >((accumulator, event) => {
      const bucket = accumulator.get(event.purchaseOrderId) ?? [];
      bucket.push(event);
      accumulator.set(event.purchaseOrderId, bucket);
      return accumulator;
    }, new Map());

    const matchedBranchCards = tenantBranches
      .map((branch) => {
        const branchItems = orders
          .filter((order) => order.branchId === branch.id)
          .map((order) =>
            this.mapAccountingOverviewItem(
              order,
              receiptEventsByOrderId.get(order.id) ?? [],
            ),
          )
          .filter((item) =>
            this.matchesAccountingStateFilter(item, query.accountingState),
          )
          .sort((left, right) => this.compareAccountingPriority(left, right));

        return this.mapAccountingNetworkBranch(
          branch,
          branchItems,
          query.accountingState,
        );
      })
      .filter((branch) => branch.queueItemCount > 0)
      .filter((branch) =>
        this.matchesAccountingNetworkPriority(
          branch.highestPriority,
          query.priority,
        ),
      );

    const branchCards = [...matchedBranchCards]
      .sort((left, right) => this.compareAccountingNetworkBranch(left, right))
      .slice(0, limit);

    return {
      anchorBranchId: anchorBranch.id,
      retailTenantId: anchorBranch.retailTenantId ?? null,
      branchCount: tenantBranches.length,
      openCommitmentCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.openCommitmentCount,
        0,
      ),
      openCommitmentValue: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.openCommitmentValue,
        0,
      ),
      receivedPendingReconciliationCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.receivedPendingReconciliationCount,
        0,
      ),
      discrepancyOpenCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.discrepancyOpenCount,
        0,
      ),
      discrepancyApprovedCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.discrepancyApprovedCount,
        0,
      ),
      reconcileReadyCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.reconcileReadyCount,
        0,
      ),
      priorityQueue: matchedBranchCards.reduce(
        (accumulator, branch) => {
          accumulator.critical += branch.priorityQueue.critical;
          accumulator.high += branch.priorityQueue.high;
          accumulator.normal += branch.priorityQueue.normal;
          return accumulator;
        },
        { critical: 0, high: 0, normal: 0 },
      ),
      criticalBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'CRITICAL',
      ).length,
      highBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'HIGH',
      ).length,
      normalBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'NORMAL',
      ).length,
      alerts: this.buildAccountingNetworkAlerts(matchedBranchCards),
      branches: branchCards,
    };
  }

  async exportAccountingNetworkSummaryCsv(
    query: RetailAccountingNetworkSummaryQueryDto,
  ): Promise<string> {
    const summary = await this.getAccountingNetworkSummary(query);
    const header = [
      'branchId',
      'branchName',
      'branchCode',
      'highestPriority',
      'highestPriorityReason',
      'openCommitmentCount',
      'openCommitmentValue',
      'receivedPendingReconciliationCount',
      'discrepancyOpenCount',
      'discrepancyApprovedCount',
      'reconcileReadyCount',
      'oldestOpenCommitmentAgeHours',
      'oldestReceivedPendingReconciliationAgeHours',
      'criticalQueueCount',
      'highQueueCount',
      'normalQueueCount',
      'queueItemCount',
    ];

    const lines = [header.join(',')];
    for (const branch of summary.branches) {
      lines.push(
        [
          branch.branchId,
          this.escapeCsvValue(branch.branchName),
          this.escapeCsvValue(branch.branchCode ?? ''),
          branch.highestPriority,
          this.escapeCsvValue(branch.highestPriorityReason),
          branch.openCommitmentCount,
          branch.openCommitmentValue,
          branch.receivedPendingReconciliationCount,
          branch.discrepancyOpenCount,
          branch.discrepancyApprovedCount,
          branch.reconcileReadyCount,
          branch.oldestOpenCommitmentAgeHours,
          branch.oldestReceivedPendingReconciliationAgeHours,
          branch.priorityQueue.critical,
          branch.priorityQueue.high,
          branch.priorityQueue.normal,
          branch.queueItemCount,
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getAccountingPayoutExceptions(
    query: RetailAccountingPayoutExceptionsQueryDto,
  ): Promise<RetailAccountingPayoutExceptionsResponseDto> {
    await this.assertBranchExists(query.branchId);

    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const windowHours = this.normalizeAccountingPayoutWindowHours(
      query.windowHours,
    );
    const items = await this.resolveAccountingPayoutExceptions(
      [query.branchId],
      windowHours,
    );
    const filteredItems = items
      .filter((item) =>
        this.matchesAccountingPayoutExceptionType(item, query.exceptionType),
      )
      .filter((item) =>
        this.matchesAccountingPayoutPriority(item.priority, query.priority),
      )
      .sort((left, right) =>
        this.compareAccountingPayoutExceptionItem(left, right),
      )
      .slice(0, limit);

    const summary = this.mapAccountingPayoutExceptionsSummary(
      query.branchId,
      windowHours,
      items,
      filteredItems,
    );

    return {
      summary,
      alerts: this.buildAccountingPayoutAlerts(summary, items),
      items: filteredItems,
    };
  }

  async exportAccountingPayoutExceptionsCsv(
    query: RetailAccountingPayoutExceptionsQueryDto,
  ): Promise<string> {
    const exceptions = await this.getAccountingPayoutExceptions(query);
    const header = [
      'branchId',
      'windowHours',
      'payoutLogId',
      'orderId',
      'orderItemId',
      'exceptionType',
      'priority',
      'priorityReason',
      'provider',
      'payoutStatus',
      'orderStatus',
      'paymentMethod',
      'paymentStatus',
      'amount',
      'currency',
      'vendorId',
      'vendorName',
      'vendorPhoneNumber',
      'failureReason',
      'ageHours',
      'createdAt',
      'actionTypes',
    ];

    const lines = [header.join(',')];
    for (const item of exceptions.items) {
      lines.push(
        [
          exceptions.summary.branchId,
          exceptions.summary.windowHours,
          item.payoutLogId,
          item.orderId,
          item.orderItemId,
          item.exceptionType,
          item.priority,
          this.escapeCsvValue(item.priorityReason),
          item.provider,
          item.payoutStatus,
          item.orderStatus,
          item.paymentMethod,
          item.paymentStatus,
          item.amount,
          item.currency,
          item.vendorId,
          this.escapeCsvValue(item.vendorName),
          this.escapeCsvValue(item.vendorPhoneNumber ?? ''),
          this.escapeCsvValue(item.failureReason ?? ''),
          item.ageHours,
          item.createdAt.toISOString(),
          this.escapeCsvValue(
            item.actions.map((action) => action.type).join('|'),
          ),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getAccountingPayoutNetworkSummary(
    query: RetailAccountingPayoutNetworkSummaryQueryDto,
  ): Promise<RetailAccountingPayoutNetworkSummaryResponseDto> {
    const anchorBranch = await this.branchesRepository.findOne({
      where: { id: query.branchId },
    });

    if (!anchorBranch) {
      throw new NotFoundException(`Branch with ID ${query.branchId} not found`);
    }

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);
    const windowHours = this.normalizeAccountingPayoutWindowHours(
      query.windowHours,
    );
    const tenantBranches =
      anchorBranch.retailTenantId != null
        ? await this.branchesRepository.find({
            where: {
              retailTenantId: anchorBranch.retailTenantId,
              isActive: true,
            },
            order: { name: 'ASC' },
          })
        : [anchorBranch];
    const branchIds = tenantBranches.map((branch) => branch.id);
    const items = await this.resolveAccountingPayoutExceptions(
      branchIds,
      windowHours,
    );

    const matchedBranchCards = tenantBranches
      .map((branch) => {
        const branchItems = items
          .filter((item) => item.branchId === branch.id)
          .filter((item) =>
            this.matchesAccountingPayoutExceptionType(
              item,
              query.exceptionType,
            ),
          )
          .sort((left, right) =>
            this.compareAccountingPayoutExceptionItem(left, right),
          );

        return this.mapAccountingPayoutNetworkBranch(
          branch,
          branchItems,
          windowHours,
          query.exceptionType,
        );
      })
      .filter((branch) => branch.exceptionCount > 0)
      .filter((branch) =>
        this.matchesAccountingPayoutNetworkPriority(
          branch.highestPriority,
          query.priority,
        ),
      );

    const branchCards = [...matchedBranchCards]
      .sort((left, right) =>
        this.compareAccountingPayoutNetworkBranch(left, right),
      )
      .slice(0, limit);

    return {
      anchorBranchId: anchorBranch.id,
      retailTenantId: anchorBranch.retailTenantId ?? null,
      branchCount: tenantBranches.length,
      windowHours,
      exceptionCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.exceptionCount,
        0,
      ),
      autoRetryRequiredCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.autoRetryRequiredCount,
        0,
      ),
      reconciliationRequiredCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.reconciliationRequiredCount,
        0,
      ),
      totalAmountAtRisk: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.totalAmountAtRisk,
        0,
      ),
      priorityQueue: matchedBranchCards.reduce(
        (accumulator, branch) => {
          accumulator.critical += branch.priorityQueue.critical;
          accumulator.high += branch.priorityQueue.high;
          accumulator.normal += branch.priorityQueue.normal;
          return accumulator;
        },
        { critical: 0, high: 0, normal: 0 },
      ),
      criticalBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'CRITICAL',
      ).length,
      highBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'HIGH',
      ).length,
      normalBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'NORMAL',
      ).length,
      alerts: this.buildAccountingPayoutNetworkAlerts(matchedBranchCards),
      branches: branchCards,
    };
  }

  async exportAccountingPayoutNetworkSummaryCsv(
    query: RetailAccountingPayoutNetworkSummaryQueryDto,
  ): Promise<string> {
    const summary = await this.getAccountingPayoutNetworkSummary(query);
    const header = [
      'branchId',
      'branchName',
      'branchCode',
      'highestPriority',
      'highestPriorityReason',
      'exceptionCount',
      'autoRetryRequiredCount',
      'reconciliationRequiredCount',
      'totalAmountAtRisk',
      'oldestExceptionAgeHours',
      'criticalQueueCount',
      'highQueueCount',
      'normalQueueCount',
      'actionTypes',
    ];

    const lines = [header.join(',')];
    for (const branch of summary.branches) {
      lines.push(
        [
          branch.branchId,
          this.escapeCsvValue(branch.branchName),
          this.escapeCsvValue(branch.branchCode ?? ''),
          branch.highestPriority,
          this.escapeCsvValue(branch.highestPriorityReason),
          branch.exceptionCount,
          branch.autoRetryRequiredCount,
          branch.reconciliationRequiredCount,
          branch.totalAmountAtRisk,
          branch.oldestExceptionAgeHours ?? '',
          branch.priorityQueue.critical,
          branch.priorityQueue.high,
          branch.priorityQueue.normal,
          this.escapeCsvValue(
            branch.actions.map((action) => action.type).join('|'),
          ),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getDesktopWorkbench(
    query: RetailDesktopWorkbenchQueryDto,
  ): Promise<RetailDesktopWorkbenchResponseDto> {
    await this.assertBranchExists(query.branchId);

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);
    const windowHours = Math.min(Math.max(query.windowHours ?? 72, 1), 720);
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const [syncJobs, transfers, stockMovements] = await Promise.all([
      this.posSyncJobsRepository.find({
        where: { branchId: query.branchId },
        order: { createdAt: 'DESC' },
        take: Math.max(limit * 3, 25),
      }),
      this.branchTransfersRepository.find({
        where: [
          {
            fromBranchId: query.branchId,
            status: In([
              BranchTransferStatus.REQUESTED,
              BranchTransferStatus.DISPATCHED,
            ]),
          },
          {
            toBranchId: query.branchId,
            status: In([
              BranchTransferStatus.REQUESTED,
              BranchTransferStatus.DISPATCHED,
            ]),
          },
        ],
        order: { createdAt: 'DESC' },
        take: Math.max(limit * 3, 25),
      }),
      this.stockMovementsRepository.find({
        where: {
          branchId: query.branchId,
          movementType: StockMovementType.ADJUSTMENT,
        },
        order: { createdAt: 'DESC' },
        take: Math.max(limit * 5, 50),
      }),
    ]);

    const mappedSyncQueue = syncJobs
      .filter((job) => this.isDesktopSyncQueueCandidate(job))
      .map((job) => this.mapDesktopSyncJob(job))
      .filter((job) =>
        this.matchesDesktopWorkbenchPriority(job.priority, query.priority),
      )
      .sort((left, right) =>
        this.compareDesktopPriority(left.priority, right.priority),
      );

    const mappedTransferQueue = transfers
      .map((transfer) => this.mapDesktopTransfer(query.branchId, transfer))
      .filter((transfer) =>
        this.matchesDesktopWorkbenchPriority(transfer.priority, query.priority),
      )
      .sort((left, right) =>
        this.compareDesktopPriority(left.priority, right.priority),
      );

    const mappedStockExceptions = stockMovements
      .filter(
        (movement) =>
          movement.quantityDelta < 0 &&
          new Date(movement.createdAt).getTime() >= windowStart.getTime(),
      )
      .map((movement) => this.mapDesktopStockException(movement))
      .filter((movement) =>
        this.matchesDesktopWorkbenchPriority(movement.priority, query.priority),
      )
      .sort((left, right) =>
        this.compareDesktopPriority(left.priority, right.priority),
      );

    const syncQueue =
      !query.queueType ||
      query.queueType === RetailDesktopWorkbenchQueueFilter.SYNC_QUEUE
        ? mappedSyncQueue.slice(0, limit)
        : [];
    const transferQueue =
      !query.queueType ||
      query.queueType === RetailDesktopWorkbenchQueueFilter.TRANSFER_QUEUE
        ? mappedTransferQueue.slice(0, limit)
        : [];
    const stockExceptions =
      !query.queueType ||
      query.queueType === RetailDesktopWorkbenchQueueFilter.STOCK_EXCEPTIONS
        ? mappedStockExceptions.slice(0, limit)
        : [];

    const lastProcessedPosSyncAt =
      mappedSyncQueue
        .map((job) => job.processedAt)
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

    const summary = {
      branchId: query.branchId,
      windowHours,
      failedPosSyncJobCount: syncQueue.filter(
        (job) => job.priority === 'CRITICAL',
      ).length,
      openPosSyncJobCount: syncQueue.filter(
        (job) => job.status === PosSyncStatus.RECEIVED,
      ).length,
      rejectedSyncEntryCount: syncQueue.reduce(
        (sum, job) => sum + job.failedEntryCount,
        0,
      ),
      pendingTransferCount: transferQueue.length,
      inboundTransferPendingCount: transferQueue.filter(
        (transfer) => transfer.direction === 'INBOUND',
      ).length,
      outboundTransferPendingCount: transferQueue.filter(
        (transfer) => transfer.direction === 'OUTBOUND',
      ).length,
      negativeAdjustmentCount: stockExceptions.length,
      totalNegativeAdjustmentUnits: stockExceptions.reduce(
        (sum, movement) => sum + Math.abs(movement.quantityDelta),
        0,
      ),
      lastProcessedPosSyncAt:
        query.queueType &&
        query.queueType !== RetailDesktopWorkbenchQueueFilter.SYNC_QUEUE
          ? null
          : lastProcessedPosSyncAt,
    };

    return {
      summary,
      alerts: this.buildDesktopWorkbenchAlerts(
        summary,
        syncQueue,
        transferQueue,
        stockExceptions,
      ),
      syncQueue,
      transferQueue,
      stockExceptions,
    };
  }

  async getDesktopNetworkSummary(
    query: RetailDesktopNetworkSummaryQueryDto,
  ): Promise<RetailDesktopNetworkSummaryResponseDto> {
    const anchorBranch = await this.branchesRepository.findOne({
      where: { id: query.branchId },
    });

    if (!anchorBranch) {
      throw new NotFoundException(`Branch with ID ${query.branchId} not found`);
    }

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);
    const windowHours = Math.min(Math.max(query.windowHours ?? 72, 1), 720);
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const tenantBranches =
      anchorBranch.retailTenantId != null
        ? await this.branchesRepository.find({
            where: {
              retailTenantId: anchorBranch.retailTenantId,
              isActive: true,
            },
            order: {
              name: 'ASC',
            },
          })
        : [anchorBranch];

    const branchIds = tenantBranches.map((branch) => branch.id);
    const [syncJobs, transfers, stockMovements] = await Promise.all([
      this.posSyncJobsRepository.find({
        where: { branchId: In(branchIds) },
        order: { createdAt: 'DESC' },
        take: Math.max(branchIds.length * 10, 50),
      }),
      this.branchTransfersRepository.find({
        where: [
          {
            fromBranchId: In(branchIds),
            status: In([
              BranchTransferStatus.REQUESTED,
              BranchTransferStatus.DISPATCHED,
            ]),
          },
          {
            toBranchId: In(branchIds),
            status: In([
              BranchTransferStatus.REQUESTED,
              BranchTransferStatus.DISPATCHED,
            ]),
          },
        ],
        order: { createdAt: 'DESC' },
        take: Math.max(branchIds.length * 12, 60),
      }),
      this.stockMovementsRepository.find({
        where: {
          branchId: In(branchIds),
          movementType: StockMovementType.ADJUSTMENT,
        },
        order: { createdAt: 'DESC' },
        take: Math.max(branchIds.length * 20, 80),
      }),
    ]);

    const matchedBranchCards = tenantBranches
      .map((branch) => {
        const branchSyncQueue = syncJobs
          .filter((job) => job.branchId === branch.id)
          .filter((job) => this.isDesktopSyncQueueCandidate(job))
          .map((job) => this.mapDesktopSyncJob(job));
        const branchTransferQueue = transfers
          .filter(
            (transfer) =>
              transfer.fromBranchId === branch.id ||
              transfer.toBranchId === branch.id,
          )
          .map((transfer) => this.mapDesktopTransfer(branch.id, transfer));
        const branchStockExceptions = stockMovements
          .filter((movement) => movement.branchId === branch.id)
          .filter(
            (movement) =>
              movement.quantityDelta < 0 &&
              new Date(movement.createdAt).getTime() >= windowStart.getTime(),
          )
          .map((movement) => this.mapDesktopStockException(movement));

        const scopedSyncQueue =
          !query.queueType ||
          query.queueType === RetailDesktopWorkbenchQueueFilter.SYNC_QUEUE
            ? branchSyncQueue
            : [];
        const scopedTransferQueue =
          !query.queueType ||
          query.queueType === RetailDesktopWorkbenchQueueFilter.TRANSFER_QUEUE
            ? branchTransferQueue
            : [];
        const scopedStockExceptions =
          !query.queueType ||
          query.queueType === RetailDesktopWorkbenchQueueFilter.STOCK_EXCEPTIONS
            ? branchStockExceptions
            : [];

        return this.mapDesktopNetworkBranch(
          branch,
          windowHours,
          scopedSyncQueue,
          scopedTransferQueue,
          scopedStockExceptions,
          query.queueType,
        );
      })
      .filter(
        (branch) =>
          branch.failedPosSyncJobCount > 0 ||
          branch.openPosSyncJobCount > 0 ||
          branch.pendingTransferCount > 0 ||
          branch.negativeAdjustmentCount > 0,
      )
      .filter((branch) =>
        this.matchesDesktopNetworkPriority(
          branch.highestPriority,
          query.priority,
        ),
      );

    const branchCards = [...matchedBranchCards]
      .sort(
        (left, right) =>
          this.compareDesktopPriority(
            left.highestPriority,
            right.highestPriority,
          ) ||
          right.totalNegativeAdjustmentUnits -
            left.totalNegativeAdjustmentUnits ||
          right.pendingTransferCount - left.pendingTransferCount,
      )
      .slice(0, limit);

    const summary = {
      anchorBranchId: anchorBranch.id,
      retailTenantId: anchorBranch.retailTenantId ?? null,
      branchCount: tenantBranches.length,
      windowHours,
      failedPosSyncJobCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.failedPosSyncJobCount,
        0,
      ),
      openPosSyncJobCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.openPosSyncJobCount,
        0,
      ),
      rejectedSyncEntryCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.rejectedSyncEntryCount,
        0,
      ),
      pendingTransferCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.pendingTransferCount,
        0,
      ),
      inboundTransferPendingCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.inboundTransferPendingCount,
        0,
      ),
      outboundTransferPendingCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.outboundTransferPendingCount,
        0,
      ),
      negativeAdjustmentCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.negativeAdjustmentCount,
        0,
      ),
      totalNegativeAdjustmentUnits: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.totalNegativeAdjustmentUnits,
        0,
      ),
      criticalBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'CRITICAL',
      ).length,
      highBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'HIGH',
      ).length,
      normalBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'NORMAL',
      ).length,
      alerts: this.buildDesktopNetworkAlerts(matchedBranchCards),
      branches: branchCards,
    };

    return summary;
  }

  async exportDesktopWorkbenchCsv(
    query: RetailDesktopWorkbenchQueryDto,
  ): Promise<string> {
    const workbench = await this.getDesktopWorkbench(query);
    const header = [
      'branchId',
      'queueType',
      'recordId',
      'reference',
      'status',
      'direction',
      'movementType',
      'priority',
      'priorityReason',
      'createdAt',
      'processedAt',
      'ageHours',
      'quantityDelta',
      'totalUnits',
      'rejectedCount',
      'failedEntryCount',
      'sourceType',
      'note',
      'actionTypes',
    ];

    const lines = [header.join(',')];

    for (const item of workbench.syncQueue) {
      lines.push(
        [
          workbench.summary.branchId,
          'SYNC_QUEUE',
          item.jobId,
          this.escapeCsvValue(item.syncType),
          item.status,
          '',
          '',
          item.priority,
          this.escapeCsvValue(item.priorityReason),
          this.formatCsvDate(item.createdAt),
          this.formatCsvDate(item.processedAt),
          '',
          '',
          '',
          item.rejectedCount,
          item.failedEntryCount,
          '',
          '',
          this.escapeCsvValue(
            item.actions.map((action) => action.type).join('|'),
          ),
        ].join(','),
      );
    }

    for (const item of workbench.transferQueue) {
      lines.push(
        [
          workbench.summary.branchId,
          'TRANSFER_QUEUE',
          item.transferId,
          this.escapeCsvValue(item.transferNumber),
          item.status,
          item.direction,
          '',
          item.priority,
          this.escapeCsvValue(item.priorityReason),
          this.formatCsvDate(item.createdAt),
          '',
          item.ageHours,
          '',
          item.totalUnits,
          '',
          '',
          '',
          '',
          this.escapeCsvValue(
            item.actions.map((action) => action.type).join('|'),
          ),
        ].join(','),
      );
    }

    for (const item of workbench.stockExceptions) {
      lines.push(
        [
          workbench.summary.branchId,
          'STOCK_EXCEPTIONS',
          item.movementId,
          this.escapeCsvValue(item.sourceType),
          '',
          '',
          item.movementType,
          item.priority,
          this.escapeCsvValue(item.priorityReason),
          this.formatCsvDate(item.createdAt),
          '',
          '',
          item.quantityDelta,
          '',
          '',
          '',
          this.escapeCsvValue(item.sourceType),
          this.escapeCsvValue(item.note ?? ''),
          this.escapeCsvValue(
            item.actions.map((action) => action.type).join('|'),
          ),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async exportDesktopNetworkSummaryCsv(
    query: RetailDesktopNetworkSummaryQueryDto,
  ): Promise<string> {
    const summary = await this.getDesktopNetworkSummary(query);
    const header = [
      'branchId',
      'branchName',
      'branchCode',
      'highestPriority',
      'highestPriorityReason',
      'failedPosSyncJobCount',
      'openPosSyncJobCount',
      'rejectedSyncEntryCount',
      'pendingTransferCount',
      'inboundTransferPendingCount',
      'outboundTransferPendingCount',
      'negativeAdjustmentCount',
      'totalNegativeAdjustmentUnits',
      'oldestTransferAgeHours',
      'lastProcessedPosSyncAt',
    ];

    const lines = [header.join(',')];
    for (const branch of summary.branches) {
      lines.push(
        [
          branch.branchId,
          this.escapeCsvValue(branch.branchName),
          this.escapeCsvValue(branch.branchCode ?? ''),
          branch.highestPriority,
          this.escapeCsvValue(branch.highestPriorityReason),
          branch.failedPosSyncJobCount,
          branch.openPosSyncJobCount,
          branch.rejectedSyncEntryCount,
          branch.pendingTransferCount,
          branch.inboundTransferPendingCount,
          branch.outboundTransferPendingCount,
          branch.negativeAdjustmentCount,
          branch.totalNegativeAdjustmentUnits,
          branch.oldestTransferAgeHours ?? '',
          branch.lastProcessedPosSyncAt?.toISOString?.() ?? '',
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  async getDesktopSyncJobFailedEntries(
    jobId: number,
    query: RetailDesktopSyncFailedEntriesQueryDto,
  ): Promise<RetailDesktopSyncFailedEntriesResponseDto> {
    await this.assertBranchExists(query.branchId);

    const job = await this.posSyncJobsRepository.findOne({
      where: {
        id: jobId,
        branchId: query.branchId,
      },
    });

    if (!job) {
      throw new NotFoundException(
        `POS sync job ${jobId} was not found for branch ${query.branchId}`,
      );
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const allFailedEntries = (job.failedEntries ?? []).map((entry) =>
      this.mapDesktopFailedSyncEntry(job.id, query.branchId, entry),
    );
    const filteredEntries = allFailedEntries
      .filter((entry) =>
        this.matchesDesktopFailedEntryPriority(entry.priority, query.priority),
      )
      .filter((entry) =>
        this.matchesDesktopFailedEntryMovementType(
          entry.movementType,
          query.movementType,
        ),
      )
      .filter((entry) =>
        this.matchesDesktopFailedEntryTransferFilter(entry, query.transferOnly),
      )
      .sort((left, right) =>
        this.compareDesktopPriority(left.priority, right.priority),
      );
    const visibleFailedEntries = filteredEntries.slice(0, limit);

    return {
      summary: {
        jobId: job.id,
        branchId: job.branchId ?? query.branchId,
        syncType: job.syncType,
        status: job.status,
        rejectedCount: job.rejectedCount ?? 0,
        failedEntryCount: job.failedEntries?.length ?? 0,
        filteredEntryCount: filteredEntries.length,
        criticalEntryCount: filteredEntries.filter(
          (entry) => entry.priority === 'CRITICAL',
        ).length,
        highEntryCount: filteredEntries.filter(
          (entry) => entry.priority === 'HIGH',
        ).length,
        normalEntryCount: filteredEntries.filter(
          (entry) => entry.priority === 'NORMAL',
        ).length,
        transferLinkedEntryCount: filteredEntries.filter((entry) =>
          this.isTransferLinkedFailedSyncEntry(entry),
        ).length,
        createdAt: job.createdAt,
        processedAt: job.processedAt ?? null,
      },
      actions: [
        {
          type: 'VIEW_SYNC_JOB',
          method: 'GET',
          path: `/admin/b2b/pos-sync-jobs/${job.id}`,
          body: null,
          enabled: true,
        },
        {
          type: 'REPLAY_SYNC_FAILURES',
          method: 'POST',
          path: `/pos/v1/sync/jobs/${job.id}/replay-failures`,
          body: {
            branchId: query.branchId,
            entryIndexes: visibleFailedEntries.map((entry) => entry.entryIndex),
          },
          enabled: visibleFailedEntries.length > 0,
        },
      ],
      items: visibleFailedEntries,
    };
  }

  async getDesktopTransferDetail(
    transferId: number,
    query: RetailDesktopTransferDetailQueryDto,
    actor: {
      id?: number | null;
      roles?: string[];
    } = {},
  ): Promise<RetailDesktopTransferDetailResponseDto> {
    await this.assertBranchExists(query.branchId);

    const transfer = await this.branchTransfersRepository.findOne({
      where: [
        { id: transferId, fromBranchId: query.branchId },
        { id: transferId, toBranchId: query.branchId },
      ],
      relations: {
        items: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException(
        `Branch transfer ${transferId} was not found for branch ${query.branchId}`,
      );
    }

    const mappedTransfer = this.mapDesktopTransfer(query.branchId, transfer);
    const actorBranchAssignment = await this.getActiveBranchStaffAssignment(
      query.branchId,
      actor.id ?? null,
    );

    const actions: RetailDesktopWorkbenchActionResponseDto[] = [
      {
        type: 'VIEW_TRANSFER',
        method: 'GET',
        path: `/admin/b2b/branch-transfers/${transfer.id}`,
        body: null,
        enabled: true,
      },
    ];

    if (transfer.status === BranchTransferStatus.REQUESTED) {
      actions.push({
        type: 'DISPATCH_TRANSFER',
        method: 'PATCH',
        path: `/hub/v1/branch-transfers/${transfer.id}/dispatch`,
        body: {},
        enabled: this.canDispatchDesktopTransfer(
          transfer,
          query.branchId,
          actor.roles ?? [],
          actorBranchAssignment,
        ),
      });
    }

    if (transfer.status === BranchTransferStatus.DISPATCHED) {
      actions.push({
        type: 'RECEIVE_TRANSFER',
        method: 'PATCH',
        path: `/hub/v1/branch-transfers/${transfer.id}/receive`,
        body: {},
        enabled: this.canReceiveDesktopTransfer(
          transfer,
          query.branchId,
          actor.roles ?? [],
          actorBranchAssignment,
        ),
      });
    }

    if (
      transfer.status === BranchTransferStatus.REQUESTED ||
      transfer.status === BranchTransferStatus.DISPATCHED
    ) {
      actions.push({
        type: 'CANCEL_TRANSFER',
        method: 'PATCH',
        path: `/hub/v1/branch-transfers/${transfer.id}/cancel`,
        body: {},
        enabled: this.canCancelDesktopTransfer(
          transfer,
          query.branchId,
          actor.roles ?? [],
          actorBranchAssignment,
        ),
      });
    }

    return {
      summary: {
        transferId: transfer.id,
        transferNumber: transfer.transferNumber,
        branchId: query.branchId,
        direction: mappedTransfer.direction,
        fromBranchId: transfer.fromBranchId,
        toBranchId: transfer.toBranchId,
        status: transfer.status,
        ageHours: mappedTransfer.ageHours,
        totalUnits: mappedTransfer.totalUnits,
        priority: mappedTransfer.priority,
        priorityReason: mappedTransfer.priorityReason,
        note: transfer.note ?? null,
        requestedAt: transfer.requestedAt ?? null,
        dispatchedAt: transfer.dispatchedAt ?? null,
        receivedAt: transfer.receivedAt ?? null,
        cancelledAt: transfer.cancelledAt ?? null,
        createdAt: transfer.createdAt,
        updatedAt: transfer.updatedAt,
      },
      actions,
      items:
        query.includeItems === false
          ? []
          : (transfer.items ?? []).map((item) => ({
              id: item.id,
              productId: item.productId,
              quantity: item.quantity,
              note: item.note ?? null,
            })),
    };
  }

  async getDesktopStockExceptionDetail(
    movementId: number,
    query: RetailDesktopStockExceptionDetailQueryDto,
  ): Promise<RetailDesktopStockExceptionDetailResponseDto> {
    await this.assertBranchExists(query.branchId);

    const movement = await this.stockMovementsRepository.findOne({
      where: {
        id: movementId,
        branchId: query.branchId,
      },
    });

    if (!movement) {
      throw new NotFoundException(
        `Stock movement ${movementId} was not found for branch ${query.branchId}`,
      );
    }

    const mapped = this.mapDesktopStockException(movement);
    const actions: RetailDesktopWorkbenchActionResponseDto[] = [
      {
        type: 'VIEW_STOCK_MOVEMENTS',
        method: 'GET',
        path: `/admin/b2b/stock-movements?branchId=${movement.branchId}`,
        body: null,
        enabled: true,
      },
    ];

    if (
      movement.sourceType === 'BRANCH_TRANSFER' &&
      movement.sourceReferenceId != null
    ) {
      actions.push({
        type: 'VIEW_TRANSFER_DETAIL',
        method: 'GET',
        path: `/retail/v1/ops/desktop-workbench/transfers/${movement.sourceReferenceId}?branchId=${movement.branchId}`,
        body: null,
        enabled: true,
      });
    }

    return {
      summary: {
        movementId: movement.id,
        branchId: movement.branchId,
        productId: movement.productId,
        movementType: movement.movementType,
        quantityDelta: movement.quantityDelta,
        sourceType: movement.sourceType,
        sourceReferenceId: movement.sourceReferenceId ?? null,
        actorUserId: movement.actorUserId ?? null,
        note: movement.note ?? null,
        priority: mapped.priority,
        priorityReason: mapped.priorityReason,
        ageHours: this.calculateOrderAgeHours(movement.createdAt),
        createdAt: movement.createdAt,
      },
      actions,
    };
  }

  async listReplenishmentDrafts(
    query: RetailReplenishmentReviewQueryDto,
  ): Promise<RetailReplenishmentReviewResponseDto> {
    await this.assertBranchExists(query.branchId);

    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 20, 1), 200);

    const qb = this.purchaseOrdersRepository
      .createQueryBuilder('purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.items', 'item')
      .where('purchaseOrder.branchId = :branchId', { branchId: query.branchId })
      .andWhere('purchaseOrder.status = :status', {
        status: PurchaseOrderStatus.DRAFT,
      })
      .andWhere(
        "COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishment', 'false') = 'true'",
      );

    if (query.supplierProfileId != null) {
      qb.andWhere('purchaseOrder.supplierProfileId = :supplierProfileId', {
        supplierProfileId: query.supplierProfileId,
      });
    }

    if (query.autoReplenishmentSubmissionMode) {
      qb.andWhere(
        "COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishmentSubmissionMode', '') = :autoReplenishmentSubmissionMode",
        {
          autoReplenishmentSubmissionMode:
            query.autoReplenishmentSubmissionMode,
        },
      );
    }

    if (query.autoReplenishmentBlockedReason) {
      qb.andWhere(
        "COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = :autoReplenishmentBlockedReason",
        {
          autoReplenishmentBlockedReason: query.autoReplenishmentBlockedReason,
        },
      );
    }

    const summaryRaw = await qb
      .clone()
      .select('COUNT(*)', 'totalDrafts')
      .addSelect(
        `SUM(CASE WHEN purchaseOrder.createdAt < :staleBefore THEN 1 ELSE 0 END)`,
        'staleDraftCount',
      )
      .addSelect('SUM(COALESCE(purchaseOrder.total, 0))', 'totalDraftValue')
      .addSelect(
        'COUNT(DISTINCT purchaseOrder.supplierProfileId)',
        'supplierCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishmentSubmissionMode', '') = 'AUTO_SUBMIT' THEN 1 ELSE 0 END)`,
        'autoSubmitDraftCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishmentSubmissionMode', '') = 'AUTO_SUBMIT' AND COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') != '' THEN 1 ELSE 0 END)`,
        'blockedAutoSubmitDraftCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishmentSubmissionMode', '') = 'AUTO_SUBMIT' AND COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'eligible', 'false') = 'true' THEN 1 ELSE 0 END)`,
        'readyAutoSubmitDraftCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = 'DAY_OF_WEEK_BLOCKED' THEN 1 ELSE 0 END)`,
        'dayOfWeekBlockedCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = 'HOUR_OUTSIDE_WINDOW' THEN 1 ELSE 0 END)`,
        'hourOutsideWindowBlockedCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = 'PREFERRED_SUPPLIER_REQUIRED' THEN 1 ELSE 0 END)`,
        'preferredSupplierRequiredCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = 'MINIMUM_ORDER_TOTAL_NOT_MET' THEN 1 ELSE 0 END)`,
        'minimumOrderTotalNotMetCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = 'AUTOMATION_NOT_ENTITLED' THEN 1 ELSE 0 END)`,
        'automationNotEntitledCount',
      )
      .setParameter(
        'staleBefore',
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .getRawOne();

    const [items, total] = await qb
      .orderBy('purchaseOrder.createdAt', 'DESC')
      .addOrderBy('purchaseOrder.id', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    const summary = this.mapReplenishmentSummary(
      query.branchId,
      total,
      summaryRaw,
    );

    return {
      summary,
      items: items.map((item) =>
        this.mapRetailReplenishmentPurchaseOrder(item),
      ),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async getReplenishmentNetworkSummary(
    query: RetailReplenishmentNetworkSummaryQueryDto,
  ): Promise<RetailReplenishmentNetworkSummaryResponseDto> {
    const anchorBranch = await this.branchesRepository.findOne({
      where: { id: query.branchId },
    });

    if (!anchorBranch) {
      throw new NotFoundException(`Branch with ID ${query.branchId} not found`);
    }

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);
    const tenantBranches =
      anchorBranch.retailTenantId != null
        ? await this.branchesRepository.find({
            where: {
              retailTenantId: anchorBranch.retailTenantId,
              isActive: true,
            },
            order: { name: 'ASC' },
          })
        : [anchorBranch];
    const branchIds = tenantBranches.map((branch) => branch.id);
    const drafts = await this.purchaseOrdersRepository.find({
      where: {
        branchId: In(branchIds),
        status: PurchaseOrderStatus.DRAFT,
      },
      order: {
        createdAt: 'DESC',
      },
      relations: {
        items: true,
      } as any,
    });

    const matchedBranchCards = tenantBranches
      .map((branch) => {
        const branchDrafts = drafts
          .filter((order) => order.branchId === branch.id)
          .filter((order) => order.statusMeta?.autoReplenishment === true)
          .filter((order) =>
            this.matchesReplenishmentNetworkFilters(order, query),
          );

        return this.mapReplenishmentNetworkBranch(branch, branchDrafts, query);
      })
      .filter((branch) => branch.totalDrafts > 0);

    const branchCards = [...matchedBranchCards]
      .sort((left, right) =>
        this.compareReplenishmentNetworkBranch(left, right),
      )
      .slice(0, limit);

    return {
      anchorBranchId: anchorBranch.id,
      retailTenantId: anchorBranch.retailTenantId ?? null,
      branchCount: tenantBranches.length,
      totalDrafts: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.totalDrafts,
        0,
      ),
      staleDraftCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.staleDraftCount,
        0,
      ),
      totalDraftValue: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.totalDraftValue,
        0,
      ),
      supplierCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.supplierCount,
        0,
      ),
      autoSubmitDraftCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.autoSubmitDraftCount,
        0,
      ),
      blockedAutoSubmitDraftCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.blockedAutoSubmitDraftCount,
        0,
      ),
      readyAutoSubmitDraftCount: matchedBranchCards.reduce(
        (sum, branch) => sum + branch.readyAutoSubmitDraftCount,
        0,
      ),
      criticalBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'CRITICAL',
      ).length,
      highBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'HIGH',
      ).length,
      normalBranchCount: matchedBranchCards.filter(
        (branch) => branch.highestPriority === 'NORMAL',
      ).length,
      alerts: this.buildReplenishmentNetworkAlerts(matchedBranchCards),
      branches: branchCards,
    };
  }

  async exportReplenishmentNetworkSummaryCsv(
    query: RetailReplenishmentNetworkSummaryQueryDto,
  ): Promise<string> {
    const summary = await this.getReplenishmentNetworkSummary(query);
    const header = [
      'branchId',
      'branchName',
      'branchCode',
      'highestPriority',
      'highestPriorityReason',
      'totalDrafts',
      'staleDraftCount',
      'totalDraftValue',
      'supplierCount',
      'autoSubmitDraftCount',
      'blockedAutoSubmitDraftCount',
      'readyAutoSubmitDraftCount',
      'blockedReasonBreakdown',
    ];

    const lines = [header.join(',')];
    for (const branch of summary.branches) {
      lines.push(
        [
          branch.branchId,
          this.escapeCsvValue(branch.branchName),
          this.escapeCsvValue(branch.branchCode ?? ''),
          branch.highestPriority,
          this.escapeCsvValue(branch.highestPriorityReason),
          branch.totalDrafts,
          branch.staleDraftCount,
          branch.totalDraftValue,
          branch.supplierCount,
          branch.autoSubmitDraftCount,
          branch.blockedAutoSubmitDraftCount,
          branch.readyAutoSubmitDraftCount,
          this.escapeCsvValue(
            branch.blockedReasonBreakdown
              .map((entry) => `${entry.reason}:${entry.count}`)
              .join('|'),
          ),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  private async assertBranchExists(branchId: number): Promise<void> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found`);
    }
  }

  private mapStockHealthSummary(
    branchId: number,
    rawSummary: any,
  ): RetailStockHealthSummaryResponseDto {
    const totalSkus = Number(rawSummary?.totalSkus ?? 0);
    const replenishmentCandidateCount = Number(
      rawSummary?.replenishmentCandidateCount ?? 0,
    );

    return {
      branchId,
      totalSkus,
      healthyCount: Math.max(totalSkus - replenishmentCandidateCount, 0),
      replenishmentCandidateCount,
      outOfStockCount: Number(rawSummary?.outOfStockCount ?? 0),
      negativeAvailableCount: Number(rawSummary?.negativeAvailableCount ?? 0),
      inboundOpenPoUnits: Number(rawSummary?.inboundOpenPoUnits ?? 0),
      committedUnits: Number(rawSummary?.committedUnits ?? 0),
      lastUpdatedAt: rawSummary?.lastUpdatedAt
        ? new Date(rawSummary.lastUpdatedAt)
        : null,
    };
  }

  private mapStockHealthItem(
    item: BranchInventory,
  ): RetailStockHealthItemResponseDto {
    const stockStatus = this.getStockStatus(item);

    return {
      id: item.id,
      branchId: item.branchId,
      productId: item.productId,
      quantityOnHand: item.quantityOnHand,
      reservedQuantity: item.reservedQuantity,
      reservedOnline: item.reservedOnline,
      reservedStoreOps: item.reservedStoreOps,
      inboundOpenPo: item.inboundOpenPo,
      outboundTransfers: item.outboundTransfers,
      safetyStock: item.safetyStock,
      availableToSell: item.availableToSell,
      shortageToSafetyStock: Math.max(
        item.safetyStock - item.availableToSell,
        0,
      ),
      stockStatus,
      version: item.version,
      lastReceivedAt: item.lastReceivedAt ?? null,
      lastPurchaseOrderId: item.lastPurchaseOrderId ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapStockHealthNetworkBranch(
    branch: Branch,
    items: RetailStockHealthItemResponseDto[],
  ): RetailStockHealthNetworkBranchResponseDto {
    const totalSkus = items.length;
    const outOfStockCount = items.filter(
      (item) => item.stockStatus === 'OUT_OF_STOCK',
    ).length;
    const reorderNowCount = items.filter(
      (item) => item.stockStatus === 'REORDER_NOW',
    ).length;
    const lowStockCount = items.filter(
      (item) => item.stockStatus === 'LOW_STOCK',
    ).length;
    const worstStockStatus =
      outOfStockCount > 0
        ? 'OUT_OF_STOCK'
        : reorderNowCount > 0
          ? 'REORDER_NOW'
          : lowStockCount > 0
            ? 'LOW_STOCK'
            : 'HEALTHY';
    const latestUpdatedAt =
      items
        .map((item) => item.updatedAt)
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code ?? null,
      worstStockStatus,
      worstStockStatusReason: this.resolveStockHealthNetworkReason(
        worstStockStatus,
        outOfStockCount,
        reorderNowCount,
        lowStockCount,
        items.filter((item) => item.availableToSell < 0).length,
      ),
      totalSkus,
      healthyCount: items.filter((item) => item.stockStatus === 'HEALTHY')
        .length,
      replenishmentCandidateCount: items.filter(
        (item) =>
          item.stockStatus === 'OUT_OF_STOCK' ||
          item.stockStatus === 'REORDER_NOW',
      ).length,
      outOfStockCount,
      negativeAvailableCount: items.filter((item) => item.availableToSell < 0)
        .length,
      inboundOpenPoUnits: items.reduce(
        (sum, item) => sum + item.inboundOpenPo,
        0,
      ),
      committedUnits: items.reduce(
        (sum, item) =>
          sum +
          item.reservedQuantity +
          item.reservedOnline +
          item.reservedStoreOps +
          item.outboundTransfers,
        0,
      ),
      lastUpdatedAt: latestUpdatedAt,
      actions: [
        {
          type: 'VIEW_BRANCH_STOCK_HEALTH',
          method: 'GET',
          path: `/retail/v1/ops/stock-health?branchId=${branch.id}`,
          body: null,
          enabled: true,
        },
      ],
    };
  }

  private resolveStockHealthNetworkReason(
    worstStockStatus: 'HEALTHY' | 'LOW_STOCK' | 'REORDER_NOW' | 'OUT_OF_STOCK',
    outOfStockCount: number,
    reorderNowCount: number,
    lowStockCount: number,
    negativeAvailableCount: number,
  ): string {
    if (worstStockStatus === 'OUT_OF_STOCK') {
      return `${outOfStockCount} SKUs are already out of stock${negativeAvailableCount > 0 ? `, including ${negativeAvailableCount} with negative availability` : ''}.`;
    }

    if (worstStockStatus === 'REORDER_NOW') {
      return `${reorderNowCount} SKUs are at or below safety stock and need replenishment.`;
    }

    if (worstStockStatus === 'LOW_STOCK') {
      return `${lowStockCount} SKUs are trending low and are within the early warning window.`;
    }

    return 'Inventory coverage remains above safety stock thresholds.';
  }

  private matchesStockHealthNetworkStatus(
    actual: 'HEALTHY' | 'LOW_STOCK' | 'REORDER_NOW' | 'OUT_OF_STOCK',
    expected?: RetailStockHealthNetworkStatusFilter,
  ): boolean {
    if (!expected) {
      return true;
    }

    return actual === expected;
  }

  private compareStockHealthNetworkBranch(
    left: RetailStockHealthNetworkBranchResponseDto,
    right: RetailStockHealthNetworkBranchResponseDto,
  ): number {
    const rank = {
      OUT_OF_STOCK: 0,
      REORDER_NOW: 1,
      LOW_STOCK: 2,
      HEALTHY: 3,
    } as const;

    const statusComparison =
      rank[left.worstStockStatus] - rank[right.worstStockStatus];
    if (statusComparison !== 0) {
      return statusComparison;
    }

    if (right.outOfStockCount !== left.outOfStockCount) {
      return right.outOfStockCount - left.outOfStockCount;
    }

    if (right.negativeAvailableCount !== left.negativeAvailableCount) {
      return right.negativeAvailableCount - left.negativeAvailableCount;
    }

    return right.replenishmentCandidateCount - left.replenishmentCandidateCount;
  }

  private buildStockHealthNetworkAlerts(
    branches: RetailStockHealthNetworkBranchResponseDto[],
  ): RetailStockHealthNetworkAlertResponseDto[] {
    const alerts: RetailStockHealthNetworkAlertResponseDto[] = [];
    const outOfStockBranches = branches.filter(
      (branch) => branch.worstStockStatus === 'OUT_OF_STOCK',
    );
    const negativeAvailabilityBranches = branches.filter(
      (branch) => branch.negativeAvailableCount > 0,
    );
    const reorderNowBranches = branches.filter(
      (branch) => branch.worstStockStatus === 'REORDER_NOW',
    );

    if (outOfStockBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_STOCKOUT_PRESSURE',
        severity: 'CRITICAL',
        title: 'Out-of-stock pressure spans multiple branches',
        summary:
          'At least one branch has already crossed into active stockouts and needs immediate replenishment focus.',
        metric: outOfStockBranches.length,
        action:
          'Open the riskiest branch stock-health queues first and expedite supplier or transfer recovery.',
      });
    }

    if (negativeAvailabilityBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_NEGATIVE_AVAILABILITY',
        severity: 'WATCH',
        title:
          'Negative availability is surfacing across branch inventory ledgers',
        summary:
          'At least one branch shows sellable inventory below zero, which points to reconciliation or transfer timing gaps.',
        metric: negativeAvailabilityBranches.length,
        action:
          'Audit the affected branch stock queues and confirm whether inbound receipts or adjustments are lagging.',
      });
    }

    if (reorderNowBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_REPLENISHMENT_BACKLOG',
        severity: 'INFO',
        title: 'Replenishment risk is building outside active stockouts',
        summary:
          'Some branches are at or below safety stock even when they are not yet fully stocked out.',
        metric: reorderNowBranches.length,
        action:
          'Use the branch stock-health drill-ins to clear reorder-now exposure before it converts into stockouts.',
      });
    }

    return alerts;
  }

  private mapAiInsightSummary(
    branchId: number,
    rawInventorySummary: any,
    rawOpenPurchaseOrderSummary: any,
  ): RetailAiInsightSummaryResponseDto {
    const totalSkus = Number(rawInventorySummary?.totalSkus ?? 0);
    const atRiskSkus = Number(
      rawInventorySummary?.replenishmentCandidateCount ?? 0,
    );
    const outOfStockSkus = Number(rawInventorySummary?.outOfStockCount ?? 0);
    const negativeAvailableSkus = Number(
      rawInventorySummary?.negativeAvailableCount ?? 0,
    );
    const blockedAutoSubmitDraftCount = Number(
      rawOpenPurchaseOrderSummary?.blockedAutoSubmitDraftCount ?? 0,
    );

    const healthScore = this.calculateHealthScore({
      totalSkus,
      atRiskSkus,
      outOfStockSkus,
      negativeAvailableSkus,
      blockedAutoSubmitDraftCount,
    });

    return {
      branchId,
      generatedAt: new Date(),
      healthScore,
      totalSkus,
      atRiskSkus,
      outOfStockSkus,
      negativeAvailableSkus,
      inboundOpenPoUnits: Number(rawInventorySummary?.inboundOpenPoUnits ?? 0),
      openPurchaseOrderCount: Number(
        rawOpenPurchaseOrderSummary?.openPurchaseOrderCount ?? 0,
      ),
      openPurchaseOrderValue: Number(
        rawOpenPurchaseOrderSummary?.openPurchaseOrderValue ?? 0,
      ),
      staleOpenPurchaseOrderCount: Number(
        rawOpenPurchaseOrderSummary?.staleOpenPurchaseOrderCount ?? 0,
      ),
      blockedAutoSubmitDraftCount,
    };
  }

  private calculateHealthScore(params: {
    totalSkus: number;
    atRiskSkus: number;
    outOfStockSkus: number;
    negativeAvailableSkus: number;
    blockedAutoSubmitDraftCount: number;
  }): number {
    const total = Math.max(params.totalSkus, 1);
    const stockoutPenalty = Math.min(
      (params.outOfStockSkus / total) * 100 * 0.55,
      40,
    );
    const atRiskPenalty = Math.min(
      (params.atRiskSkus / total) * 100 * 0.35,
      30,
    );
    const negativePenalty = Math.min(
      (params.negativeAvailableSkus / total) * 100 * 0.7,
      20,
    );
    const automationPenalty = Math.min(
      params.blockedAutoSubmitDraftCount * 6,
      15,
    );

    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          100 -
            stockoutPenalty -
            atRiskPenalty -
            negativePenalty -
            automationPenalty,
        ),
      ),
    );
  }

  private buildAiInsights(
    summary: RetailAiInsightSummaryResponseDto,
    targetHealthScore: number,
  ): RetailAiInsightCardResponseDto[] {
    const insights: RetailAiInsightCardResponseDto[] = [];

    if (summary.healthScore < targetHealthScore) {
      insights.push({
        code: 'HEALTH_SCORE_BELOW_TARGET',
        severity:
          summary.healthScore < Math.max(targetHealthScore - 15, 1)
            ? 'CRITICAL'
            : 'WATCH',
        title: 'Branch health score is below target',
        summary: `The branch is operating below the configured health target of ${targetHealthScore}.`,
        metric: summary.healthScore,
        action:
          'Use the risk list to address stockouts, stale inbound work, and blocked automation first.',
      });
    }

    if (summary.outOfStockSkus > 0) {
      insights.push({
        code: 'STOCKOUT_PRESSURE',
        severity: 'CRITICAL',
        title: `${summary.outOfStockSkus} SKUs are already out of stock`,
        summary:
          'Immediate replenishment is required to recover lost sales and avoid cascading transfer exceptions.',
        metric: summary.outOfStockSkus,
        action:
          'Prioritize emergency reorders for the highest-risk SKUs below.',
      });
    }

    if (summary.negativeAvailableSkus > 0) {
      insights.push({
        code: 'NEGATIVE_AVAILABILITY',
        severity: 'CRITICAL',
        title: 'Inventory availability has gone negative',
        summary:
          'On-hand, reserved, and outbound commitments are misaligned for part of the branch inventory.',
        metric: summary.negativeAvailableSkus,
        action:
          'Audit recent transfers and POS sync deltas before the next replenishment cycle.',
      });
    }

    if (summary.blockedAutoSubmitDraftCount > 0) {
      insights.push({
        code: 'AUTOMATION_BLOCKED',
        severity: 'WATCH',
        title: 'Auto-replenishment drafts are blocked',
        summary:
          'Automation is generating drafts, but at least one rule is preventing auto-submission.',
        metric: summary.blockedAutoSubmitDraftCount,
        action:
          'Review blocked drafts and entitlement policy thresholds for this branch.',
      });
    }

    if (summary.atRiskSkus > 0 && summary.inboundOpenPoUnits === 0) {
      insights.push({
        code: 'INBOUND_COVERAGE_GAP',
        severity: 'CRITICAL',
        title: 'At-risk inventory has no inbound coverage',
        summary:
          'The branch has SKUs below safety stock, but there are no inbound purchase-order units queued.',
        metric: summary.atRiskSkus,
        action:
          'Create replenishment orders or enable automation before demand widens the gap.',
      });
    }

    if (summary.staleOpenPurchaseOrderCount > 0) {
      insights.push({
        code: 'STALE_INBOUND',
        severity: 'WATCH',
        title: 'Open purchase orders are aging',
        summary:
          'Inbound work has been open for more than 72 hours, increasing branch stockout risk.',
        metric: summary.staleOpenPurchaseOrderCount,
        action:
          'Follow up with suppliers or split urgent demand into a faster order path.',
      });
    }

    if (insights.length === 0) {
      insights.push({
        code: 'BRANCH_HEALTHY',
        severity: 'INFO',
        title: 'Branch inventory is operating within target guardrails',
        summary:
          'No critical inventory, automation, or inbound fulfillment risks were detected in this snapshot.',
        metric: summary.healthScore,
        action:
          'Keep monitoring stock-health and automation queues for new drift.',
      });
    }

    return insights;
  }

  private resolveAiAnalyticsPolicy(rawPolicy: any): {
    stalePurchaseOrderHours: number;
    targetHealthScore: number;
  } {
    return {
      stalePurchaseOrderHours:
        Number(rawPolicy?.stalePurchaseOrderHours) > 0
          ? Number(rawPolicy.stalePurchaseOrderHours)
          : 72,
      targetHealthScore:
        Number(rawPolicy?.targetHealthScore) > 0
          ? Math.min(Number(rawPolicy.targetHealthScore), 100)
          : 85,
    };
  }

  private mapAiProductRisk(
    item: BranchInventory,
  ): RetailAiProductRiskResponseDto {
    const stockStatus = this.getStockStatus(item);
    const shortageToSafetyStock = Math.max(
      item.safetyStock - item.availableToSell,
      0,
    );
    const recommendedReorderUnits = Math.max(
      shortageToSafetyStock - (item.inboundOpenPo ?? 0),
      0,
    );

    let riskScore = 0;
    if (stockStatus === 'OUT_OF_STOCK') {
      riskScore += 60;
    } else if (stockStatus === 'REORDER_NOW') {
      riskScore += 40;
    } else if (stockStatus === 'LOW_STOCK') {
      riskScore += 20;
    }

    riskScore += Math.min(shortageToSafetyStock * 4, 25);

    if ((item.availableToSell ?? 0) < 0) {
      riskScore += 20;
    }

    if (shortageToSafetyStock > 0 && (item.inboundOpenPo ?? 0) <= 0) {
      riskScore += 15;
    }

    return {
      productId: item.productId,
      stockStatus,
      availableToSell: item.availableToSell,
      safetyStock: item.safetyStock,
      inboundOpenPo: item.inboundOpenPo,
      shortageToSafetyStock,
      riskScore: Math.min(100, riskScore),
      recommendedReorderUnits,
      lastReceivedAt: item.lastReceivedAt ?? null,
      lastPurchaseOrderId: item.lastPurchaseOrderId ?? null,
    };
  }

  private summarizeBranchInventoryForAi(items: BranchInventory[]): any {
    return {
      totalSkus: items.length,
      replenishmentCandidateCount: items.filter(
        (item) => (item.availableToSell ?? 0) <= (item.safetyStock ?? 0),
      ).length,
      outOfStockCount: items.filter((item) => (item.quantityOnHand ?? 0) <= 0)
        .length,
      negativeAvailableCount: items.filter(
        (item) => (item.availableToSell ?? 0) < 0,
      ).length,
      inboundOpenPoUnits: items.reduce(
        (sum, item) => sum + (item.inboundOpenPo ?? 0),
        0,
      ),
    };
  }

  private summarizeBranchOpenPurchaseOrdersForAi(
    orders: PurchaseOrder[],
    stalePurchaseOrderHours: number,
  ): any {
    const staleBefore = Date.now() - stalePurchaseOrderHours * 60 * 60 * 1000;
    return {
      openPurchaseOrderCount: orders.length,
      openPurchaseOrderValue: orders.reduce(
        (sum, order) => sum + Number(order.total ?? 0),
        0,
      ),
      staleOpenPurchaseOrderCount: orders.filter(
        (order) => new Date(order.createdAt).getTime() < staleBefore,
      ).length,
      blockedAutoSubmitDraftCount: orders.filter(
        (order) =>
          order.status === PurchaseOrderStatus.DRAFT &&
          (order.statusMeta?.autoReplenishmentSubmissionMode ?? '') ===
            'AUTO_SUBMIT' &&
          (order.statusMeta?.lastAutoSubmissionAttempt?.blockedReason ?? '') !==
            '',
      ).length,
    };
  }

  private mapAiNetworkBranch(
    branch: Branch,
    summary: RetailAiInsightSummaryResponseDto,
    insights: RetailAiInsightCardResponseDto[],
  ): RetailAiNetworkBranchResponseDto {
    const highestSeverity = this.resolveAiNetworkHighestSeverity(insights);
    const highestSeverityReason =
      insights.find((insight) => insight.severity === highestSeverity)?.title ??
      'Branch AI signals are within expected guardrails.';

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code ?? null,
      healthScore: summary.healthScore,
      highestSeverity,
      highestSeverityReason,
      totalSkus: summary.totalSkus,
      atRiskSkus: summary.atRiskSkus,
      outOfStockSkus: summary.outOfStockSkus,
      negativeAvailableSkus: summary.negativeAvailableSkus,
      inboundOpenPoUnits: summary.inboundOpenPoUnits,
      openPurchaseOrderCount: summary.openPurchaseOrderCount,
      staleOpenPurchaseOrderCount: summary.staleOpenPurchaseOrderCount,
      blockedAutoSubmitDraftCount: summary.blockedAutoSubmitDraftCount,
      topInsightCodes: insights.slice(0, 3).map((insight) => insight.code),
      actions: [
        {
          type: 'VIEW_BRANCH_AI_INSIGHTS',
          method: 'GET',
          path: `/retail/v1/ops/ai-insights?branchId=${branch.id}`,
          body: null,
          enabled: true,
        },
      ],
    };
  }

  private resolveAiNetworkHighestSeverity(
    insights: RetailAiInsightCardResponseDto[],
  ): 'INFO' | 'WATCH' | 'CRITICAL' {
    if (insights.some((insight) => insight.severity === 'CRITICAL')) {
      return 'CRITICAL';
    }

    if (insights.some((insight) => insight.severity === 'WATCH')) {
      return 'WATCH';
    }

    return 'INFO';
  }

  private matchesAiNetworkSeverity(
    actual: 'INFO' | 'WATCH' | 'CRITICAL',
    expected?: RetailAiNetworkSeverityFilter,
  ): boolean {
    if (!expected) {
      return true;
    }

    return actual === expected;
  }

  private compareAiNetworkBranch(
    left: RetailAiNetworkBranchResponseDto,
    right: RetailAiNetworkBranchResponseDto,
  ): number {
    const rank = {
      CRITICAL: 0,
      WATCH: 1,
      INFO: 2,
    } as const;

    const severityComparison =
      rank[left.highestSeverity] - rank[right.highestSeverity];
    if (severityComparison !== 0) {
      return severityComparison;
    }

    if (left.healthScore !== right.healthScore) {
      return left.healthScore - right.healthScore;
    }

    if (right.outOfStockSkus !== left.outOfStockSkus) {
      return right.outOfStockSkus - left.outOfStockSkus;
    }

    return right.atRiskSkus - left.atRiskSkus;
  }

  private buildAiNetworkAlerts(
    branches: RetailAiNetworkBranchResponseDto[],
  ): RetailAiNetworkAlertResponseDto[] {
    const alerts: RetailAiNetworkAlertResponseDto[] = [];
    const criticalBranches = branches.filter(
      (branch) => branch.highestSeverity === 'CRITICAL',
    );
    const blockedBranches = branches.filter(
      (branch) => branch.blockedAutoSubmitDraftCount > 0,
    );
    const staleInboundBranches = branches.filter(
      (branch) => branch.staleOpenPurchaseOrderCount > 0,
    );

    if (criticalBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_AI_CRITICAL_RISK',
        severity: 'CRITICAL',
        title: 'Critical AI operating risk spans multiple branches',
        summary:
          'At least one branch is surfacing critical AI risk signals around stockouts, negative availability, or missing inbound coverage.',
        metric: criticalBranches.length,
        action:
          'Open the lowest-health branches first and clear the critical risk list before new demand widens the gap.',
      });
    }

    if (blockedBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_AI_AUTOMATION_BLOCKED',
        severity: 'WATCH',
        title: 'Automation blockers are affecting branch AI health',
        summary:
          'Some branches are generating auto-replenishment drafts that are not auto-submitting because of policy or supplier constraints.',
        metric: blockedBranches.length,
        action:
          'Review blocked drafts and tenant AI policy thresholds for the affected branches.',
      });
    }

    if (staleInboundBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_AI_STALE_INBOUND',
        severity: 'WATCH',
        title: 'Inbound aging is degrading AI branch health',
        summary:
          'Open purchase orders are aging long enough to increase stockout exposure in multiple branches.',
        metric: staleInboundBranches.length,
        action:
          'Escalate the oldest inbound queues and confirm supplier ETAs before demand converts to stockouts.',
      });
    }

    return alerts;
  }

  private mapAccountingOverviewSummary(
    branchId: number,
    items: RetailAccountingOverviewItemResponseDto[],
  ) {
    const openCommitmentItems = items.filter(
      (item) => item.accountingState === 'OPEN_COMMITMENT',
    );
    const receivedPendingItems = items.filter(
      (item) => item.accountingState === 'RECEIVED_PENDING_RECONCILIATION',
    );
    const discrepancyOpenItems = items.filter(
      (item) => item.accountingState === 'DISCREPANCY_REVIEW',
    );
    const discrepancyResolvedItems = items.filter(
      (item) => item.accountingState === 'DISCREPANCY_AWAITING_APPROVAL',
    );
    const discrepancyApprovedItems = items.filter(
      (item) =>
        item.lastDiscrepancyStatus ===
        PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
    );
    const reconcileReadyItems = items.filter(
      (item) => item.accountingState === 'READY_TO_RECONCILE',
    );
    const discrepancyOpenAgingBuckets =
      this.buildAccountingAgingBuckets(discrepancyOpenItems);
    const discrepancyAwaitingApprovalAgingBuckets =
      this.buildAccountingAgingBuckets(discrepancyResolvedItems);
    const priorityQueue = items.reduce(
      (accumulator, item) => {
        if (item.priority === 'CRITICAL') {
          accumulator.critical += 1;
        } else if (item.priority === 'HIGH') {
          accumulator.high += 1;
        } else {
          accumulator.normal += 1;
        }

        return accumulator;
      },
      {
        critical: 0,
        high: 0,
        normal: 0,
      },
    );
    const supplierExposure = Array.from(
      items.reduce<
        Map<
          number,
          {
            supplierProfileId: number;
            openCommitmentCount: number;
            openCommitmentValue: number;
            receivedPendingReconciliationCount: number;
            discrepancyOpenCount: number;
            shortageUnitCount: number;
            damagedUnitCount: number;
            shortageValue: number;
            damagedValue: number;
          }
        >
      >((accumulator, item) => {
        const bucket = accumulator.get(item.supplierProfileId) ?? {
          supplierProfileId: item.supplierProfileId,
          openCommitmentCount: 0,
          openCommitmentValue: 0,
          receivedPendingReconciliationCount: 0,
          discrepancyOpenCount: 0,
          shortageUnitCount: 0,
          damagedUnitCount: 0,
          shortageValue: 0,
          damagedValue: 0,
        };

        if (item.accountingState === 'OPEN_COMMITMENT') {
          bucket.openCommitmentCount += 1;
          bucket.openCommitmentValue += item.total;
        }

        if (
          item.accountingState === 'RECEIVED_PENDING_RECONCILIATION' ||
          item.accountingState === 'READY_TO_RECONCILE' ||
          item.accountingState === 'DISCREPANCY_REVIEW' ||
          item.accountingState === 'DISCREPANCY_AWAITING_APPROVAL'
        ) {
          bucket.receivedPendingReconciliationCount += 1;
        }

        if (item.accountingState === 'DISCREPANCY_REVIEW') {
          bucket.discrepancyOpenCount += 1;
        }

        bucket.shortageUnitCount += item.shortageUnitCount;
        bucket.damagedUnitCount += item.damagedUnitCount;
        bucket.shortageValue += this.estimateIssueValue(item, 'shortage');
        bucket.damagedValue += this.estimateIssueValue(item, 'damaged');

        accumulator.set(item.supplierProfileId, bucket);
        return accumulator;
      }, new Map()),
    )
      .map(([, value]) => value)
      .filter(
        (entry) =>
          entry.openCommitmentCount > 0 ||
          entry.receivedPendingReconciliationCount > 0,
      )
      .sort((left, right) => {
        if (right.openCommitmentValue !== left.openCommitmentValue) {
          return right.openCommitmentValue - left.openCommitmentValue;
        }

        return (
          right.receivedPendingReconciliationCount -
          left.receivedPendingReconciliationCount
        );
      })
      .slice(0, 5);

    return {
      branchId,
      openCommitmentCount: openCommitmentItems.length,
      openCommitmentValue: openCommitmentItems.reduce(
        (sum, item) => sum + item.total,
        0,
      ),
      receivedPendingReconciliationCount: receivedPendingItems.length,
      receivedPendingReconciliationValue: receivedPendingItems.reduce(
        (sum, item) => sum + item.total,
        0,
      ),
      discrepancyOpenCount: discrepancyOpenItems.length,
      discrepancyResolvedCount: discrepancyResolvedItems.length,
      discrepancyApprovedCount: discrepancyApprovedItems.length,
      reconcileReadyCount: reconcileReadyItems.length,
      oldestOpenCommitmentAgeHours: this.getOldestAgeHours(openCommitmentItems),
      oldestReceivedPendingReconciliationAgeHours:
        this.getOldestAgeHours(receivedPendingItems),
      supplierExposure,
      discrepancyOpenAgingBuckets,
      discrepancyAwaitingApprovalAgingBuckets,
      priorityQueue,
    };
  }

  private mapAccountingOverviewItem(
    order: PurchaseOrder,
    receiptEvents: PurchaseOrderReceiptEvent[],
  ): RetailAccountingOverviewItemResponseDto {
    const lastReceiptEvent = receiptEvents[0] ?? null;
    const hasOpenDiscrepancy = receiptEvents.some(
      (event) =>
        event.discrepancyStatus === PurchaseOrderReceiptDiscrepancyStatus.OPEN,
    );
    const hasResolvedDiscrepancy = receiptEvents.some(
      (event) =>
        event.discrepancyStatus ===
        PurchaseOrderReceiptDiscrepancyStatus.RESOLVED,
    );
    const outstandingUnitCount = (order.items ?? []).reduce(
      (sum, item) =>
        sum +
        Math.max(
          item.orderedQuantity -
            item.receivedQuantity -
            item.shortageQuantity -
            item.damagedQuantity,
          0,
        ),
      0,
    );
    const shortageUnitCount = (order.items ?? []).reduce(
      (sum, item) => sum + (item.shortageQuantity ?? 0),
      0,
    );
    const damagedUnitCount = (order.items ?? []).reduce(
      (sum, item) => sum + (item.damagedQuantity ?? 0),
      0,
    );
    const isReadyToReconcile =
      order.status === PurchaseOrderStatus.RECEIVED &&
      outstandingUnitCount === 0 &&
      !hasOpenDiscrepancy &&
      !hasResolvedDiscrepancy;

    let accountingState: RetailAccountingOverviewItemResponseDto['accountingState'] =
      'OPEN_COMMITMENT';

    if (hasOpenDiscrepancy) {
      accountingState = 'DISCREPANCY_REVIEW';
    } else if (hasResolvedDiscrepancy) {
      accountingState = 'DISCREPANCY_AWAITING_APPROVAL';
    } else if (isReadyToReconcile) {
      accountingState = 'READY_TO_RECONCILE';
    } else if (order.status === PurchaseOrderStatus.RECEIVED) {
      accountingState = 'RECEIVED_PENDING_RECONCILIATION';
    }

    const orderAgeHours = this.calculateOrderAgeHours(order.createdAt);
    const lastReceiptEventAgeHours =
      lastReceiptEvent?.createdAt != null
        ? this.calculateOrderAgeHours(lastReceiptEvent.createdAt)
        : null;
    const priority = this.buildAccountingPriority(
      accountingState,
      orderAgeHours,
      lastReceiptEventAgeHours,
      Number(order.total),
      shortageUnitCount,
      damagedUnitCount,
    );

    return {
      purchaseOrderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      supplierProfileId: order.supplierProfileId,
      currency: order.currency,
      total: Number(order.total),
      outstandingUnitCount,
      shortageUnitCount,
      damagedUnitCount,
      orderAgeHours,
      accountingState,
      lastDiscrepancyStatus: lastReceiptEvent?.discrepancyStatus ?? null,
      lastReceiptEventId: lastReceiptEvent?.id ?? null,
      lastReceiptEventAgeHours,
      priority: priority.level,
      priorityReason: priority.reason,
      actions: this.buildAccountingActions(
        order,
        lastReceiptEvent,
        accountingState,
      ),
    };
  }

  private buildAccountingAlerts(
    summary: ReturnType<RetailOpsService['mapAccountingOverviewSummary']>,
    items: RetailAccountingOverviewItemResponseDto[],
  ): RetailAccountingAlertResponseDto[] {
    const alerts: RetailAccountingAlertResponseDto[] = [];

    if (summary.discrepancyOpenAgingBuckets.over72Hours > 0) {
      alerts.push({
        code: 'DISCREPANCY_SLA_BREACH',
        severity: 'CRITICAL',
        title: 'Open receipt discrepancies have breached SLA',
        summary:
          'At least one receipt discrepancy has remained unresolved for more than 72 hours.',
        metric: summary.discrepancyOpenAgingBuckets.over72Hours,
        action:
          'Escalate the affected supplier disputes and clear the oldest discrepancy queue first.',
      });
    }

    if (summary.discrepancyAwaitingApprovalAgingBuckets.over72Hours > 0) {
      alerts.push({
        code: 'APPROVAL_BACKLOG',
        severity: 'WATCH',
        title: 'Resolved discrepancies are waiting too long for approval',
        summary:
          'Supplier-submitted discrepancy resolutions are sitting unresolved in the buyer approval queue.',
        metric: summary.discrepancyAwaitingApprovalAgingBuckets.over72Hours,
        action:
          'Approve or reject the oldest discrepancy resolutions to unblock reconciliation.',
      });
    }

    if (summary.oldestReceivedPendingReconciliationAgeHours >= 24) {
      alerts.push({
        code: 'RECONCILIATION_BACKLOG',
        severity:
          summary.oldestReceivedPendingReconciliationAgeHours >= 72
            ? 'CRITICAL'
            : 'WATCH',
        title: 'Received purchase orders are aging before reconciliation',
        summary:
          'At least one received purchase order has not been reconciled within the expected operating window.',
        metric: summary.oldestReceivedPendingReconciliationAgeHours,
        action:
          'Move reconcile-ready orders first, then clear discrepancy-dependent receipts.',
      });
    }

    const topSupplier = summary.supplierExposure[0];
    if (topSupplier && topSupplier.openCommitmentValue >= 500) {
      alerts.push({
        code: 'SUPPLIER_EXPOSURE_CONCENTRATION',
        severity: 'WATCH',
        title: 'Open commitment exposure is concentrated with one supplier',
        summary: `Supplier ${topSupplier.supplierProfileId} currently carries the largest share of open accounting exposure.`,
        metric: topSupplier.openCommitmentValue,
        action:
          'Review whether inbound dependency or approval bottlenecks are concentrated on this supplier lane.',
      });
    }

    if (alerts.length === 0 && items.length > 0) {
      alerts.push({
        code: 'ACCOUNTING_QUEUE_STABLE',
        severity: 'INFO',
        title: 'Accounting queue is within expected thresholds',
        summary:
          'No discrepancy SLA breaches or reconciliation backlog alerts were detected in this branch snapshot.',
        metric: summary.reconcileReadyCount,
        action:
          'Continue clearing reconcile-ready work before it becomes an approval backlog.',
      });
    }

    return alerts;
  }

  private mapAccountingNetworkBranch(
    branch: Branch,
    items: RetailAccountingOverviewItemResponseDto[],
    accountingState?: RetailAccountingStateFilter,
  ): RetailAccountingNetworkBranchResponseDto {
    const summary = this.mapAccountingOverviewSummary(branch.id, items);
    const highestPriority = this.resolveAccountingNetworkBranchPriority(items);
    const highestPriorityReason =
      this.resolveAccountingNetworkBranchPriorityReason(highestPriority, items);

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code ?? null,
      highestPriority,
      highestPriorityReason,
      openCommitmentCount: summary.openCommitmentCount,
      openCommitmentValue: summary.openCommitmentValue,
      receivedPendingReconciliationCount:
        summary.receivedPendingReconciliationCount,
      discrepancyOpenCount: summary.discrepancyOpenCount,
      discrepancyApprovedCount: summary.discrepancyApprovedCount,
      reconcileReadyCount: summary.reconcileReadyCount,
      oldestOpenCommitmentAgeHours: summary.oldestOpenCommitmentAgeHours,
      oldestReceivedPendingReconciliationAgeHours:
        summary.oldestReceivedPendingReconciliationAgeHours,
      priorityQueue: summary.priorityQueue,
      queueItemCount: items.length,
      actions: [
        {
          type: 'VIEW_BRANCH_ACCOUNTING_OVERVIEW',
          method: 'GET',
          path: `/retail/v1/ops/accounting-overview?branchId=${branch.id}${accountingState ? `&accountingState=${accountingState}` : ''}`,
          body: null,
          enabled: true,
        },
      ],
    };
  }

  private resolveAccountingNetworkBranchPriority(
    items: RetailAccountingOverviewItemResponseDto[],
  ): 'CRITICAL' | 'HIGH' | 'NORMAL' {
    if (items.some((item) => item.priority === 'CRITICAL')) {
      return 'CRITICAL';
    }
    if (items.some((item) => item.priority === 'HIGH')) {
      return 'HIGH';
    }
    return 'NORMAL';
  }

  private resolveAccountingNetworkBranchPriorityReason(
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL',
    items: RetailAccountingOverviewItemResponseDto[],
  ): string {
    return (
      items.find((item) => item.priority === priority)?.priorityReason ??
      'Accounting queue is within expected operating thresholds.'
    );
  }

  private compareAccountingPriority(
    left: RetailAccountingOverviewItemResponseDto,
    right: RetailAccountingOverviewItemResponseDto,
  ): number {
    const priorityRank = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
    } as const;
    const rank = {
      DISCREPANCY_REVIEW: 0,
      DISCREPANCY_AWAITING_APPROVAL: 1,
      READY_TO_RECONCILE: 2,
      RECEIVED_PENDING_RECONCILIATION: 3,
      OPEN_COMMITMENT: 4,
    } as const;

    const leftPriorityRank = priorityRank[left.priority];
    const rightPriorityRank = priorityRank[right.priority];
    if (leftPriorityRank !== rightPriorityRank) {
      return leftPriorityRank - rightPriorityRank;
    }

    const leftRank = rank[left.accountingState];
    const rightRank = rank[right.accountingState];
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return right.purchaseOrderId - left.purchaseOrderId;
  }

  private compareAccountingNetworkBranch(
    left: RetailAccountingNetworkBranchResponseDto,
    right: RetailAccountingNetworkBranchResponseDto,
  ): number {
    const priorityRank = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
    } as const;

    if (
      priorityRank[left.highestPriority] !== priorityRank[right.highestPriority]
    ) {
      return (
        priorityRank[left.highestPriority] - priorityRank[right.highestPriority]
      );
    }

    if (right.openCommitmentValue !== left.openCommitmentValue) {
      return right.openCommitmentValue - left.openCommitmentValue;
    }

    return right.queueItemCount - left.queueItemCount;
  }

  private matchesAccountingNetworkPriority(
    priority: RetailAccountingNetworkBranchResponseDto['highestPriority'],
    expected?: RetailAccountingPriorityFilter,
  ): boolean {
    return !expected || priority === expected;
  }

  private buildAccountingNetworkAlerts(
    branches: RetailAccountingNetworkBranchResponseDto[],
  ): RetailAccountingAlertResponseDto[] {
    const alerts: RetailAccountingAlertResponseDto[] = [];
    const discrepancyBranches = branches.filter(
      (branch) => branch.discrepancyOpenCount > 0,
    );
    const reconcileBacklogBranches = branches.filter(
      (branch) => branch.oldestReceivedPendingReconciliationAgeHours >= 24,
    );
    const concentratedExposureBranch = [...branches].sort(
      (left, right) => right.openCommitmentValue - left.openCommitmentValue,
    )[0];

    if (discrepancyBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_DISCREPANCY_SLA_RISK',
        severity: discrepancyBranches.some(
          (branch) => branch.highestPriority === 'CRITICAL',
        )
          ? 'CRITICAL'
          : 'WATCH',
        title: 'Discrepancy review risk spans multiple branches',
        summary:
          'At least one branch has open receipt discrepancies that require accounting review.',
        metric: discrepancyBranches.length,
        action:
          'Clear the oldest discrepancy queues first, then approve resolved supplier responses.',
      });
    }

    if (reconcileBacklogBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_RECONCILIATION_BACKLOG',
        severity: reconcileBacklogBranches.some(
          (branch) => branch.oldestReceivedPendingReconciliationAgeHours >= 72,
        )
          ? 'CRITICAL'
          : 'WATCH',
        title:
          'Received orders are aging before reconciliation across branches',
        summary:
          'At least one branch has received purchase orders sitting too long before reconciliation.',
        metric: reconcileBacklogBranches.length,
        action:
          'Move reconcile-ready branches first, then escalate branches blocked by discrepancy review.',
      });
    }

    if (
      concentratedExposureBranch &&
      concentratedExposureBranch.openCommitmentValue >= 500
    ) {
      alerts.push({
        code: 'NETWORK_SUPPLIER_EXPOSURE',
        severity: 'WATCH',
        title: 'Open accounting exposure is concentrated in one branch',
        summary: `Branch ${concentratedExposureBranch.branchName} currently holds the largest open commitment exposure in the tenant.`,
        metric: concentratedExposureBranch.openCommitmentValue,
        action:
          'Review inbound dependency and supplier bottlenecks in the highest-exposure branch first.',
      });
    }

    if (alerts.length === 0 && branches.length > 0) {
      alerts.push({
        code: 'NETWORK_ACCOUNTING_STABLE',
        severity: 'INFO',
        title: 'Accounting queues are within expected thresholds',
        summary:
          'No tenant-level discrepancy SLA, reconciliation backlog, or exposure concentration alerts were detected.',
        metric: branches.length,
        action:
          'Continue clearing reconcile-ready work before it ages into a discrepancy or approval backlog.',
      });
    }

    return alerts;
  }

  private normalizeAccountingPayoutWindowHours(
    windowHours?: number | null,
  ): number {
    const normalized = Number(windowHours ?? 168);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return 168;
    }

    return Math.min(Math.max(Math.trunc(normalized), 1), 720);
  }

  private async resolveAccountingPayoutExceptions(
    branchIds: number[],
    windowHours: number,
  ): Promise<RetailAccountingPayoutExceptionItemResponseDto[]> {
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const payouts = await this.payoutLogRepository.find({
      where: {
        createdAt: MoreThanOrEqual(windowStart),
      },
      relations: ['vendor'],
      order: { createdAt: 'DESC' },
    });

    const candidates = payouts.filter(
      (payout) => this.resolveAccountingPayoutExceptionType(payout) != null,
    );
    const orderIds = [
      ...new Set(
        candidates
          .map((payout) => payout.orderId)
          .filter((value): value is number => value != null),
      ),
    ];

    const orders = orderIds.length
      ? await this.ordersRepository.find({
          where: {
            id: In(orderIds),
          },
        })
      : [];
    const ordersById = new Map(orders.map((order) => [order.id, order]));

    return candidates
      .map((payout) =>
        this.mapAccountingPayoutExceptionItem(
          payout,
          payout.orderId != null ? ordersById.get(payout.orderId) : null,
        ),
      )
      .filter(
        (item): item is RetailAccountingPayoutExceptionItemResponseDto =>
          item != null,
      )
      .filter((item) => branchIds.includes(item.branchId));
  }

  private mapAccountingPayoutExceptionsSummary(
    branchId: number,
    windowHours: number,
    items: RetailAccountingPayoutExceptionItemResponseDto[],
    filteredItems: RetailAccountingPayoutExceptionItemResponseDto[],
  ) {
    const latestItem =
      [...items].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0] ?? null;

    return {
      branchId,
      windowHours,
      totalExceptionCount: items.length,
      filteredExceptionCount: filteredItems.length,
      autoRetryRequiredCount: items.filter(
        (item) =>
          item.exceptionType ===
          RetailAccountingPayoutExceptionTypeFilter.AUTO_RETRY_REQUIRED,
      ).length,
      reconciliationRequiredCount: items.filter(
        (item) =>
          item.exceptionType ===
          RetailAccountingPayoutExceptionTypeFilter.RECONCILIATION_REQUIRED,
      ).length,
      criticalCount: items.filter((item) => item.priority === 'CRITICAL')
        .length,
      highCount: items.filter((item) => item.priority === 'HIGH').length,
      normalCount: items.filter((item) => item.priority === 'NORMAL').length,
      totalAmountAtRisk: items.reduce((sum, item) => sum + item.amount, 0),
      lastPayoutAt: latestItem?.createdAt ?? null,
    };
  }

  private resolveAccountingPayoutExceptionType(
    payout: Pick<
      PayoutLog,
      | 'provider'
      | 'status'
      | 'failureReason'
      | 'orderId'
      | 'orderItemId'
      | 'transactionReference'
    >,
  ): RetailAccountingPayoutExceptionTypeFilter | null {
    if (
      payout.provider !== PayoutProvider.EBIRR ||
      payout.orderId == null ||
      payout.orderItemId == null
    ) {
      return null;
    }

    if (
      payout.status === PayoutStatus.FAILED &&
      /^ORD-\d+-ITEM-\d+$/i.test(String(payout.transactionReference || ''))
    ) {
      return RetailAccountingPayoutExceptionTypeFilter.AUTO_RETRY_REQUIRED;
    }

    if (
      payout.status === PayoutStatus.SUCCESS &&
      String(payout.failureReason || '').includes('RECONCILE_REQUIRED')
    ) {
      return RetailAccountingPayoutExceptionTypeFilter.RECONCILIATION_REQUIRED;
    }

    return null;
  }

  private mapAccountingPayoutExceptionItem(
    payout: PayoutLog,
    order?: Order | null,
  ): RetailAccountingPayoutExceptionItemResponseDto | null {
    const exceptionType = this.resolveAccountingPayoutExceptionType(payout);
    if (!order || order.fulfillmentBranchId == null || exceptionType == null) {
      return null;
    }

    const ageHours = this.calculateOrderAgeHours(payout.createdAt);
    const priority = this.resolveAccountingPayoutPriority(
      exceptionType,
      ageHours,
      payout.failureReason ?? null,
    );

    return {
      payoutLogId: payout.id,
      branchId: order.fulfillmentBranchId,
      orderId: payout.orderId,
      orderItemId: payout.orderItemId,
      exceptionType,
      priority: priority.level,
      priorityReason: priority.reason,
      provider: payout.provider,
      payoutStatus: payout.status,
      orderStatus: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      amount: Number(payout.amount),
      currency: payout.currency,
      vendorId: payout.vendor?.id,
      vendorName: this.resolveAccountingPayoutVendorName(payout),
      vendorPhoneNumber:
        payout.phoneNumber || payout.vendor?.phoneNumber || null,
      failureReason: payout.failureReason ?? null,
      ageHours,
      createdAt: payout.createdAt,
      actions: this.buildAccountingPayoutActions(
        payout.id,
        payout.orderId,
        order.fulfillmentBranchId,
        exceptionType,
      ),
    };
  }

  private resolveAccountingPayoutPriority(
    exceptionType: RetailAccountingPayoutExceptionTypeFilter,
    ageHours: number,
    failureReason: string | null,
  ): { level: 'CRITICAL' | 'HIGH' | 'NORMAL'; reason: string } {
    const normalizedReason = String(failureReason || '').toLowerCase();

    if (
      exceptionType ===
      RetailAccountingPayoutExceptionTypeFilter.AUTO_RETRY_REQUIRED
    ) {
      if (normalizedReason.includes('missing')) {
        return {
          level: 'CRITICAL',
          reason:
            'Vendor payout details are missing, so finance cannot retry the failed auto payout yet.',
        };
      }

      if (ageHours >= 24) {
        return {
          level: 'CRITICAL',
          reason:
            'Auto payout has been failing for more than 24 hours and needs immediate finance recovery.',
        };
      }

      return {
        level: 'HIGH',
        reason:
          'Auto payout failed and is ready for an admin retry before vendor settlement ages further.',
      };
    }

    if (ageHours >= 48) {
      return {
        level: 'CRITICAL',
        reason:
          'Provider payout succeeded but wallet debit has remained unreconciled for more than 48 hours.',
      };
    }

    if (ageHours >= 12) {
      return {
        level: 'HIGH',
        reason:
          'Provider payout succeeded but wallet debit still needs reconciliation attention.',
      };
    }

    return {
      level: 'NORMAL',
      reason:
        'Provider payout succeeded and is waiting for routine wallet-debit reconciliation.',
    };
  }

  private resolveAccountingPayoutVendorName(payout: PayoutLog): string {
    return (
      payout.vendor?.storeName ||
      payout.vendor?.legalName ||
      payout.vendor?.displayName ||
      payout.vendor?.email ||
      `Vendor ${payout.vendor?.id ?? ''}`
    ).trim();
  }

  private buildAccountingPayoutActions(
    payoutLogId: number,
    orderId: number,
    branchId: number,
    exceptionType: RetailAccountingPayoutExceptionTypeFilter,
  ): RetailAccountingActionResponseDto[] {
    return [
      {
        type: 'VIEW_POS_ORDER_DETAIL',
        method: 'GET',
        path: `/retail/v1/ops/pos-operations/orders/${orderId}?branchId=${branchId}`,
        body: null,
        enabled: true,
      },
      {
        type: 'RETRY_AUTO_PAYOUT',
        method: 'POST',
        path: `/admin/wallet/payouts/${payoutLogId}/retry-auto`,
        body: null,
        enabled:
          exceptionType ===
          RetailAccountingPayoutExceptionTypeFilter.AUTO_RETRY_REQUIRED,
      },
      {
        type: 'RECONCILE_PAYOUT_EXCEPTION',
        method: 'POST',
        path: `/admin/wallet/payouts/${payoutLogId}/reconcile-exception`,
        body: null,
        enabled:
          exceptionType ===
          RetailAccountingPayoutExceptionTypeFilter.RECONCILIATION_REQUIRED,
      },
    ];
  }

  private matchesAccountingPayoutExceptionType(
    item: RetailAccountingPayoutExceptionItemResponseDto,
    expected?: RetailAccountingPayoutExceptionTypeFilter,
  ): boolean {
    return !expected || item.exceptionType === expected;
  }

  private matchesAccountingPayoutPriority(
    priority: RetailAccountingPayoutExceptionItemResponseDto['priority'],
    expected?: RetailAccountingPayoutPriorityFilter,
  ): boolean {
    return !expected || priority === expected;
  }

  private compareAccountingPayoutExceptionItem(
    left: RetailAccountingPayoutExceptionItemResponseDto,
    right: RetailAccountingPayoutExceptionItemResponseDto,
  ): number {
    const priorityRank = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
    } as const;

    if (priorityRank[left.priority] !== priorityRank[right.priority]) {
      return priorityRank[left.priority] - priorityRank[right.priority];
    }

    if (right.ageHours !== left.ageHours) {
      return right.ageHours - left.ageHours;
    }

    return right.payoutLogId - left.payoutLogId;
  }

  private buildAccountingPayoutAlerts(
    summary: RetailAccountingPayoutExceptionsResponseDto['summary'],
    items: RetailAccountingPayoutExceptionItemResponseDto[],
  ): RetailAccountingAlertResponseDto[] {
    const alerts: RetailAccountingAlertResponseDto[] = [];

    if (summary.criticalCount > 0) {
      alerts.push({
        code: 'ACCOUNTING_PAYOUT_CRITICAL',
        severity: 'CRITICAL',
        title: 'Critical payout exceptions need immediate finance attention',
        summary:
          "At least one payout exception has breached the tenant's normal recovery window.",
        metric: summary.criticalCount,
        action:
          'Prioritize the oldest failed retries and unreconciled payout debits first.',
      });
    }

    if (summary.autoRetryRequiredCount > 0) {
      alerts.push({
        code: 'AUTO_PAYOUT_RETRY_BACKLOG',
        severity: summary.criticalCount > 0 ? 'CRITICAL' : 'WATCH',
        title: 'Failed auto payouts are queued for retry',
        summary:
          'One or more vendor payouts failed after payment capture and need retry or payout-detail correction.',
        metric: summary.autoRetryRequiredCount,
        action:
          'Open the failed auto-payout queue and retry the oldest recoverable items first.',
      });
    }

    if (summary.reconciliationRequiredCount > 0) {
      alerts.push({
        code: 'PAYOUT_RECONCILIATION_BACKLOG',
        severity: items.some(
          (item) =>
            item.exceptionType ===
              RetailAccountingPayoutExceptionTypeFilter.RECONCILIATION_REQUIRED &&
            item.priority === 'CRITICAL',
        )
          ? 'CRITICAL'
          : 'WATCH',
        title: 'Successful provider payouts still need wallet reconciliation',
        summary:
          'At least one provider payout succeeded but its wallet debit exception is still unresolved.',
        metric: summary.reconciliationRequiredCount,
        action:
          'Clear reconciliation-required payout debits before the finance audit queue grows.',
      });
    }

    if (alerts.length === 0 && items.length > 0) {
      alerts.push({
        code: 'ACCOUNTING_PAYOUT_STABLE',
        severity: 'INFO',
        title: 'No payout-exception SLA risks detected',
        summary:
          'Payout exceptions are present but remain within the expected operating window for recovery.',
        metric: items.length,
        action:
          'Continue clearing routine payout exceptions before they age into critical finance work.',
      });
    }

    return alerts;
  }

  private mapAccountingPayoutNetworkBranch(
    branch: Branch,
    items: RetailAccountingPayoutExceptionItemResponseDto[],
    windowHours: number,
    exceptionType?: RetailAccountingPayoutExceptionTypeFilter,
  ): RetailAccountingPayoutNetworkBranchResponseDto {
    const highestPriority = this.resolveAccountingPayoutNetworkPriority(items);
    const highestPriorityReason =
      this.resolveAccountingPayoutNetworkPriorityReason(highestPriority, items);

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code ?? null,
      highestPriority,
      highestPriorityReason,
      exceptionCount: items.length,
      autoRetryRequiredCount: items.filter(
        (item) =>
          item.exceptionType ===
          RetailAccountingPayoutExceptionTypeFilter.AUTO_RETRY_REQUIRED,
      ).length,
      reconciliationRequiredCount: items.filter(
        (item) =>
          item.exceptionType ===
          RetailAccountingPayoutExceptionTypeFilter.RECONCILIATION_REQUIRED,
      ).length,
      totalAmountAtRisk: items.reduce((sum, item) => sum + item.amount, 0),
      oldestExceptionAgeHours:
        items.length > 0
          ? Math.max(...items.map((item) => item.ageHours))
          : null,
      priorityQueue: {
        critical: items.filter((item) => item.priority === 'CRITICAL').length,
        high: items.filter((item) => item.priority === 'HIGH').length,
        normal: items.filter((item) => item.priority === 'NORMAL').length,
      },
      actions: [
        {
          type: 'VIEW_BRANCH_ACCOUNTING_PAYOUT_EXCEPTIONS',
          method: 'GET',
          path: `/retail/v1/ops/accounting-overview/payout-exceptions?branchId=${branch.id}&windowHours=${windowHours}${exceptionType ? `&exceptionType=${exceptionType}` : ''}`,
          body: null,
          enabled: true,
        },
      ],
    };
  }

  private resolveAccountingPayoutNetworkPriority(
    items: RetailAccountingPayoutExceptionItemResponseDto[],
  ): 'CRITICAL' | 'HIGH' | 'NORMAL' {
    if (items.some((item) => item.priority === 'CRITICAL')) {
      return 'CRITICAL';
    }
    if (items.some((item) => item.priority === 'HIGH')) {
      return 'HIGH';
    }
    return 'NORMAL';
  }

  private resolveAccountingPayoutNetworkPriorityReason(
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL',
    items: RetailAccountingPayoutExceptionItemResponseDto[],
  ): string {
    return (
      items.find((item) => item.priority === priority)?.priorityReason ??
      'Payout exception queues are within expected thresholds.'
    );
  }

  private matchesAccountingPayoutNetworkPriority(
    priority: RetailAccountingPayoutNetworkBranchResponseDto['highestPriority'],
    expected?: RetailAccountingPayoutPriorityFilter,
  ): boolean {
    return !expected || priority === expected;
  }

  private compareAccountingPayoutNetworkBranch(
    left: RetailAccountingPayoutNetworkBranchResponseDto,
    right: RetailAccountingPayoutNetworkBranchResponseDto,
  ): number {
    const priorityRank = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
    } as const;

    if (
      priorityRank[left.highestPriority] !== priorityRank[right.highestPriority]
    ) {
      return (
        priorityRank[left.highestPriority] - priorityRank[right.highestPriority]
      );
    }

    if (right.exceptionCount !== left.exceptionCount) {
      return right.exceptionCount - left.exceptionCount;
    }

    if (
      (right.oldestExceptionAgeHours ?? 0) !==
      (left.oldestExceptionAgeHours ?? 0)
    ) {
      return (
        (right.oldestExceptionAgeHours ?? 0) -
        (left.oldestExceptionAgeHours ?? 0)
      );
    }

    return right.totalAmountAtRisk - left.totalAmountAtRisk;
  }

  private buildAccountingPayoutNetworkAlerts(
    branches: RetailAccountingPayoutNetworkBranchResponseDto[],
  ): RetailAccountingAlertResponseDto[] {
    const alerts: RetailAccountingAlertResponseDto[] = [];
    const criticalBranches = branches.filter(
      (branch) => branch.highestPriority === 'CRITICAL',
    );
    const autoRetryBranches = branches.filter(
      (branch) => branch.autoRetryRequiredCount > 0,
    );
    const reconciliationBranches = branches.filter(
      (branch) => branch.reconciliationRequiredCount > 0,
    );

    if (criticalBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_ACCOUNTING_PAYOUT_CRITICAL',
        severity: 'CRITICAL',
        title: 'Critical payout-exception pressure spans multiple branches',
        summary:
          'At least one branch has payout recovery work that has aged beyond the normal finance window.',
        metric: criticalBranches.length,
        action:
          'Open the highest-priority branch payout queues first and clear blocked retries.',
      });
    }

    if (autoRetryBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_AUTO_PAYOUT_RETRY',
        severity: criticalBranches.length > 0 ? 'CRITICAL' : 'WATCH',
        title: 'Failed auto payouts are distributed across branches',
        summary:
          'Multiple branches have failed vendor payouts that need retry or vendor-detail correction.',
        metric: autoRetryBranches.length,
        action:
          'Review the failed auto-payout backlog branch by branch, starting with the oldest queue.',
      });
    }

    if (reconciliationBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_PAYOUT_RECONCILIATION',
        severity: 'WATCH',
        title: 'Wallet-debit reconciliation is pending across branches',
        summary:
          'Provider payouts succeeded in multiple branches but still need finance reconciliation in the wallet ledger.',
        metric: reconciliationBranches.length,
        action:
          'Clear reconciliation-required payout exceptions before they become finance audit escalations.',
      });
    }

    if (alerts.length === 0 && branches.length > 0) {
      alerts.push({
        code: 'NETWORK_ACCOUNTING_PAYOUT_STABLE',
        severity: 'INFO',
        title: 'Payout exception queues are within expected thresholds',
        summary:
          'No tenant-level payout retry or reconciliation backlog alerts were detected.',
        metric: branches.length,
        action:
          'Continue clearing routine payout exceptions before they age into critical recovery work.',
      });
    }

    return alerts;
  }

  private normalizePosWindowHours(windowHours?: number | null): number {
    const normalized = Number(windowHours ?? 24);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return 24;
    }

    return Math.min(Math.max(Math.trunc(normalized), 1), 168);
  }

  private normalizePosTopItemsLimit(topItemsLimit?: number | null): number {
    const normalized = Number(topItemsLimit ?? 5);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return 5;
    }

    return Math.min(Math.max(Math.trunc(normalized), 1), 10);
  }

  private getPosWindowStart(windowHours: number): Date {
    return new Date(Date.now() - windowHours * 60 * 60 * 1000);
  }

  private isPosOrderOpen(status: OrderStatus): boolean {
    return [
      OrderStatus.PENDING,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
    ].includes(status);
  }

  private isPosOrderCancelled(status: OrderStatus): boolean {
    return [
      OrderStatus.CANCELLED,
      OrderStatus.CANCELLED_BY_BUYER,
      OrderStatus.CANCELLED_BY_SELLER,
    ].includes(status);
  }

  private getPosDelayedThresholdHours(windowHours: number): number {
    return Math.min(Math.max(Math.floor(windowHours / 2), 12), 48);
  }

  private mapPosOperationsSummary(
    branchId: number,
    windowHours: number,
    orders: Order[],
    staffAssignments: BranchStaffAssignment[],
  ): RetailPosOperationsSummaryResponseDto {
    const delayedThresholdHours = this.getPosDelayedThresholdHours(windowHours);
    const grossSales = orders.reduce(
      (sum, order) => sum + Number(order.total ?? 0),
      0,
    );
    const paidSales = orders.reduce(
      (sum, order) =>
        sum +
        (order.paymentStatus === PaymentStatus.PAID
          ? Number(order.total ?? 0)
          : 0),
      0,
    );
    const latestOrder =
      [...orders].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0] ?? null;
    const managers = staffAssignments.filter(
      (assignment) => assignment.role === BranchStaffRole.MANAGER,
    ).length;
    const operators = staffAssignments.filter(
      (assignment) => assignment.role === BranchStaffRole.OPERATOR,
    ).length;

    return {
      branchId,
      windowHours,
      orderCount: orders.length,
      grossSales,
      paidSales,
      averageOrderValue:
        orders.length > 0 ? Number((grossSales / orders.length).toFixed(2)) : 0,
      paidOrderCount: orders.filter(
        (order) => order.paymentStatus === PaymentStatus.PAID,
      ).length,
      unpaidOrderCount: orders.filter(
        (order) => order.paymentStatus === PaymentStatus.UNPAID,
      ).length,
      failedPaymentOrderCount: orders.filter(
        (order) => order.paymentStatus === PaymentStatus.FAILED,
      ).length,
      openOrderCount: orders.filter((order) =>
        this.isPosOrderOpen(order.status),
      ).length,
      delayedFulfillmentOrderCount: orders.filter(
        (order) =>
          this.isPosOrderOpen(order.status) &&
          this.calculateOrderAgeHours(order.createdAt) >= delayedThresholdHours,
      ).length,
      deliveredOrderCount: orders.filter(
        (order) => order.status === OrderStatus.DELIVERED,
      ).length,
      cancelledOrderCount: orders.filter((order) =>
        this.isPosOrderCancelled(order.status),
      ).length,
      activeStaffCount: staffAssignments.length,
      managerCount: managers,
      operatorCount: operators,
      lastOrderAt: latestOrder?.createdAt ?? null,
    };
  }

  private buildPosOperationsAlerts(
    summary: RetailPosOperationsSummaryResponseDto,
  ): RetailPosOperationsAlertResponseDto[] {
    const alerts: RetailPosOperationsAlertResponseDto[] = [];

    if (summary.failedPaymentOrderCount > 0) {
      alerts.push({
        code: 'FAILED_PAYMENT_RECOVERY',
        severity: 'CRITICAL',
        title: 'Failed POS payments need recovery',
        summary:
          'At least one order in the current window failed payment and needs cashier follow-up.',
        metric: summary.failedPaymentOrderCount,
        action:
          'Review failed-payment orders and re-contact customers before the queue ages out.',
      });
    }

    if (summary.delayedFulfillmentOrderCount > 0) {
      alerts.push({
        code: 'FULFILLMENT_BACKLOG',
        severity:
          summary.delayedFulfillmentOrderCount >= 3 ? 'CRITICAL' : 'WATCH',
        title: 'Open branch orders are aging in the fulfillment queue',
        summary:
          'Some orders have remained open long enough to suggest packing, handoff, or dispatch delays.',
        metric: summary.delayedFulfillmentOrderCount,
        action:
          'Clear the oldest open orders first and verify whether dispatch or payment confirmation is blocked.',
      });
    }

    if (summary.unpaidOrderCount > 0) {
      alerts.push({
        code: 'UNPAID_ORDER_BACKLOG',
        severity: 'WATCH',
        title: 'Unpaid orders are building inside the branch queue',
        summary:
          'The branch still has orders awaiting payment completion or manual proof review.',
        metric: summary.unpaidOrderCount,
        action:
          'Review unpaid orders and confirm whether proof collection or payment method routing needs intervention.',
      });
    }

    if (summary.orderCount === 0) {
      alerts.push({
        code: 'SALES_IDLE_WINDOW',
        severity: summary.activeStaffCount > 0 ? 'WATCH' : 'INFO',
        title: 'No branch sales landed in the current POS window',
        summary:
          'The current reporting window shows no completed branch order traffic.',
        metric: 0,
        action:
          'Verify whether the branch is intentionally quiet or whether cashier intake is routing elsewhere.',
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        code: 'POS_OPERATIONS_STABLE',
        severity: 'INFO',
        title: 'POS operations are within expected thresholds',
        summary:
          'No payment recovery, fulfillment backlog, or idle-window alerts were detected for this branch snapshot.',
        metric: summary.orderCount,
        action:
          'Keep monitoring payment and fulfillment throughput as new branch demand arrives.',
      });
    }

    return alerts;
  }

  private buildPosPaymentMix(
    orders: Order[],
  ): RetailPosOperationsPaymentMixResponseDto[] {
    const mix = new Map<
      PaymentMethod,
      RetailPosOperationsPaymentMixResponseDto
    >();

    for (const order of orders) {
      const current = mix.get(order.paymentMethod) ?? {
        paymentMethod: order.paymentMethod,
        orderCount: 0,
        grossSales: 0,
        paidOrderCount: 0,
      };

      current.orderCount += 1;
      current.grossSales += Number(order.total ?? 0);
      if (order.paymentStatus === PaymentStatus.PAID) {
        current.paidOrderCount += 1;
      }

      mix.set(order.paymentMethod, current);
    }

    return [...mix.values()].sort((left, right) => {
      if (right.grossSales !== left.grossSales) {
        return right.grossSales - left.grossSales;
      }

      return right.orderCount - left.orderCount;
    });
  }

  private buildPosStatusMix(
    orders: Order[],
  ): RetailPosOperationsStatusMixResponseDto[] {
    const mix = new Map<OrderStatus, RetailPosOperationsStatusMixResponseDto>();

    for (const order of orders) {
      const current = mix.get(order.status) ?? {
        status: order.status,
        orderCount: 0,
        grossSales: 0,
      };

      current.orderCount += 1;
      current.grossSales += Number(order.total ?? 0);
      mix.set(order.status, current);
    }

    return [...mix.values()].sort((left, right) => {
      if (right.orderCount !== left.orderCount) {
        return right.orderCount - left.orderCount;
      }

      return right.grossSales - left.grossSales;
    });
  }

  private buildPosTopItems(
    orders: Order[],
    topItemsLimit: number,
  ): RetailPosOperationsTopItemResponseDto[] {
    const topItems = new Map<string, RetailPosOperationsTopItemResponseDto>();

    for (const order of orders) {
      for (const item of order.items ?? []) {
        const productId = item.product?.id ?? null;
        const productName =
          item.product?.name ??
          (productId ? `Product ${productId}` : 'Unknown product');
        const key =
          productId != null
            ? String(productId)
            : `${productName}:${item.price}`;
        const current = topItems.get(key) ?? {
          productId,
          productName,
          quantity: 0,
          grossSales: 0,
        };

        current.quantity += Number(item.quantity ?? 0);
        current.grossSales +=
          Number(item.quantity ?? 0) * Number(item.price ?? 0);
        topItems.set(key, current);
      }
    }

    return [...topItems.values()]
      .sort((left, right) => {
        if (right.grossSales !== left.grossSales) {
          return right.grossSales - left.grossSales;
        }

        return right.quantity - left.quantity;
      })
      .slice(0, topItemsLimit);
  }

  private mapPosNetworkBranch(
    branch: Branch,
    summary: RetailPosOperationsSummaryResponseDto,
  ): RetailPosNetworkSummaryBranchResponseDto {
    const highestPriority = this.resolvePosNetworkBranchPriority(summary);

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code ?? null,
      highestPriority,
      highestPriorityReason: this.resolvePosNetworkBranchPriorityReason(
        highestPriority,
        summary,
      ),
      orderCount: summary.orderCount,
      grossSales: summary.grossSales,
      paidSales: summary.paidSales,
      averageOrderValue: summary.averageOrderValue,
      unpaidOrderCount: summary.unpaidOrderCount,
      failedPaymentOrderCount: summary.failedPaymentOrderCount,
      delayedFulfillmentOrderCount: summary.delayedFulfillmentOrderCount,
      activeStaffCount: summary.activeStaffCount,
      lastOrderAt: summary.lastOrderAt,
      actions: [
        {
          type: 'VIEW_BRANCH_POS_OPERATIONS',
          method: 'GET',
          path: `/retail/v1/ops/pos-operations?branchId=${branch.id}&windowHours=${summary.windowHours}`,
          body: null,
          enabled: true,
        },
      ],
    };
  }

  private resolvePosNetworkBranchPriority(
    summary: RetailPosOperationsSummaryResponseDto,
  ): 'CRITICAL' | 'HIGH' | 'NORMAL' {
    if (
      summary.failedPaymentOrderCount > 0 ||
      summary.delayedFulfillmentOrderCount >= 2
    ) {
      return 'CRITICAL';
    }

    if (
      summary.delayedFulfillmentOrderCount > 0 ||
      summary.unpaidOrderCount > 0 ||
      (summary.orderCount === 0 && summary.activeStaffCount > 0)
    ) {
      return 'HIGH';
    }

    return 'NORMAL';
  }

  private resolvePosNetworkBranchPriorityReason(
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL',
    summary: RetailPosOperationsSummaryResponseDto,
  ): string {
    if (priority === 'CRITICAL' && summary.failedPaymentOrderCount > 0) {
      return `${summary.failedPaymentOrderCount} orders need failed-payment recovery.`;
    }

    if (priority === 'CRITICAL') {
      return `${summary.delayedFulfillmentOrderCount} open orders have breached the branch fulfillment threshold.`;
    }

    if (summary.delayedFulfillmentOrderCount > 0) {
      return `${summary.delayedFulfillmentOrderCount} open orders are aging and need branch follow-up.`;
    }

    if (summary.unpaidOrderCount > 0) {
      return `${summary.unpaidOrderCount} orders are still awaiting payment completion.`;
    }

    if (summary.orderCount === 0 && summary.activeStaffCount > 0) {
      return 'The branch has active staff assignments but no orders in the selected window.';
    }

    return 'POS operations are within normal payment and fulfillment thresholds.';
  }

  private matchesPosNetworkStatus(
    actual: RetailPosNetworkSummaryBranchResponseDto['highestPriority'],
    expected?: RetailPosNetworkStatusFilter,
  ): boolean {
    return !expected || actual === expected;
  }

  private comparePosNetworkBranch(
    left: RetailPosNetworkSummaryBranchResponseDto,
    right: RetailPosNetworkSummaryBranchResponseDto,
  ): number {
    const priorityRank = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
    } as const;

    if (
      priorityRank[left.highestPriority] !== priorityRank[right.highestPriority]
    ) {
      return (
        priorityRank[left.highestPriority] - priorityRank[right.highestPriority]
      );
    }

    if (
      right.delayedFulfillmentOrderCount !== left.delayedFulfillmentOrderCount
    ) {
      return (
        right.delayedFulfillmentOrderCount - left.delayedFulfillmentOrderCount
      );
    }

    if (right.failedPaymentOrderCount !== left.failedPaymentOrderCount) {
      return right.failedPaymentOrderCount - left.failedPaymentOrderCount;
    }

    return right.grossSales - left.grossSales;
  }

  private buildPosNetworkAlerts(
    branches: RetailPosNetworkSummaryBranchResponseDto[],
  ): RetailPosOperationsAlertResponseDto[] {
    const alerts: RetailPosOperationsAlertResponseDto[] = [];
    const criticalBranches = branches.filter(
      (branch) => branch.highestPriority === 'CRITICAL',
    );
    const delayedBranches = branches.filter(
      (branch) => branch.delayedFulfillmentOrderCount > 0,
    );
    const idleBranches = branches.filter(
      (branch) => branch.orderCount === 0 && branch.activeStaffCount > 0,
    );

    if (criticalBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_POS_CRITICAL_BRANCHES',
        severity: 'CRITICAL',
        title: 'Critical POS recovery pressure spans multiple branches',
        summary:
          'At least one branch has failed payments or overdue open orders that need immediate action.',
        metric: criticalBranches.length,
        action:
          'Open the highest-priority branch POS snapshots first and clear failed-payment recovery before the backlog widens.',
      });
    }

    if (delayedBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_POS_FULFILLMENT_BACKLOG',
        severity: delayedBranches.some(
          (branch) => branch.delayedFulfillmentOrderCount >= 2,
        )
          ? 'CRITICAL'
          : 'WATCH',
        title: 'Fulfillment backlog is visible across the POS network',
        summary:
          'Open orders are aging across one or more branches and may signal dispatch or cashier bottlenecks.',
        metric: delayedBranches.length,
        action:
          'Review the oldest open orders by branch and confirm whether payment confirmation or handoff flow is blocking release.',
      });
    }

    if (idleBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_POS_IDLE_BRANCHES',
        severity: 'WATCH',
        title:
          'Some staffed branches show no POS traffic in the selected window',
        summary:
          'At least one branch has active staff assignments but no recent order throughput.',
        metric: idleBranches.length,
        action:
          'Confirm whether intake is intentionally quiet or whether branch sales are routing outside the expected checkout path.',
      });
    }

    if (alerts.length === 0 && branches.length > 0) {
      alerts.push({
        code: 'NETWORK_POS_STABLE',
        severity: 'INFO',
        title: 'POS throughput is within expected thresholds',
        summary:
          'No tenant-level payment recovery or fulfillment backlog alerts were detected in the selected window.',
        metric: branches.length,
        action:
          'Keep monitoring branch sales throughput as demand shifts across the network.',
      });
    }

    return alerts;
  }

  private mapPosExceptionItem(
    order: Order,
    windowHours: number,
  ): RetailPosExceptionItemResponseDto | null {
    const queue = this.resolvePosExceptionQueue(order, windowHours);
    if (!queue) {
      return null;
    }

    return {
      orderId: order.id,
      queueType: queue.queueType,
      priority: queue.priority,
      priorityReason: queue.reason,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentProofStatus: order.paymentProofStatus ?? null,
      total: Number(order.total ?? 0),
      itemCount: order.items?.length ?? 0,
      ageHours: this.calculateOrderAgeHours(order.createdAt),
      createdAt: order.createdAt,
      deliveryAssignedAt: order.deliveryAssignedAt ?? null,
      outForDeliveryAt: order.outForDeliveryAt ?? null,
      deliveryResolvedAt: order.deliveryResolvedAt ?? null,
      customerName: order.shippingAddress?.fullName ?? null,
      customerPhoneNumber: order.shippingAddress?.phoneNumber ?? null,
      actions: this.buildPosOrderActions(order, queue.queueType),
    };
  }

  private resolvePosExceptionQueue(
    order: Order,
    windowHours: number,
  ): {
    queueType: RetailPosExceptionQueueFilter;
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
    reason: string;
  } | null {
    const ageHours = this.calculateOrderAgeHours(order.createdAt);
    const delayedThresholdHours = this.getPosDelayedThresholdHours(windowHours);
    const reviewEligibleMethods = new Set<PaymentMethod>([
      PaymentMethod.BANK_TRANSFER,
      PaymentMethod.CBE,
      PaymentMethod.WAAFI,
      PaymentMethod.DMONEY,
    ]);

    if (order.paymentStatus === PaymentStatus.FAILED) {
      return {
        queueType: RetailPosExceptionQueueFilter.FAILED_PAYMENT,
        priority: ageHours >= 12 ? 'CRITICAL' : 'HIGH',
        reason: `Payment failed ${ageHours} hours ago and still needs branch recovery.`,
      };
    }

    if (
      reviewEligibleMethods.has(order.paymentMethod) &&
      order.paymentProofStatus === 'PENDING_REVIEW'
    ) {
      return {
        queueType: RetailPosExceptionQueueFilter.PAYMENT_REVIEW,
        priority: ageHours >= 24 ? 'CRITICAL' : 'HIGH',
        reason: `Payment proof has been waiting ${ageHours} hours for admin review.`,
      };
    }

    if (
      this.isPosOrderOpen(order.status) &&
      ageHours >= delayedThresholdHours
    ) {
      return {
        queueType: RetailPosExceptionQueueFilter.FULFILLMENT_DELAY,
        priority:
          ageHours >= Math.max(delayedThresholdHours * 2, 24)
            ? 'CRITICAL'
            : 'HIGH',
        reason: `Order has remained open for ${ageHours} hours and exceeded the branch fulfillment threshold.`,
      };
    }

    return null;
  }

  private buildPosOrderActions(
    order: Order,
    queueType: RetailPosExceptionQueueFilter | null,
  ): RetailPosOperationsActionResponseDto[] {
    const actions: RetailPosOperationsActionResponseDto[] = [
      {
        type: 'VIEW_POS_ORDER_DETAIL',
        method: 'GET',
        path: `/retail/v1/ops/pos-operations/orders/${order.id}?branchId=${order.fulfillmentBranchId ?? ''}`,
        body: null,
        enabled: order.fulfillmentBranchId != null,
      },
      {
        type: 'CANCEL_ORDER',
        method: 'PATCH',
        path: `/admin/orders/${order.id}/cancel`,
        body: null,
        enabled: this.isPosOrderOpen(order.status),
      },
    ];

    if (queueType === RetailPosExceptionQueueFilter.FAILED_PAYMENT) {
      actions.push({
        type: 'APPROVE_BANK_TRANSFER',
        method: 'POST',
        path: `/admin/orders/${order.id}/approve-payment`,
        body: null,
        enabled: order.paymentMethod === PaymentMethod.BANK_TRANSFER,
      });

      actions.push({
        type: 'SYNC_EBIRR_STATUS',
        method: 'GET',
        path: `/payments/ebirr/sync-status/${order.id}`,
        body: null,
        enabled: order.paymentMethod === PaymentMethod.EBIRR,
      });
    }

    if (queueType === RetailPosExceptionQueueFilter.PAYMENT_REVIEW) {
      actions.push({
        type: 'VIEW_PAYMENT_PROOF',
        method: 'GET',
        path: `/admin/orders/${order.id}/payment-proof/signed`,
        body: null,
        enabled: Boolean(order.paymentProofStatus),
      });
      actions.push({
        type: 'VERIFY_PAYMENT_PROOF',
        method: 'PATCH',
        path: `/admin/orders/${order.id}/payment-proof/status`,
        body: { status: 'VERIFIED' },
        enabled: order.paymentProofStatus === 'PENDING_REVIEW',
      });
      actions.push({
        type: 'REJECT_PAYMENT_PROOF',
        method: 'PATCH',
        path: `/admin/orders/${order.id}/payment-proof/status`,
        body: { status: 'REJECTED' },
        enabled: order.paymentProofStatus === 'PENDING_REVIEW',
      });
    }

    return actions;
  }

  private matchesPosExceptionQueue(
    actual: RetailPosExceptionQueueFilter,
    expected?: RetailPosExceptionQueueFilter,
  ): boolean {
    return !expected || actual === expected;
  }

  private matchesPosExceptionPriority(
    actual: RetailPosExceptionItemResponseDto['priority'],
    expected?: RetailPosExceptionPriorityFilter,
  ): boolean {
    return !expected || actual === expected;
  }

  private comparePosExceptionItem(
    left: RetailPosExceptionItemResponseDto,
    right: RetailPosExceptionItemResponseDto,
  ): number {
    const priorityRank = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
    } as const;
    const queueRank = {
      FAILED_PAYMENT: 0,
      PAYMENT_REVIEW: 1,
      FULFILLMENT_DELAY: 2,
    } as const;

    if (priorityRank[left.priority] !== priorityRank[right.priority]) {
      return priorityRank[left.priority] - priorityRank[right.priority];
    }

    if (queueRank[left.queueType] !== queueRank[right.queueType]) {
      return queueRank[left.queueType] - queueRank[right.queueType];
    }

    if (right.ageHours !== left.ageHours) {
      return right.ageHours - left.ageHours;
    }

    return right.total - left.total;
  }

  private mapPosExceptionNetworkBranch(
    branch: Branch,
    items: RetailPosExceptionItemResponseDto[],
    windowHours: number,
  ): RetailPosExceptionNetworkBranchResponseDto {
    const highestPriority = this.resolvePosExceptionNetworkPriority(items);
    const highestPriorityReason = this.resolvePosExceptionNetworkPriorityReason(
      highestPriority,
      items,
    );
    const lastOrderAt =
      items
        .map((item) => item.createdAt)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const oldestExceptionAgeHours =
      items.length > 0 ? Math.max(...items.map((item) => item.ageHours)) : null;

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code ?? null,
      highestPriority,
      highestPriorityReason,
      exceptionCount: items.length,
      failedPaymentCount: items.filter(
        (item) =>
          item.queueType === RetailPosExceptionQueueFilter.FAILED_PAYMENT,
      ).length,
      paymentReviewCount: items.filter(
        (item) =>
          item.queueType === RetailPosExceptionQueueFilter.PAYMENT_REVIEW,
      ).length,
      delayedFulfillmentCount: items.filter(
        (item) =>
          item.queueType === RetailPosExceptionQueueFilter.FULFILLMENT_DELAY,
      ).length,
      criticalCount: items.filter((item) => item.priority === 'CRITICAL')
        .length,
      highCount: items.filter((item) => item.priority === 'HIGH').length,
      normalCount: items.filter((item) => item.priority === 'NORMAL').length,
      oldestExceptionAgeHours,
      lastOrderAt,
      actions: [
        {
          type: 'VIEW_BRANCH_POS_EXCEPTIONS',
          method: 'GET',
          path: `/retail/v1/ops/pos-operations/exceptions?branchId=${branch.id}&windowHours=${windowHours}`,
          body: null,
          enabled: true,
        },
      ],
    };
  }

  private resolvePosExceptionNetworkPriority(
    items: RetailPosExceptionItemResponseDto[],
  ): 'CRITICAL' | 'HIGH' | 'NORMAL' {
    if (items.some((item) => item.priority === 'CRITICAL')) {
      return 'CRITICAL';
    }
    if (items.some((item) => item.priority === 'HIGH')) {
      return 'HIGH';
    }
    return 'NORMAL';
  }

  private resolvePosExceptionNetworkPriorityReason(
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL',
    items: RetailPosExceptionItemResponseDto[],
  ): string {
    return (
      items.find((item) => item.priority === priority)?.priorityReason ??
      'POS exception pressure is within expected thresholds.'
    );
  }

  private comparePosExceptionNetworkBranch(
    left: RetailPosExceptionNetworkBranchResponseDto,
    right: RetailPosExceptionNetworkBranchResponseDto,
  ): number {
    const priorityRank = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
    } as const;

    if (
      priorityRank[left.highestPriority] !== priorityRank[right.highestPriority]
    ) {
      return (
        priorityRank[left.highestPriority] - priorityRank[right.highestPriority]
      );
    }

    if (right.exceptionCount !== left.exceptionCount) {
      return right.exceptionCount - left.exceptionCount;
    }

    return (
      (right.oldestExceptionAgeHours ?? 0) - (left.oldestExceptionAgeHours ?? 0)
    );
  }

  private buildPosExceptionNetworkAlerts(
    branches: RetailPosExceptionNetworkBranchResponseDto[],
  ): RetailPosOperationsAlertResponseDto[] {
    const alerts: RetailPosOperationsAlertResponseDto[] = [];
    const criticalBranches = branches.filter(
      (branch) => branch.highestPriority === 'CRITICAL',
    );
    const failedPaymentBranches = branches.filter(
      (branch) => branch.failedPaymentCount > 0,
    );
    const paymentReviewBranches = branches.filter(
      (branch) => branch.paymentReviewCount > 0,
    );
    const delayedBranches = branches.filter(
      (branch) => branch.delayedFulfillmentCount > 0,
    );

    if (criticalBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_POS_EXCEPTION_CRITICAL',
        severity: 'CRITICAL',
        title: 'Critical POS exception pressure spans multiple branches',
        summary:
          'At least one branch has payment or fulfillment exceptions requiring immediate operator action.',
        metric: criticalBranches.length,
        action:
          'Open the highest-priority branch exception queues first and clear the oldest payment failures or review backlog.',
      });
    }

    if (failedPaymentBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_POS_FAILED_PAYMENT_RECOVERY',
        severity: 'WATCH',
        title: 'Failed payment recovery is active across branches',
        summary:
          'One or more branches still carry failed customer payments that need follow-up or manual recovery.',
        metric: failedPaymentBranches.length,
        action:
          'Clear failed-payment queues before customers or staff reattempt checkout outside the tracked flow.',
      });
    }

    if (paymentReviewBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_POS_PAYMENT_REVIEW_BACKLOG',
        severity: 'WATCH',
        title: 'Payment proof review backlog is visible across branches',
        summary:
          'At least one branch has bank-transfer proof still waiting on admin review.',
        metric: paymentReviewBranches.length,
        action:
          'Approve or reject the oldest payment proofs to unblock fulfillment release.',
      });
    }

    if (delayedBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_POS_FULFILLMENT_DELAY',
        severity: delayedBranches.some(
          (branch) => (branch.oldestExceptionAgeHours ?? 0) >= 24,
        )
          ? 'CRITICAL'
          : 'WATCH',
        title: 'Delayed POS fulfillment is building across branches',
        summary:
          'Open orders are aging beyond the branch threshold in one or more branch queues.',
        metric: delayedBranches.length,
        action:
          'Prioritize the branches with the oldest delayed fulfillment orders first.',
      });
    }

    if (alerts.length === 0 && branches.length > 0) {
      alerts.push({
        code: 'NETWORK_POS_EXCEPTION_STABLE',
        severity: 'INFO',
        title: 'POS exception queues are within expected thresholds',
        summary:
          'No tenant-level payment or fulfillment exception pressure was detected in the selected window.',
        metric: branches.length,
        action: 'Keep monitoring branch exception queues as new orders arrive.',
      });
    }

    return alerts;
  }

  private escapeCsvValue(value: string): string {
    return JSON.stringify(value ?? '');
  }

  private formatCsvDate(value: Date | null | undefined): string {
    return value instanceof Date
      ? this.escapeCsvValue(value.toISOString())
      : '';
  }

  private buildPosCommandCenterModule(
    branchId: number,
    summary: RetailPosNetworkSummaryResponseDto,
  ): RetailCommandCenterModuleSummaryResponseDto {
    const status =
      summary.criticalBranchCount > 0
        ? 'CRITICAL'
        : summary.highBranchCount > 0
          ? 'HIGH'
          : 'NORMAL';

    return {
      module: RetailOsModule.POS_CORE,
      title: 'POS operations',
      status,
      statusReason:
        summary.criticalBranchCount > 0
          ? `${summary.criticalBranchCount} branches need immediate POS payment or fulfillment recovery.`
          : summary.highBranchCount > 0
            ? `${summary.highBranchCount} branches are carrying elevated POS queue pressure.`
            : 'POS sales, payments, and fulfillment are within expected thresholds.',
      branchCount: summary.branchCount,
      alertCount: summary.alerts.length,
      topAlert: this.mapCommandCenterAlert(
        RetailOsModule.POS_CORE,
        summary.alerts[0] ?? null,
      ),
      metrics: [
        this.createCommandCenterMetric(
          'delayedOrders',
          'Delayed open orders',
          summary.totalDelayedFulfillmentOrderCount,
        ),
        this.createCommandCenterMetric(
          'failedPayments',
          'Failed payments',
          summary.totalFailedPaymentOrderCount,
        ),
        this.createCommandCenterMetric(
          'grossSales',
          'Gross sales',
          summary.totalGrossSales,
        ),
      ],
      actions: this.buildCommandCenterActions(
        branchId,
        'pos-operations/network-summary',
        'VIEW_POS_NETWORK_SUMMARY',
        'pos-operations/network-summary/export',
        'EXPORT_POS_NETWORK_SUMMARY',
      ),
      branchPreviews: summary.branches.map((branch) => ({
        branchId: branch.branchId,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        status: branch.highestPriority,
        statusReason: branch.highestPriorityReason,
        actionPath: branch.actions[0]?.path ?? null,
      })),
      trend: this.buildDefaultCommandCenterTrend(),
    };
  }

  private buildStockHealthCommandCenterModule(
    branchId: number,
    summary: RetailStockHealthNetworkSummaryResponseDto,
  ): RetailCommandCenterModuleSummaryResponseDto {
    const status =
      summary.outOfStockBranchCount > 0 || summary.negativeAvailableCount > 0
        ? 'CRITICAL'
        : summary.reorderNowBranchCount > 0 || summary.lowStockBranchCount > 0
          ? 'HIGH'
          : 'NORMAL';

    return {
      module: RetailOsModule.INVENTORY_CORE,
      title: 'Inventory health',
      status,
      statusReason:
        summary.outOfStockBranchCount > 0
          ? `${summary.outOfStockBranchCount} branches are already in stockout conditions.`
          : summary.reorderNowBranchCount > 0
            ? `${summary.reorderNowBranchCount} branches need immediate reorder action.`
            : 'Inventory health is operating within target thresholds.',
      branchCount: summary.branchCount,
      alertCount: summary.alerts.length,
      topAlert: this.mapCommandCenterAlert(
        RetailOsModule.INVENTORY_CORE,
        summary.alerts[0] ?? null,
      ),
      metrics: [
        this.createCommandCenterMetric(
          'outOfStockBranches',
          'Out-of-stock branches',
          summary.outOfStockBranchCount,
        ),
        this.createCommandCenterMetric(
          'outOfStockSkus',
          'Out-of-stock SKUs',
          summary.outOfStockCount,
        ),
        this.createCommandCenterMetric(
          'negativeAvailability',
          'Negative availability SKUs',
          summary.negativeAvailableCount,
        ),
      ],
      actions: this.buildCommandCenterActions(
        branchId,
        'stock-health/network-summary',
        'VIEW_STOCK_HEALTH_NETWORK_SUMMARY',
        'stock-health/network-summary/export',
        'EXPORT_STOCK_HEALTH_NETWORK_SUMMARY',
      ),
      branchPreviews: summary.branches.map((branch) => ({
        branchId: branch.branchId,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        status: branch.worstStockStatus,
        statusReason: branch.worstStockStatusReason,
        actionPath: branch.actions[0]?.path ?? null,
      })),
      trend: this.buildDefaultCommandCenterTrend(),
    };
  }

  private buildAiCommandCenterModule(
    branchId: number,
    summary: RetailAiNetworkSummaryResponseDto,
  ): RetailCommandCenterModuleSummaryResponseDto {
    const status =
      summary.criticalBranchCount > 0
        ? 'CRITICAL'
        : summary.watchBranchCount > 0
          ? 'HIGH'
          : 'NORMAL';

    return {
      module: RetailOsModule.AI_ANALYTICS,
      title: 'AI operating risk',
      status,
      statusReason:
        summary.criticalBranchCount > 0
          ? `${summary.criticalBranchCount} branches are carrying critical AI risk signals.`
          : summary.watchBranchCount > 0
            ? `${summary.watchBranchCount} branches remain on the AI watchlist.`
            : 'AI operating signals are currently stable across the network.',
      branchCount: summary.branchCount,
      alertCount: summary.alerts.length,
      topAlert: this.mapCommandCenterAlert(
        RetailOsModule.AI_ANALYTICS,
        summary.alerts[0] ?? null,
      ),
      metrics: [
        this.createCommandCenterMetric(
          'averageHealthScore',
          'Average health score',
          summary.averageHealthScore,
        ),
        this.createCommandCenterMetric(
          'criticalBranches',
          'Critical branches',
          summary.criticalBranchCount,
        ),
        this.createCommandCenterMetric(
          'atRiskSkus',
          'At-risk SKUs',
          summary.totalAtRiskSkus,
        ),
      ],
      actions: this.buildCommandCenterActions(
        branchId,
        'ai-insights/network-summary',
        'VIEW_AI_NETWORK_SUMMARY',
        'ai-insights/network-summary/export',
        'EXPORT_AI_NETWORK_SUMMARY',
      ),
      branchPreviews: summary.branches.map((branch) => ({
        branchId: branch.branchId,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        status: branch.highestSeverity,
        statusReason: branch.highestSeverityReason,
        actionPath: branch.actions[0]?.path ?? null,
      })),
      trend: this.buildDefaultCommandCenterTrend(),
    };
  }

  private buildAccountingCommandCenterModule(
    branchId: number,
    summary: RetailAccountingNetworkSummaryResponseDto,
  ): RetailCommandCenterModuleSummaryResponseDto {
    const status =
      summary.criticalBranchCount > 0
        ? 'CRITICAL'
        : summary.highBranchCount > 0
          ? 'HIGH'
          : 'NORMAL';

    return {
      module: RetailOsModule.ACCOUNTING,
      title: 'Accounting queue',
      status,
      statusReason:
        summary.criticalBranchCount > 0
          ? `${summary.criticalBranchCount} branches have critical reconciliation pressure.`
          : summary.highBranchCount > 0
            ? `${summary.highBranchCount} branches need elevated accounting attention.`
            : 'Accounting queues are currently within normal operating thresholds.',
      branchCount: summary.branchCount,
      alertCount: summary.alerts.length,
      topAlert: this.mapCommandCenterAlert(
        RetailOsModule.ACCOUNTING,
        summary.alerts[0] ?? null,
      ),
      metrics: [
        this.createCommandCenterMetric(
          'openCommitments',
          'Open commitments',
          summary.openCommitmentCount,
        ),
        this.createCommandCenterMetric(
          'openDiscrepancies',
          'Open discrepancies',
          summary.discrepancyOpenCount,
        ),
        this.createCommandCenterMetric(
          'reconcileReady',
          'Reconcile-ready receipts',
          summary.reconcileReadyCount,
        ),
      ],
      actions: this.buildCommandCenterActions(
        branchId,
        'accounting-overview/network-summary',
        'VIEW_ACCOUNTING_NETWORK_SUMMARY',
        'accounting-overview/network-summary/export',
        'EXPORT_ACCOUNTING_NETWORK_SUMMARY',
      ),
      branchPreviews: summary.branches.map((branch) => ({
        branchId: branch.branchId,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        status: branch.highestPriority,
        statusReason: branch.highestPriorityReason,
        actionPath: branch.actions[0]?.path ?? null,
      })),
      trend: this.buildDefaultCommandCenterTrend(),
    };
  }

  private buildDesktopCommandCenterModule(
    branchId: number,
    summary: RetailDesktopNetworkSummaryResponseDto,
  ): RetailCommandCenterModuleSummaryResponseDto {
    const status =
      summary.criticalBranchCount > 0
        ? 'CRITICAL'
        : summary.highBranchCount > 0
          ? 'HIGH'
          : 'NORMAL';

    return {
      module: RetailOsModule.DESKTOP_BACKOFFICE,
      title: 'Desktop back office',
      status,
      statusReason:
        summary.criticalBranchCount > 0
          ? `${summary.criticalBranchCount} branches have critical sync or transfer recovery pressure.`
          : summary.highBranchCount > 0
            ? `${summary.highBranchCount} branches have elevated desktop queue pressure.`
            : 'Desktop queue pressure is currently under control.',
      branchCount: summary.branchCount,
      alertCount: summary.alerts.length,
      topAlert: this.mapCommandCenterAlert(
        RetailOsModule.DESKTOP_BACKOFFICE,
        summary.alerts[0] ?? null,
      ),
      metrics: [
        this.createCommandCenterMetric(
          'failedSyncJobs',
          'Failed POS sync jobs',
          summary.failedPosSyncJobCount,
        ),
        this.createCommandCenterMetric(
          'pendingTransfers',
          'Pending transfers',
          summary.pendingTransferCount,
        ),
        this.createCommandCenterMetric(
          'negativeAdjustments',
          'Negative adjustments',
          summary.negativeAdjustmentCount,
        ),
      ],
      actions: this.buildCommandCenterActions(
        branchId,
        'desktop-workbench/network-summary',
        'VIEW_DESKTOP_NETWORK_SUMMARY',
        'desktop-workbench/network-summary/export',
        'EXPORT_DESKTOP_NETWORK_SUMMARY',
      ),
      branchPreviews: summary.branches.map((branch) => ({
        branchId: branch.branchId,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        status: branch.highestPriority,
        statusReason: branch.highestPriorityReason,
        actionPath: branch.actions[0]?.path ?? null,
      })),
      trend: this.buildDefaultCommandCenterTrend(),
    };
  }

  private buildReplenishmentCommandCenterModule(
    branchId: number,
    summary: RetailReplenishmentNetworkSummaryResponseDto,
  ): RetailCommandCenterModuleSummaryResponseDto {
    const status =
      summary.criticalBranchCount > 0
        ? 'CRITICAL'
        : summary.highBranchCount > 0
          ? 'HIGH'
          : 'NORMAL';

    return {
      module: RetailOsModule.INVENTORY_AUTOMATION,
      title: 'Replenishment automation',
      status,
      statusReason:
        summary.criticalBranchCount > 0
          ? `${summary.criticalBranchCount} branches have blocked replenishment automation.`
          : summary.highBranchCount > 0
            ? `${summary.highBranchCount} branches have elevated replenishment backlog.`
            : 'Replenishment automation is operating within normal thresholds.',
      branchCount: summary.branchCount,
      alertCount: summary.alerts.length,
      topAlert: this.mapCommandCenterAlert(
        RetailOsModule.INVENTORY_AUTOMATION,
        summary.alerts[0] ?? null,
      ),
      metrics: [
        this.createCommandCenterMetric(
          'blockedAutoSubmitDrafts',
          'Blocked auto-submit drafts',
          summary.blockedAutoSubmitDraftCount,
        ),
        this.createCommandCenterMetric(
          'staleDrafts',
          'Stale drafts',
          summary.staleDraftCount,
        ),
        this.createCommandCenterMetric(
          'readyAutoSubmitDrafts',
          'Ready auto-submit drafts',
          summary.readyAutoSubmitDraftCount,
        ),
      ],
      actions: this.buildCommandCenterActions(
        branchId,
        'replenishment-drafts/network-summary',
        'VIEW_REPLENISHMENT_NETWORK_SUMMARY',
        'replenishment-drafts/network-summary/export',
        'EXPORT_REPLENISHMENT_NETWORK_SUMMARY',
      ),
      branchPreviews: summary.branches.map((branch) => ({
        branchId: branch.branchId,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        status: branch.highestPriority,
        statusReason: branch.highestPriorityReason,
        actionPath: branch.actions[0]?.path ?? null,
      })),
      trend: this.buildDefaultCommandCenterTrend(),
    };
  }

  private buildAttendanceCommandCenterModule(
    branchId: number,
    summary: RetailHrAttendanceNetworkSummaryResponseDto,
  ): RetailCommandCenterModuleSummaryResponseDto {
    const status =
      summary.criticalBranchCount > 0
        ? 'CRITICAL'
        : summary.highBranchCount > 0
          ? 'HIGH'
          : 'NORMAL';

    return {
      module: RetailOsModule.HR_ATTENDANCE,
      title: 'HR attendance',
      status,
      statusReason:
        summary.criticalBranchCount > 0
          ? `${summary.criticalBranchCount} branches have missing attendance activity that needs immediate intervention.`
          : summary.highBranchCount > 0
            ? `${summary.highBranchCount} branches have elevated lateness or overtime risk.`
            : 'Attendance coverage is currently within expected operating thresholds.',
      branchCount: summary.branchCount,
      alertCount: summary.alerts.length,
      topAlert: this.mapCommandCenterAlert(
        RetailOsModule.HR_ATTENDANCE,
        summary.alerts[0] ?? null,
      ),
      metrics: [
        this.createCommandCenterMetric(
          'absentStaff',
          'Absent staff',
          summary.absentCount,
        ),
        this.createCommandCenterMetric(
          'lateCheckIns',
          'Late check-ins',
          summary.lateCheckInCount,
        ),
        this.createCommandCenterMetric(
          'overtimeActive',
          'Active overtime shifts',
          summary.overtimeActiveCount,
        ),
      ],
      actions: this.buildCommandCenterActions(
        branchId,
        'hr-attendance/network-summary',
        'VIEW_HR_ATTENDANCE_NETWORK_SUMMARY',
        'hr-attendance/network-summary/export',
        'EXPORT_HR_ATTENDANCE_NETWORK_SUMMARY',
      ),
      branchPreviews: summary.branches.map((branch) => ({
        branchId: branch.branchId,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        status: branch.highestRisk,
        statusReason: branch.highestRiskReason,
        actionPath:
          branch.actions.find(
            (action) => action.type === 'VIEW_HR_ATTENDANCE_EXCEPTIONS',
          )?.path ??
          branch.actions[0]?.path ??
          null,
      })),
      trend: this.buildDefaultCommandCenterTrend(),
    };
  }

  private buildCommandCenterActions(
    branchId: number,
    viewPath: string,
    viewType: string,
    exportPath: string,
    exportType: string,
  ): RetailCommandCenterSummaryActionResponseDto[] {
    return [
      {
        type: viewType,
        method: 'GET',
        path: `/retail/v1/ops/${viewPath}?branchId=${branchId}`,
        enabled: true,
      },
      {
        type: exportType,
        method: 'GET',
        path: `/retail/v1/ops/${exportPath}?branchId=${branchId}`,
        enabled: true,
      },
    ];
  }

  private mapCommandCenterAlert(
    module: RetailOsModule,
    alert:
      | RetailPosOperationsAlertResponseDto
      | RetailStockHealthNetworkAlertResponseDto
      | RetailAiNetworkAlertResponseDto
      | RetailAccountingAlertResponseDto
      | RetailDesktopWorkbenchAlertResponseDto
      | RetailReplenishmentNetworkAlertResponseDto
      | RetailHrAttendanceNetworkAlertResponseDto
      | null,
  ): RetailCommandCenterSummaryAlertResponseDto | null {
    if (!alert) {
      return null;
    }

    return {
      module,
      code: alert.code,
      severity: alert.severity,
      title: alert.title,
      summary: alert.summary,
      metric: alert.metric ?? null,
      action: alert.action ?? null,
    };
  }

  private createCommandCenterMetric(
    key: string,
    label: string,
    value: number,
  ): RetailCommandCenterSummaryMetricResponseDto {
    return { key, label, value };
  }

  private buildDefaultCommandCenterTrend(): RetailCommandCenterModuleTrendResponseDto {
    return {
      previousStatus: null,
      statusDelta: null,
      direction: 'STABLE',
      previousAlertCount: null,
      previousHeadlineMetricKey: null,
      previousHeadlineMetricValue: null,
      headlineMetricDelta: null,
    };
  }

  private compareCommandCenterAlerts(
    left: RetailCommandCenterSummaryAlertResponseDto,
    right: RetailCommandCenterSummaryAlertResponseDto,
  ): number {
    const severityRank = {
      CRITICAL: 0,
      WATCH: 1,
      INFO: 2,
    } as const;

    const severityDelta =
      severityRank[left.severity] - severityRank[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return (right.metric ?? 0) - (left.metric ?? 0);
  }

  private matchesCommandCenterAlertFilters(
    alerts: Array<{ severity: 'INFO' | 'WATCH' | 'CRITICAL' }>,
    query: RetailCommandCenterSummaryQueryDto,
  ): boolean {
    if (query.hasAlertsOnly === true && alerts.length === 0) {
      return false;
    }

    if (query.hasAlertsOnly === false && alerts.length > 0) {
      return false;
    }

    if (
      query.alertSeverity &&
      !alerts.some((alert) => alert.severity === query.alertSeverity)
    ) {
      return false;
    }

    return true;
  }

  private matchesCommandCenterStatus(
    status: RetailCommandCenterModuleSummaryResponseDto['status'],
    expected?: RetailCommandCenterStatusFilter,
  ): boolean {
    return !expected || status === expected;
  }

  private attachCommandCenterTrend(
    module: RetailCommandCenterModuleSummaryResponseDto,
    snapshot: RetailCommandCenterReportSnapshotResponseDto | null,
  ): RetailCommandCenterModuleSummaryResponseDto {
    const previousModule = snapshot?.summary.modules.find(
      (entry) => entry.module === module.module,
    );
    const previousHeadlineMetric = previousModule?.metrics[0] ?? null;
    const currentHeadlineMetric = module.metrics[0] ?? null;
    const currentRank = this.getCommandCenterStatusRank(module.status);
    const previousRank = previousModule
      ? this.getCommandCenterStatusRank(previousModule.status)
      : null;
    const statusDelta =
      previousRank == null ? null : currentRank - previousRank;

    return {
      ...module,
      trend: {
        previousStatus: previousModule?.status ?? null,
        statusDelta,
        direction:
          statusDelta == null
            ? 'STABLE'
            : statusDelta > 0
              ? 'WORSENING'
              : statusDelta < 0
                ? 'IMPROVING'
                : 'STABLE',
        previousAlertCount: previousModule?.alertCount ?? null,
        previousHeadlineMetricKey: previousHeadlineMetric?.key ?? null,
        previousHeadlineMetricValue: previousHeadlineMetric?.value ?? null,
        headlineMetricDelta:
          previousHeadlineMetric && currentHeadlineMetric
            ? currentHeadlineMetric.value - previousHeadlineMetric.value
            : null,
      },
    };
  }

  private getCommandCenterStatusRank(
    status: RetailCommandCenterModuleSummaryResponseDto['status'],
  ): number {
    const rank = {
      NORMAL: 0,
      HIGH: 1,
      CRITICAL: 2,
    } as const;

    return rank[status];
  }

  private buildCommandCenterSnapshotKey(
    query: RetailCommandCenterSummaryQueryDto,
  ): string {
    const fingerprint = JSON.stringify(
      this.buildCommandCenterSnapshotFilters(query),
    );
    const hash = createHash('sha256')
      .update(fingerprint)
      .digest('hex')
      .slice(0, 24);
    return `retail:ops:command-center:snapshot:${query.branchId}:${hash}`;
  }

  private buildCommandCenterSnapshotFilters(
    query: RetailCommandCenterSummaryQueryDto,
  ): RetailCommandCenterReportSnapshotFilterResponseDto {
    return {
      branchId: query.branchId,
      branchLimit: Math.min(Math.max(query.branchLimit ?? 3, 1), 10),
      module: query.module ?? null,
      status: query.status ?? null,
      hasAlertsOnly: query.hasAlertsOnly ?? null,
      alertSeverity: query.alertSeverity ?? null,
    };
  }

  private async getStoredNetworkCommandCenterReportSnapshot(
    query: RetailCommandCenterSummaryQueryDto,
  ): Promise<RetailCommandCenterReportSnapshotResponseDto | null> {
    const raw = await this.redisService.get(
      this.buildCommandCenterSnapshotKey(query),
    );
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as RetailCommandCenterReportSnapshotResponseDto;
    } catch {
      return null;
    }
  }

  private matchesDesktopNetworkPriority(
    priority: RetailDesktopNetworkSummaryBranchResponseDto['highestPriority'],
    expected?: RetailDesktopWorkbenchPriorityFilter,
  ): boolean {
    return !expected || priority === expected;
  }

  private buildAccountingAgingBuckets(
    items: RetailAccountingOverviewItemResponseDto[],
  ) {
    return items.reduce(
      (accumulator, item) => {
        const ageHours =
          item.lastReceiptEventAgeHours ?? item.orderAgeHours ?? 0;

        if (ageHours < 24) {
          accumulator.under24Hours += 1;
        } else if (ageHours <= 72) {
          accumulator.between24And72Hours += 1;
        } else {
          accumulator.over72Hours += 1;
        }

        return accumulator;
      },
      {
        under24Hours: 0,
        between24And72Hours: 0,
        over72Hours: 0,
      },
    );
  }

  private calculateOrderAgeHours(createdAt?: Date | string | null): number {
    if (!createdAt) {
      return 0;
    }

    const createdAtDate =
      createdAt instanceof Date ? createdAt : new Date(createdAt);
    const ageMs = Date.now() - createdAtDate.getTime();
    if (!Number.isFinite(ageMs) || ageMs <= 0) {
      return 0;
    }

    return Math.floor(ageMs / (60 * 60 * 1000));
  }

  private getOldestAgeHours(
    items: RetailAccountingOverviewItemResponseDto[],
  ): number {
    if (items.length === 0) {
      return 0;
    }

    return Math.max(...items.map((item) => item.orderAgeHours ?? 0));
  }

  private buildAccountingActions(
    order: PurchaseOrder,
    lastReceiptEvent: PurchaseOrderReceiptEvent | null,
    accountingState: RetailAccountingOverviewItemResponseDto['accountingState'],
  ): RetailAccountingActionResponseDto[] {
    const actions: RetailAccountingActionResponseDto[] = [
      {
        type: 'VIEW_RECEIPT_EVENTS',
        method: 'GET',
        path: `/hub/v1/purchase-orders/${order.id}/receipt-events`,
        body: null,
        enabled:
          lastReceiptEvent != null ||
          order.status === PurchaseOrderStatus.RECEIVED,
      },
    ];

    if (
      lastReceiptEvent &&
      accountingState === 'DISCREPANCY_AWAITING_APPROVAL'
    ) {
      actions.push({
        type: 'APPROVE_DISCREPANCY',
        method: 'PATCH',
        path: `/hub/v1/purchase-orders/${order.id}/receipt-events/${lastReceiptEvent.id}/discrepancy-approval`,
        body: {},
        enabled: true,
      });
    }

    if (accountingState === 'READY_TO_RECONCILE') {
      actions.push({
        type: 'MARK_RECONCILED',
        method: 'PATCH',
        path: `/hub/v1/purchase-orders/${order.id}/status`,
        body: {
          status: PurchaseOrderStatus.RECONCILED,
        },
        enabled: true,
      });
    }

    return actions;
  }

  private matchesAccountingStateFilter(
    item: RetailAccountingOverviewItemResponseDto,
    accountingState?: RetailAccountingStateFilter,
  ): boolean {
    if (!accountingState) {
      return true;
    }

    return item.accountingState === accountingState;
  }

  private matchesAccountingSlaFilter(
    item: RetailAccountingOverviewItemResponseDto,
    slaBreachedOnly?: boolean,
  ): boolean {
    if (!slaBreachedOnly) {
      return true;
    }

    if (item.accountingState === 'DISCREPANCY_REVIEW') {
      return (item.lastReceiptEventAgeHours ?? 0) > 72;
    }

    if (item.accountingState === 'DISCREPANCY_AWAITING_APPROVAL') {
      return (item.lastReceiptEventAgeHours ?? 0) > 72;
    }

    if (
      item.accountingState === 'RECEIVED_PENDING_RECONCILIATION' ||
      item.accountingState === 'READY_TO_RECONCILE'
    ) {
      return item.orderAgeHours >= 24;
    }

    return false;
  }

  private matchesAccountingPriorityFilter(
    item: RetailAccountingOverviewItemResponseDto,
    priority?: RetailAccountingPriorityFilter,
  ): boolean {
    if (!priority) {
      return true;
    }

    return item.priority === priority;
  }

  private estimateIssueValue(
    item: RetailAccountingOverviewItemResponseDto,
    issueType: 'shortage' | 'damaged',
  ): number {
    const issueUnits =
      issueType === 'shortage' ? item.shortageUnitCount : item.damagedUnitCount;
    const totalIssueUnits = item.shortageUnitCount + item.damagedUnitCount;
    if (issueUnits <= 0 || totalIssueUnits <= 0) {
      return 0;
    }

    const unitValue =
      item.total / Math.max(item.outstandingUnitCount + totalIssueUnits, 1);
    return Number((unitValue * issueUnits).toFixed(2));
  }

  private buildAccountingPriority(
    accountingState: RetailAccountingOverviewItemResponseDto['accountingState'],
    orderAgeHours: number,
    lastReceiptEventAgeHours: number | null,
    total: number,
    shortageUnitCount: number,
    damagedUnitCount: number,
  ): {
    level: RetailAccountingOverviewItemResponseDto['priority'];
    reason: string;
  } {
    if (
      accountingState === 'DISCREPANCY_REVIEW' &&
      (lastReceiptEventAgeHours ?? 0) > 72
    ) {
      return {
        level: 'CRITICAL',
        reason: 'Open discrepancy has exceeded the 72-hour SLA.',
      };
    }

    if (
      accountingState === 'DISCREPANCY_AWAITING_APPROVAL' &&
      (lastReceiptEventAgeHours ?? 0) > 72
    ) {
      return {
        level: 'CRITICAL',
        reason: 'Resolved discrepancy is waiting too long for approval.',
      };
    }

    if (
      (accountingState === 'READY_TO_RECONCILE' ||
        accountingState === 'RECEIVED_PENDING_RECONCILIATION') &&
      orderAgeHours >= 48
    ) {
      return {
        level: 'HIGH',
        reason: 'Received order is aging in the reconciliation queue.',
      };
    }

    if (
      accountingState === 'OPEN_COMMITMENT' &&
      orderAgeHours >= 72 &&
      total >= 500
    ) {
      return {
        level: 'HIGH',
        reason: 'Open commitment is aging with material supplier exposure.',
      };
    }

    if (
      accountingState === 'DISCREPANCY_REVIEW' ||
      accountingState === 'DISCREPANCY_AWAITING_APPROVAL'
    ) {
      return {
        level: 'HIGH',
        reason:
          'Receipt discrepancy needs operator attention before reconciliation.',
      };
    }

    if (shortageUnitCount > 0 || damagedUnitCount > 0) {
      return {
        level: 'HIGH',
        reason: 'Shortage or damaged units were recorded on the order.',
      };
    }

    return {
      level: 'NORMAL',
      reason: 'Queue item is within expected operating thresholds.',
    };
  }

  private isDesktopSyncQueueCandidate(job: PosSyncJob): boolean {
    return (
      job.status !== PosSyncStatus.PROCESSED ||
      this.getDesktopFailedEntryCount(job) > 0
    );
  }

  private isDesktopFailedSyncJob(job: PosSyncJob): boolean {
    return (
      job.status === PosSyncStatus.FAILED ||
      this.getDesktopFailedEntryCount(job) > 0
    );
  }

  private getDesktopFailedEntryCount(job: PosSyncJob): number {
    return Math.max(job.rejectedCount ?? 0, job.failedEntries?.length ?? 0);
  }

  private mapDesktopSyncJob(
    job: PosSyncJob,
  ): RetailDesktopWorkbenchSyncJobResponseDto {
    const ageHours = this.calculateOrderAgeHours(job.createdAt);
    const failedEntryCount = this.getDesktopFailedEntryCount(job);

    let priority: RetailDesktopWorkbenchSyncJobResponseDto['priority'] =
      'NORMAL';
    let priorityReason =
      'Sync job is still within the normal desktop ops window.';

    if (job.status === PosSyncStatus.FAILED || failedEntryCount > 0) {
      priority = 'CRITICAL';
      priorityReason =
        'POS sync job failed or rejected entries need manual review.';
    } else if (job.status === PosSyncStatus.RECEIVED && ageHours >= 2) {
      priority = 'HIGH';
      priorityReason = 'POS sync job is still waiting to be processed.';
    }

    return {
      jobId: job.id,
      syncType: job.syncType,
      status: job.status,
      createdAt: job.createdAt,
      processedAt: job.processedAt ?? null,
      rejectedCount: job.rejectedCount ?? 0,
      failedEntryCount,
      priority,
      priorityReason,
      actions: [
        {
          type: 'VIEW_SYNC_JOB',
          method: 'GET',
          path: `/admin/b2b/pos-sync-jobs/${job.id}`,
          body: null,
          enabled: true,
        },
        {
          type: 'VIEW_SYNC_FAILED_ENTRIES',
          method: 'GET',
          path: `/retail/v1/ops/desktop-workbench/sync-jobs/${job.id}/failed-entries?branchId=${job.branchId}`,
          body: null,
          enabled: failedEntryCount > 0,
        },
      ],
    };
  }

  private mapDesktopFailedSyncEntry(
    jobId: number,
    branchId: number,
    entry: PosSyncJob['failedEntries'][number],
  ): RetailDesktopSyncFailedEntryResponseDto {
    let priority: RetailDesktopSyncFailedEntryResponseDto['priority'] =
      'NORMAL';
    let priorityReason = 'Failed entry is available for desktop replay review.';

    if (
      (entry?.transferId ?? null) != null ||
      (entry?.counterpartyBranchId ?? null) != null
    ) {
      priority = 'CRITICAL';
      priorityReason =
        'Failed entry affects a transfer or counterparty branch workflow.';
    } else if ((entry?.movementType ?? '').toUpperCase() === 'TRANSFER') {
      priority = 'HIGH';
      priorityReason = 'Failed entry affects stock movement synchronization.';
    }

    return {
      entryIndex: entry?.entryIndex ?? 0,
      productId: entry?.productId ?? null,
      aliasType: entry?.aliasType ?? null,
      aliasValue: entry?.aliasValue ?? null,
      quantity: entry?.quantity ?? 0,
      movementType: entry?.movementType ?? null,
      counterpartyBranchId: entry?.counterpartyBranchId ?? null,
      transferId: entry?.transferId ?? null,
      note: entry?.note ?? null,
      error: entry?.error ?? 'Unknown sync failure',
      priority,
      priorityReason,
      actions: this.buildDesktopFailedSyncEntryActions(jobId, branchId, entry),
    };
  }

  private buildDesktopFailedSyncEntryActions(
    jobId: number,
    branchId: number,
    entry: PosSyncJob['failedEntries'][number],
  ): RetailDesktopWorkbenchActionResponseDto[] {
    const actions: RetailDesktopWorkbenchActionResponseDto[] = [
      {
        type: 'REPLAY_SYNC_FAILURE_ENTRY',
        method: 'POST',
        path: `/pos/v1/sync/jobs/${jobId}/replay-failures`,
        body: {
          branchId,
          entryIndexes: [entry?.entryIndex ?? 0],
        },
        enabled: (entry?.entryIndex ?? null) != null,
      },
    ];

    if ((entry?.transferId ?? null) != null) {
      actions.push({
        type: 'VIEW_TRANSFER_DETAIL',
        method: 'GET',
        path: `/retail/v1/ops/desktop-workbench/transfers/${entry?.transferId}?branchId=${branchId}`,
        body: null,
        enabled: true,
      });
    }

    return actions;
  }

  private matchesDesktopFailedEntryPriority(
    priority: RetailDesktopSyncFailedEntryResponseDto['priority'],
    filter?: RetailDesktopSyncFailedEntryPriorityFilter,
  ): boolean {
    return !filter || priority === filter;
  }

  private matchesDesktopFailedEntryMovementType(
    movementType: string | null,
    filter?: string,
  ): boolean {
    return !filter || (movementType ?? '').toUpperCase() === filter;
  }

  private matchesDesktopFailedEntryTransferFilter(
    entry: RetailDesktopSyncFailedEntryResponseDto,
    transferOnly?: boolean,
  ): boolean {
    return !transferOnly || this.isTransferLinkedFailedSyncEntry(entry);
  }

  private isTransferLinkedFailedSyncEntry(
    entry: Pick<
      RetailDesktopSyncFailedEntryResponseDto,
      'transferId' | 'counterpartyBranchId' | 'movementType'
    >,
  ): boolean {
    return (
      entry.transferId != null ||
      entry.counterpartyBranchId != null ||
      (entry.movementType ?? '').toUpperCase() === 'TRANSFER'
    );
  }

  private async getActiveBranchStaffAssignment(
    branchId: number,
    userId: number | null,
  ): Promise<BranchStaffAssignment | null> {
    if (userId == null) {
      return null;
    }

    return this.branchStaffAssignmentsRepository.findOne({
      where: {
        branchId,
        userId,
        isActive: true,
      },
    });
  }

  private canDispatchDesktopTransfer(
    transfer: BranchTransfer,
    branchId: number,
    roles: string[],
    assignment: BranchStaffAssignment | null,
  ): boolean {
    return (
      transfer.fromBranchId === branchId &&
      this.hasDesktopTransferAuthority(roles, assignment, {
        managerByDefault: true,
        permission: 'TRANSFER_DISPATCH',
      })
    );
  }

  private canReceiveDesktopTransfer(
    transfer: BranchTransfer,
    branchId: number,
    roles: string[],
    assignment: BranchStaffAssignment | null,
  ): boolean {
    return (
      transfer.toBranchId === branchId &&
      this.hasDesktopTransferAuthority(roles, assignment, {
        managerByDefault: true,
        operatorByDefault: true,
        permission: 'TRANSFER_RECEIVE',
      })
    );
  }

  private canCancelDesktopTransfer(
    transfer: BranchTransfer,
    branchId: number,
    roles: string[],
    assignment: BranchStaffAssignment | null,
  ): boolean {
    return (
      (transfer.fromBranchId === branchId ||
        transfer.toBranchId === branchId) &&
      this.hasDesktopTransferAuthority(roles, assignment, {
        managerByDefault: true,
        permission: 'TRANSFER_CANCEL',
      })
    );
  }

  private hasDesktopTransferAuthority(
    roles: string[],
    assignment: BranchStaffAssignment | null,
    options: {
      managerByDefault?: boolean;
      operatorByDefault?: boolean;
      permission: string;
    },
  ): boolean {
    if (
      this.hasAnyRole(roles, [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.POS_MANAGER,
      ])
    ) {
      return true;
    }

    if (!assignment) {
      return false;
    }

    const permissions = Array.isArray(assignment.permissions)
      ? assignment.permissions.map((permission) => permission.toUpperCase())
      : [];
    const requiredPermission = options.permission.toUpperCase();

    if (permissions.includes(requiredPermission)) {
      return true;
    }

    if (
      assignment.role === BranchStaffRole.MANAGER &&
      options.managerByDefault
    ) {
      return true;
    }

    if (
      assignment.role === BranchStaffRole.OPERATOR &&
      options.operatorByDefault
    ) {
      return true;
    }

    return false;
  }

  private hasAnyRole(roles: string[], allowedRoles: UserRole[]): boolean {
    return allowedRoles.some((role) => roles.includes(role));
  }

  private mapDesktopTransfer(
    branchId: number,
    transfer: BranchTransfer,
  ): RetailDesktopWorkbenchTransferResponseDto {
    const direction = transfer.toBranchId === branchId ? 'INBOUND' : 'OUTBOUND';
    const ageHours = this.calculateOrderAgeHours(transfer.createdAt);
    const totalUnits = (transfer.items ?? []).reduce(
      (sum, item) => sum + (item.quantity ?? 0),
      0,
    );

    let priority: RetailDesktopWorkbenchTransferResponseDto['priority'] =
      'NORMAL';
    let priorityReason =
      'Transfer is within the expected desktop handling window.';

    if (
      direction === 'INBOUND' &&
      transfer.status === BranchTransferStatus.DISPATCHED &&
      ageHours >= 48
    ) {
      priority = 'CRITICAL';
      priorityReason =
        'Inbound transfer has been dispatched but not received for more than 48 hours.';
    } else if (ageHours >= 24) {
      priority = 'HIGH';
      priorityReason =
        'Transfer has been sitting in the desktop queue for more than 24 hours.';
    }

    return {
      transferId: transfer.id,
      transferNumber: transfer.transferNumber,
      direction,
      status: transfer.status,
      totalUnits,
      ageHours,
      createdAt: transfer.createdAt,
      priority,
      priorityReason,
      actions: [
        {
          type: 'VIEW_TRANSFER',
          method: 'GET',
          path: `/admin/b2b/branch-transfers/${transfer.id}`,
          body: null,
          enabled: true,
        },
        {
          type: 'VIEW_TRANSFER_DETAIL',
          method: 'GET',
          path: `/retail/v1/ops/desktop-workbench/transfers/${transfer.id}?branchId=${branchId}`,
          body: null,
          enabled: true,
        },
      ],
    };
  }

  private mapDesktopStockException(
    movement: StockMovement,
  ): RetailDesktopWorkbenchStockExceptionResponseDto {
    const adjustmentUnits = Math.abs(movement.quantityDelta ?? 0);
    let priority: RetailDesktopWorkbenchStockExceptionResponseDto['priority'] =
      'NORMAL';
    let priorityReason = 'Adjustment is logged for desktop review.';

    if (adjustmentUnits >= 25) {
      priority = 'CRITICAL';
      priorityReason =
        'Large negative adjustment requires immediate inventory review.';
    } else if (adjustmentUnits >= 10) {
      priority = 'HIGH';
      priorityReason =
        'Negative adjustment is large enough to warrant prompt review.';
    }

    return {
      movementId: movement.id,
      movementType: movement.movementType,
      quantityDelta: movement.quantityDelta,
      sourceType: movement.sourceType,
      createdAt: movement.createdAt,
      note: movement.note ?? null,
      priority,
      priorityReason,
      actions: [
        {
          type: 'VIEW_STOCK_MOVEMENTS',
          method: 'GET',
          path: `/admin/b2b/stock-movements?branchId=${movement.branchId}`,
          body: null,
          enabled: true,
        },
        {
          type: 'VIEW_STOCK_EXCEPTION_DETAIL',
          method: 'GET',
          path: `/retail/v1/ops/desktop-workbench/stock-exceptions/${movement.id}?branchId=${movement.branchId}`,
          body: null,
          enabled: true,
        },
      ],
    };
  }

  private mapDesktopNetworkBranch(
    branch: Branch,
    windowHours: number,
    syncQueue: RetailDesktopWorkbenchSyncJobResponseDto[],
    transferQueue: RetailDesktopWorkbenchTransferResponseDto[],
    stockExceptions: RetailDesktopWorkbenchStockExceptionResponseDto[],
    queueType?: RetailDesktopWorkbenchQueueFilter,
  ): RetailDesktopNetworkSummaryBranchResponseDto {
    const highestPriority = this.resolveDesktopNetworkBranchPriority(
      syncQueue,
      transferQueue,
      stockExceptions,
    );
    const highestPriorityReason =
      this.resolveDesktopNetworkBranchPriorityReason(
        highestPriority,
        syncQueue,
        transferQueue,
        stockExceptions,
      );
    const lastProcessedPosSyncAt =
      syncQueue
        .map((job) => job.processedAt)
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const oldestTransferAgeHours = transferQueue.length
      ? Math.max(...transferQueue.map((transfer) => transfer.ageHours))
      : null;

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code ?? null,
      highestPriority,
      highestPriorityReason,
      failedPosSyncJobCount: syncQueue.filter(
        (job) => job.priority === 'CRITICAL',
      ).length,
      openPosSyncJobCount: syncQueue.filter(
        (job) => job.status === PosSyncStatus.RECEIVED,
      ).length,
      rejectedSyncEntryCount: syncQueue.reduce(
        (sum, job) => sum + job.failedEntryCount,
        0,
      ),
      pendingTransferCount: transferQueue.length,
      inboundTransferPendingCount: transferQueue.filter(
        (transfer) => transfer.direction === 'INBOUND',
      ).length,
      outboundTransferPendingCount: transferQueue.filter(
        (transfer) => transfer.direction === 'OUTBOUND',
      ).length,
      negativeAdjustmentCount: stockExceptions.length,
      totalNegativeAdjustmentUnits: stockExceptions.reduce(
        (sum, movement) => sum + Math.abs(movement.quantityDelta),
        0,
      ),
      oldestTransferAgeHours,
      lastProcessedPosSyncAt,
      actions: [
        {
          type: 'VIEW_BRANCH_DESKTOP_WORKBENCH',
          method: 'GET',
          path: `/retail/v1/ops/desktop-workbench?branchId=${branch.id}&windowHours=${windowHours}${queueType ? `&queueType=${queueType}` : ''}`,
          body: null,
          enabled: true,
        },
      ],
    };
  }

  private resolveDesktopNetworkBranchPriority(
    syncQueue: RetailDesktopWorkbenchSyncJobResponseDto[],
    transferQueue: RetailDesktopWorkbenchTransferResponseDto[],
    stockExceptions: RetailDesktopWorkbenchStockExceptionResponseDto[],
  ): 'CRITICAL' | 'HIGH' | 'NORMAL' {
    const priorities = [
      ...syncQueue.map((item) => item.priority),
      ...transferQueue.map((item) => item.priority),
      ...stockExceptions.map((item) => item.priority),
    ];

    if (priorities.includes('CRITICAL')) {
      return 'CRITICAL';
    }

    if (priorities.includes('HIGH')) {
      return 'HIGH';
    }

    return 'NORMAL';
  }

  private resolveDesktopNetworkBranchPriorityReason(
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL',
    syncQueue: RetailDesktopWorkbenchSyncJobResponseDto[],
    transferQueue: RetailDesktopWorkbenchTransferResponseDto[],
    stockExceptions: RetailDesktopWorkbenchStockExceptionResponseDto[],
  ): string {
    const criticalSync = syncQueue.find((item) => item.priority === priority);
    if (criticalSync) {
      return criticalSync.priorityReason;
    }

    const criticalTransfer = transferQueue.find(
      (item) => item.priority === priority,
    );
    if (criticalTransfer) {
      return criticalTransfer.priorityReason;
    }

    const criticalException = stockExceptions.find(
      (item) => item.priority === priority,
    );
    if (criticalException) {
      return criticalException.priorityReason;
    }

    return 'Branch desktop queues are within expected operating thresholds.';
  }

  private buildDesktopNetworkAlerts(
    branches: RetailDesktopNetworkSummaryBranchResponseDto[],
  ): RetailDesktopWorkbenchAlertResponseDto[] {
    const alerts: RetailDesktopWorkbenchAlertResponseDto[] = [];
    const criticalBranches = branches.filter(
      (branch) => branch.highestPriority === 'CRITICAL',
    );
    const transferBacklogBranches = branches.filter(
      (branch) =>
        branch.oldestTransferAgeHours != null &&
        branch.oldestTransferAgeHours >= 48,
    );
    const adjustmentDriftBranches = branches.filter(
      (branch) => branch.totalNegativeAdjustmentUnits >= 20,
    );

    if (criticalBranches.some((branch) => branch.failedPosSyncJobCount > 0)) {
      alerts.push({
        code: 'NETWORK_SYNC_FAILURES',
        severity: 'CRITICAL',
        title: 'Multiple branches have critical POS sync failures',
        summary:
          'At least one branch in the desktop network has failed POS sync jobs or rejected sync entries awaiting manual intervention.',
        metric: criticalBranches.filter(
          (branch) => branch.failedPosSyncJobCount > 0,
        ).length,
        action:
          'Open the highest-priority branches first and clear sync failures before they block downstream stock movement workflows.',
      });
    }

    if (transferBacklogBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_TRANSFER_BACKLOG',
        severity: 'CRITICAL',
        title: 'Inbound transfer backlog spans multiple branches',
        summary:
          'At least one branch has inbound transfer backlog beyond the expected desktop operating window.',
        metric: transferBacklogBranches.length,
        action:
          'Coordinate destination branches to receive the oldest dispatched transfers first.',
      });
    }

    if (adjustmentDriftBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_ADJUSTMENT_DRIFT',
        severity: adjustmentDriftBranches.some(
          (branch) => branch.totalNegativeAdjustmentUnits >= 50,
        )
          ? 'CRITICAL'
          : 'WATCH',
        title: 'Negative inventory drift is concentrated in specific branches',
        summary:
          'Recent stock adjustments show material negative drift in at least one branch.',
        metric: adjustmentDriftBranches.length,
        action:
          'Audit the largest branch-level adjustment deltas and confirm whether the losses came from valid recounts or process gaps.',
      });
    }

    if (alerts.length === 0 && branches.length > 0) {
      alerts.push({
        code: 'NETWORK_DESKTOP_STABLE',
        severity: 'INFO',
        title: 'Desktop network is within expected thresholds',
        summary:
          'No critical network-level sync failures, transfer backlog, or material adjustment drift were detected.',
        metric: branches.length,
        action:
          'Continue monitoring branch queues and use branch workbenches for routine cleanup.',
      });
    }

    return alerts;
  }

  private buildDesktopWorkbenchAlerts(
    summary: RetailDesktopWorkbenchResponseDto['summary'],
    syncQueue: RetailDesktopWorkbenchSyncJobResponseDto[],
    transferQueue: RetailDesktopWorkbenchTransferResponseDto[],
    stockExceptions: RetailDesktopWorkbenchStockExceptionResponseDto[],
  ): RetailDesktopWorkbenchAlertResponseDto[] {
    const alerts: RetailDesktopWorkbenchAlertResponseDto[] = [];

    if (summary.failedPosSyncJobCount > 0) {
      alerts.push({
        code: 'POS_SYNC_FAILURES',
        severity: syncQueue.some((item) => item.priority === 'CRITICAL')
          ? 'CRITICAL'
          : 'WATCH',
        title: 'POS sync jobs need desktop intervention',
        summary:
          'At least one POS sync job has failed or rejected entries for this branch.',
        metric: summary.failedPosSyncJobCount,
        action:
          'Inspect the failed sync jobs and re-run or correct rejected entries.',
      });
    }

    const staleInboundTransfers = transferQueue.filter(
      (item) => item.direction === 'INBOUND' && item.priority === 'CRITICAL',
    );
    if (staleInboundTransfers.length > 0) {
      alerts.push({
        code: 'INBOUND_TRANSFER_BACKLOG',
        severity: 'CRITICAL',
        title: 'Inbound transfers are stale',
        summary:
          'Inbound transfers have been dispatched but not received within the expected desktop ops window.',
        metric: staleInboundTransfers.length,
        action:
          'Follow up with the destination branch and close the oldest inbound transfer gaps first.',
      });
    }

    if (summary.totalNegativeAdjustmentUnits >= 20) {
      alerts.push({
        code: 'ADJUSTMENT_DRIFT',
        severity:
          summary.totalNegativeAdjustmentUnits >= 50 ? 'CRITICAL' : 'WATCH',
        title: 'Inventory adjustments show material negative drift',
        summary:
          'Recent stock adjustments removed a meaningful number of units from branch inventory.',
        metric: summary.totalNegativeAdjustmentUnits,
        action:
          'Audit the largest adjustments and confirm whether they came from valid recounts or process gaps.',
      });
    }

    if (
      alerts.length === 0 &&
      (syncQueue.length > 0 ||
        transferQueue.length > 0 ||
        stockExceptions.length > 0)
    ) {
      alerts.push({
        code: 'DESKTOP_WORKBENCH_STABLE',
        severity: 'INFO',
        title: 'Desktop workbench is within expected thresholds',
        summary:
          'No critical sync failures, stale transfer backlog, or large negative adjustments were detected.',
        metric: summary.pendingTransferCount + summary.failedPosSyncJobCount,
        action:
          'Continue clearing routine desktop queue items before they age into backlog.',
      });
    }

    return alerts;
  }

  private matchesDesktopWorkbenchPriority(
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL',
    expected?: RetailDesktopWorkbenchPriorityFilter,
  ): boolean {
    if (!expected) {
      return true;
    }

    return priority === expected;
  }

  private compareDesktopPriority(
    left: 'CRITICAL' | 'HIGH' | 'NORMAL',
    right: 'CRITICAL' | 'HIGH' | 'NORMAL',
  ): number {
    const rank = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
    } as const;

    return rank[left] - rank[right];
  }

  private getStockStatus(
    item: BranchInventory,
  ): 'HEALTHY' | 'LOW_STOCK' | 'REORDER_NOW' | 'OUT_OF_STOCK' {
    if ((item.quantityOnHand ?? 0) <= 0) {
      return 'OUT_OF_STOCK';
    }

    if ((item.availableToSell ?? 0) <= (item.safetyStock ?? 0)) {
      return 'REORDER_NOW';
    }

    if (
      (item.availableToSell ?? 0) <= Math.max((item.safetyStock ?? 0) * 2, 1)
    ) {
      return 'LOW_STOCK';
    }

    return 'HEALTHY';
  }

  private mapReplenishmentSummary(
    branchId: number,
    total: number,
    rawSummary: any,
  ): RetailReplenishmentReviewSummaryResponseDto {
    const blockedReasonBreakdown = this.mapBlockedReasonBreakdown(rawSummary);

    return {
      branchId,
      totalDrafts: total,
      staleDraftCount: Number(rawSummary?.staleDraftCount ?? 0),
      totalDraftValue: Number(rawSummary?.totalDraftValue ?? 0),
      supplierCount: Number(rawSummary?.supplierCount ?? 0),
      autoSubmitDraftCount: Number(rawSummary?.autoSubmitDraftCount ?? 0),
      blockedAutoSubmitDraftCount: Number(
        rawSummary?.blockedAutoSubmitDraftCount ?? 0,
      ),
      readyAutoSubmitDraftCount: Number(
        rawSummary?.readyAutoSubmitDraftCount ?? 0,
      ),
      blockedReasonBreakdown,
    };
  }

  private mapReplenishmentNetworkBranch(
    branch: Branch,
    drafts: PurchaseOrder[],
    query: RetailReplenishmentNetworkSummaryQueryDto,
  ): RetailReplenishmentNetworkBranchResponseDto {
    const rawSummary = this.summarizeReplenishmentDrafts(drafts);
    const summary = this.mapReplenishmentSummary(
      branch.id,
      drafts.length,
      rawSummary,
    );
    const highestPriority = this.resolveReplenishmentNetworkPriority(summary);

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code ?? null,
      highestPriority,
      highestPriorityReason:
        this.resolveReplenishmentNetworkPriorityReason(summary),
      totalDrafts: summary.totalDrafts,
      staleDraftCount: summary.staleDraftCount,
      totalDraftValue: summary.totalDraftValue,
      supplierCount: summary.supplierCount,
      autoSubmitDraftCount: summary.autoSubmitDraftCount,
      blockedAutoSubmitDraftCount: summary.blockedAutoSubmitDraftCount,
      readyAutoSubmitDraftCount: summary.readyAutoSubmitDraftCount,
      blockedReasonBreakdown: summary.blockedReasonBreakdown,
      actions: [
        {
          type: 'VIEW_BRANCH_REPLENISHMENT_DRAFTS',
          method: 'GET',
          path: '/retail/v1/ops/replenishment-drafts',
          query: {
            branchId: branch.id,
            ...(query.autoReplenishmentSubmissionMode
              ? {
                  autoReplenishmentSubmissionMode:
                    query.autoReplenishmentSubmissionMode,
                }
              : {}),
            ...(query.autoReplenishmentBlockedReason
              ? {
                  autoReplenishmentBlockedReason:
                    query.autoReplenishmentBlockedReason,
                }
              : {}),
            ...(query.supplierProfileId != null
              ? { supplierProfileId: query.supplierProfileId }
              : {}),
          },
          enabled: true,
        },
      ],
    };
  }

  private summarizeReplenishmentDrafts(drafts: PurchaseOrder[]): any {
    const staleBefore = Date.now() - 24 * 60 * 60 * 1000;

    return {
      staleDraftCount: drafts.filter(
        (order) => new Date(order.createdAt).getTime() < staleBefore,
      ).length,
      totalDraftValue: drafts.reduce(
        (sum, order) => sum + Number(order.total ?? 0),
        0,
      ),
      supplierCount: new Set(drafts.map((order) => order.supplierProfileId))
        .size,
      autoSubmitDraftCount: drafts.filter(
        (order) =>
          (order.statusMeta?.autoReplenishmentSubmissionMode ?? '') ===
          'AUTO_SUBMIT',
      ).length,
      blockedAutoSubmitDraftCount: drafts.filter(
        (order) =>
          (order.statusMeta?.autoReplenishmentSubmissionMode ?? '') ===
            'AUTO_SUBMIT' &&
          (order.statusMeta?.lastAutoSubmissionAttempt?.blockedReason ?? '') !==
            '',
      ).length,
      readyAutoSubmitDraftCount: drafts.filter(
        (order) =>
          (order.statusMeta?.autoReplenishmentSubmissionMode ?? '') ===
            'AUTO_SUBMIT' &&
          order.statusMeta?.lastAutoSubmissionAttempt?.eligible === true,
      ).length,
      dayOfWeekBlockedCount: drafts.filter(
        (order) =>
          order.statusMeta?.lastAutoSubmissionAttempt?.blockedReason ===
          'DAY_OF_WEEK_BLOCKED',
      ).length,
      hourOutsideWindowBlockedCount: drafts.filter(
        (order) =>
          order.statusMeta?.lastAutoSubmissionAttempt?.blockedReason ===
          'HOUR_OUTSIDE_WINDOW',
      ).length,
      preferredSupplierRequiredCount: drafts.filter(
        (order) =>
          order.statusMeta?.lastAutoSubmissionAttempt?.blockedReason ===
          'PREFERRED_SUPPLIER_REQUIRED',
      ).length,
      minimumOrderTotalNotMetCount: drafts.filter(
        (order) =>
          order.statusMeta?.lastAutoSubmissionAttempt?.blockedReason ===
          'MINIMUM_ORDER_TOTAL_NOT_MET',
      ).length,
      automationNotEntitledCount: drafts.filter(
        (order) =>
          order.statusMeta?.lastAutoSubmissionAttempt?.blockedReason ===
          'AUTOMATION_NOT_ENTITLED',
      ).length,
    };
  }

  private matchesReplenishmentNetworkFilters(
    order: PurchaseOrder,
    query: RetailReplenishmentNetworkSummaryQueryDto,
  ): boolean {
    if (
      query.supplierProfileId != null &&
      order.supplierProfileId !== query.supplierProfileId
    ) {
      return false;
    }

    if (
      query.autoReplenishmentSubmissionMode &&
      (order.statusMeta?.autoReplenishmentSubmissionMode ?? '') !==
        query.autoReplenishmentSubmissionMode
    ) {
      return false;
    }

    if (
      query.autoReplenishmentBlockedReason &&
      (order.statusMeta?.lastAutoSubmissionAttempt?.blockedReason ?? '') !==
        query.autoReplenishmentBlockedReason
    ) {
      return false;
    }

    return true;
  }

  private resolveReplenishmentNetworkPriority(
    summary: RetailReplenishmentReviewSummaryResponseDto,
  ): 'CRITICAL' | 'HIGH' | 'NORMAL' {
    if (summary.blockedAutoSubmitDraftCount > 0) {
      return 'CRITICAL';
    }

    if (summary.staleDraftCount > 0) {
      return 'HIGH';
    }

    return 'NORMAL';
  }

  private resolveReplenishmentNetworkPriorityReason(
    summary: RetailReplenishmentReviewSummaryResponseDto,
  ): string {
    if (summary.blockedAutoSubmitDraftCount > 0) {
      const topBlockedReason =
        summary.blockedReasonBreakdown[0]?.reason ?? 'UNKNOWN_BLOCKER';
      return `${summary.blockedAutoSubmitDraftCount} auto-submit drafts are blocked, led by ${topBlockedReason}.`;
    }

    if (summary.staleDraftCount > 0) {
      return `${summary.staleDraftCount} replenishment drafts have been waiting for more than 24 hours.`;
    }

    if (summary.readyAutoSubmitDraftCount > 0) {
      return `${summary.readyAutoSubmitDraftCount} auto-submit drafts are ready to clear without blockers.`;
    }

    return 'Automation drafts are present but currently within the expected review window.';
  }

  private compareReplenishmentNetworkBranch(
    left: RetailReplenishmentNetworkBranchResponseDto,
    right: RetailReplenishmentNetworkBranchResponseDto,
  ): number {
    const rank = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
    } as const;

    const priorityComparison =
      rank[left.highestPriority] - rank[right.highestPriority];
    if (priorityComparison !== 0) {
      return priorityComparison;
    }

    if (
      right.blockedAutoSubmitDraftCount !== left.blockedAutoSubmitDraftCount
    ) {
      return (
        right.blockedAutoSubmitDraftCount - left.blockedAutoSubmitDraftCount
      );
    }

    if (right.staleDraftCount !== left.staleDraftCount) {
      return right.staleDraftCount - left.staleDraftCount;
    }

    return right.totalDraftValue - left.totalDraftValue;
  }

  private buildReplenishmentNetworkAlerts(
    branches: RetailReplenishmentNetworkBranchResponseDto[],
  ): RetailReplenishmentNetworkAlertResponseDto[] {
    const alerts: RetailReplenishmentNetworkAlertResponseDto[] = [];
    const blockedBranches = branches.filter(
      (branch) => branch.blockedAutoSubmitDraftCount > 0,
    );
    const staleBranches = branches.filter(
      (branch) => branch.staleDraftCount > 0,
    );
    const readyBranches = branches.filter(
      (branch) => branch.readyAutoSubmitDraftCount > 0,
    );

    if (blockedBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_REPLENISHMENT_BLOCKED',
        severity: 'CRITICAL',
        title: 'Automation blockers are stalling replenishment across branches',
        summary:
          'At least one branch has auto-submit drafts blocked by policy, supplier, or entitlement constraints.',
        metric: blockedBranches.length,
        action:
          'Open the blocked branches first and clear the dominant blocked reasons before the next replenishment cycle.',
      });
    }

    if (staleBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_REPLENISHMENT_STALE',
        severity: 'WATCH',
        title: 'Replenishment drafts are aging across branches',
        summary:
          'Drafts have remained in the automation review queue for more than 24 hours in at least one branch.',
        metric: staleBranches.length,
        action:
          'Review the oldest branch draft queues and confirm whether blocked rules or buyer review is delaying submission.',
      });
    }

    if (readyBranches.length > 0) {
      alerts.push({
        code: 'NETWORK_REPLENISHMENT_READY',
        severity: 'INFO',
        title: 'Auto-submit-ready drafts are building up',
        summary:
          'Some branches already have eligible auto-submit drafts that should clear quickly once the next automation cycle runs.',
        metric: readyBranches.length,
        action:
          'Confirm automation cadence and monitor whether ready drafts are converting into submitted orders as expected.',
      });
    }

    return alerts;
  }

  private mapBlockedReasonBreakdown(
    rawSummary: any,
  ): RetailReplenishmentBlockedReasonCountResponseDto[] {
    const entries: Array<{ reason: string; rawKey: string }> = [
      {
        reason: 'DAY_OF_WEEK_BLOCKED',
        rawKey: 'dayOfWeekBlockedCount',
      },
      {
        reason: 'HOUR_OUTSIDE_WINDOW',
        rawKey: 'hourOutsideWindowBlockedCount',
      },
      {
        reason: 'PREFERRED_SUPPLIER_REQUIRED',
        rawKey: 'preferredSupplierRequiredCount',
      },
      {
        reason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
        rawKey: 'minimumOrderTotalNotMetCount',
      },
      {
        reason: 'AUTOMATION_NOT_ENTITLED',
        rawKey: 'automationNotEntitledCount',
      },
    ];

    return entries
      .map((entry) => ({
        reason: entry.reason,
        count: Number(rawSummary?.[entry.rawKey] ?? 0),
      }))
      .filter((entry) => entry.count > 0);
  }

  private mapPurchaseOrder(order: PurchaseOrder): PurchaseOrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      supplierProfileId: order.supplierProfileId,
      status: order.status,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      total: Number(order.total),
      expectedDeliveryDate: order.expectedDeliveryDate ?? null,
      statusMeta: order.statusMeta ?? {},
      autoReplenishmentStatus: this.mapAutoReplenishmentStatus(
        order.statusMeta,
      ),
      items: (order.items ?? []).map((item: PurchaseOrderItem) => ({
        id: item.id,
        productId: item.productId,
        supplierOfferId: item.supplierOfferId ?? null,
        orderedQuantity: item.orderedQuantity,
        receivedQuantity: item.receivedQuantity,
        shortageQuantity: item.shortageQuantity,
        damagedQuantity: item.damagedQuantity,
        note: item.note ?? null,
        unitPrice: Number(item.unitPrice),
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private mapRetailReplenishmentPurchaseOrder(
    order: PurchaseOrder,
  ): RetailReplenishmentPurchaseOrderResponseDto {
    return {
      ...this.mapPurchaseOrder(order),
      replenishmentActions: this.buildReplenishmentActions(order),
    };
  }

  private mapRetailReplenishmentReevaluationResponse(
    order: PurchaseOrder,
    outcome: PurchaseOrderReevaluationOutcome,
  ): RetailReplenishmentReevaluationResponseDto {
    return {
      ...this.mapRetailReplenishmentPurchaseOrder(order),
      reevaluationOutcome: outcome,
    };
  }

  private buildReplenishmentActions(
    order: PurchaseOrder,
  ): RetailReplenishmentActionResponseDto[] {
    if (
      order.status !== PurchaseOrderStatus.DRAFT ||
      order.statusMeta?.autoReplenishment !== true
    ) {
      return [];
    }

    return [
      {
        type: 'RE_EVALUATE_AUTO_REPLENISHMENT',
        method: 'POST',
        path: `/retail/v1/ops/replenishment-drafts/${order.id}/re-evaluate`,
        query: {
          branchId: order.branchId,
        },
        enabled: true,
      },
    ];
  }

  private mapAutoReplenishmentStatus(
    statusMeta?: Record<string, any> | null,
  ): PurchaseOrderAutoReplenishmentStatusResponseDto | null {
    if (statusMeta?.autoReplenishment !== true) {
      return null;
    }

    return {
      isAutoReplenishment: true,
      submissionMode: statusMeta.autoReplenishmentSubmissionMode ?? null,
      lastAttemptEligible:
        typeof statusMeta.lastAutoSubmissionAttempt?.eligible === 'boolean'
          ? statusMeta.lastAutoSubmissionAttempt.eligible
          : null,
      lastAttemptBlockedReason:
        statusMeta.lastAutoSubmissionAttempt?.blockedReason ?? null,
      lastAttemptAt: statusMeta.lastAutoSubmissionAttempt?.at ?? null,
      preferredSupplierProfileId:
        statusMeta.autoReplenishmentPreferredSupplierProfileId ?? null,
      minimumOrderTotal: statusMeta.autoReplenishmentMinimumOrderTotal ?? null,
      orderWindow: statusMeta.autoReplenishmentOrderWindow ?? null,
    };
  }
}
