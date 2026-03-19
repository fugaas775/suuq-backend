import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { RetailAttendanceService } from '../src/retail/retail-attendance.service';
import { RetailModulesGuard } from '../src/retail/retail-modules.guard';
import { RetailOpsController } from '../src/retail/retail-ops.controller';
import { RetailOpsService } from '../src/retail/retail-ops.service';

describe('RetailOpsController replenishment actions (e2e)', () => {
  let app: INestApplication;
  let retailOpsService: {
    reevaluateReplenishmentDraft: jest.Mock;
    listReplenishmentDrafts: jest.Mock;
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
    getReplenishmentNetworkSummary: jest.Mock;
    exportReplenishmentNetworkSummaryCsv: jest.Mock;
  };

  beforeAll(async () => {
    retailOpsService = {
      reevaluateReplenishmentDraft: jest.fn().mockResolvedValue({
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
        reevaluationOutcome: {
          previousStatus: 'DRAFT',
          nextStatus: 'SUBMITTED',
          previousBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
          nextBlockedReason: null,
          actionTaken: 'SUBMITTED',
        },
        replenishmentActions: [],
        items: [],
        createdAt: '2026-03-18T09:00:00.000Z',
        updatedAt: '2026-03-18T10:00:00.000Z',
      }),
      listReplenishmentDrafts: jest.fn(),
      getNetworkCommandCenterSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        enabledModuleCount: 2,
        criticalModuleCount: 1,
        highModuleCount: 1,
        normalModuleCount: 0,
        alerts: [
          {
            module: 'INVENTORY_CORE',
            code: 'NETWORK_STOCKOUT_PRESSURE',
            severity: 'CRITICAL',
            title: 'Stockouts need attention',
            summary: 'One branch is already stocked out.',
            metric: 1,
            action: 'Open the riskiest branch first.',
          },
        ],
        modules: [
          {
            module: 'INVENTORY_CORE',
            title: 'Inventory health',
            status: 'CRITICAL',
            statusReason: '1 branches are already in stockout conditions.',
            branchCount: 2,
            alertCount: 1,
            topAlert: {
              module: 'INVENTORY_CORE',
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
            ],
            actions: [
              {
                type: 'VIEW_STOCK_HEALTH_NETWORK_SUMMARY',
                method: 'GET',
                path: '/retail/v1/ops/stock-health/network-summary?branchId=3',
                enabled: true,
              },
            ],
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
            trend: {
              previousStatus: 'HIGH',
              statusDelta: 1,
              direction: 'WORSENING',
              previousAlertCount: 0,
              previousHeadlineMetricKey: 'outOfStockBranches',
              previousHeadlineMetricValue: 0,
              headlineMetricDelta: 1,
            },
          },
          {
            module: 'AI_ANALYTICS',
            title: 'AI operating risk',
            status: 'HIGH',
            statusReason: '1 branches remain on the AI watchlist.',
            branchCount: 2,
            alertCount: 1,
            topAlert: {
              module: 'AI_ANALYTICS',
              code: 'NETWORK_AI_WATCH',
              severity: 'WATCH',
              title: 'AI watchlist remains active',
              summary: 'One branch remains on the AI watchlist.',
              metric: 1,
              action: 'Review the lowest-health branch.',
            },
            metrics: [
              {
                key: 'averageHealthScore',
                label: 'Average health score',
                value: 67,
              },
            ],
            actions: [
              {
                type: 'VIEW_AI_NETWORK_SUMMARY',
                method: 'GET',
                path: '/retail/v1/ops/ai-insights/network-summary?branchId=3',
                enabled: true,
              },
            ],
            branchPreviews: [
              {
                branchId: 8,
                branchName: 'Airport',
                branchCode: 'BR-8',
                status: 'WATCH',
                statusReason: 'Branch health score is below target',
                actionPath: '/retail/v1/ops/ai-insights?branchId=8',
              },
            ],
            trend: {
              previousStatus: 'NORMAL',
              statusDelta: 1,
              direction: 'WORSENING',
              previousAlertCount: 0,
              previousHeadlineMetricKey: 'averageHealthScore',
              previousHeadlineMetricValue: 72,
              headlineMetricDelta: -5,
            },
          },
        ],
      }),
      getLatestNetworkCommandCenterReportSnapshot: jest.fn().mockResolvedValue({
        snapshotKey: 'retail:ops:command-center:snapshot:3:abc123',
        generatedAt: '2026-03-19T11:00:00.000Z',
        expiresAt: '2026-04-18T11:00:00.000Z',
        filters: {
          branchId: 3,
          branchLimit: 2,
          module: 'INVENTORY_CORE',
          status: 'CRITICAL',
          hasAlertsOnly: true,
          alertSeverity: 'CRITICAL',
        },
        summary: {
          anchorBranchId: 3,
          retailTenantId: 21,
          branchCount: 2,
          enabledModuleCount: 1,
          criticalModuleCount: 1,
          highModuleCount: 0,
          normalModuleCount: 0,
          alerts: [],
          modules: [],
        },
      }),
      captureNetworkCommandCenterReportSnapshot: jest.fn().mockResolvedValue({
        snapshotKey: 'retail:ops:command-center:snapshot:3:abc123',
        generatedAt: '2026-03-19T11:00:00.000Z',
        expiresAt: '2026-04-18T11:00:00.000Z',
        filters: {
          branchId: 3,
          branchLimit: 2,
          module: 'INVENTORY_CORE',
          status: 'CRITICAL',
          hasAlertsOnly: true,
          alertSeverity: 'CRITICAL',
        },
        summary: {
          anchorBranchId: 3,
          retailTenantId: 21,
          branchCount: 2,
          enabledModuleCount: 1,
          criticalModuleCount: 1,
          highModuleCount: 0,
          normalModuleCount: 0,
          alerts: [],
          modules: [],
        },
      }),
      exportNetworkCommandCenterSummaryCsv: jest
        .fn()
        .mockResolvedValue(
          'module,status,previewBranchName\nINVENTORY_CORE,CRITICAL,"HQ"',
        ),
      getPosOperations: jest.fn().mockResolvedValue({
        summary: {
          branchId: 3,
          windowHours: 24,
          orderCount: 12,
          grossSales: 1480,
          paidSales: 1310,
          averageOrderValue: 123.33,
          paidOrderCount: 9,
          unpaidOrderCount: 2,
          failedPaymentOrderCount: 1,
          openOrderCount: 3,
          delayedFulfillmentOrderCount: 1,
          deliveredOrderCount: 8,
          cancelledOrderCount: 1,
          activeStaffCount: 3,
          managerCount: 1,
          operatorCount: 2,
          lastOrderAt: '2026-03-19T10:30:00.000Z',
        },
        alerts: [
          {
            code: 'FAILED_PAYMENT_RECOVERY',
            severity: 'CRITICAL',
            title: 'Failed POS payments need recovery',
            summary: 'At least one order failed payment.',
            metric: 1,
            action: 'Review the failed-payment queue.',
          },
        ],
        paymentMix: [
          {
            paymentMethod: 'COD',
            orderCount: 5,
            grossSales: 600,
            paidOrderCount: 4,
          },
        ],
        statusMix: [{ status: 'DELIVERED', orderCount: 8, grossSales: 980 }],
        topItems: [
          {
            productId: 14,
            productName: 'Rice 5kg',
            quantity: 11,
            grossSales: 330,
          },
        ],
      }),
      exportPosOperationsCsv: jest
        .fn()
        .mockResolvedValue('branchId,windowHours,orderCount\n3,24,12'),
      getPosNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        windowHours: 24,
        totalOrderCount: 21,
        totalGrossSales: 2540,
        totalPaidSales: 2190,
        totalUnpaidOrderCount: 3,
        totalFailedPaymentOrderCount: 1,
        totalDelayedFulfillmentOrderCount: 2,
        criticalBranchCount: 1,
        highBranchCount: 1,
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
            lastOrderAt: '2026-03-19T10:30:00.000Z',
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
      }),
      exportPosNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,branchName,highestPriority\n3,"HQ",CRITICAL',
        ),
      getPosExceptions: jest.fn().mockResolvedValue({
        summary: {
          branchId: 3,
          windowHours: 24,
          totalExceptionCount: 2,
          filteredExceptionCount: 2,
          failedPaymentCount: 1,
          paymentReviewCount: 1,
          delayedFulfillmentCount: 0,
          criticalCount: 1,
          highCount: 1,
          normalCount: 0,
          lastOrderAt: '2026-03-19T10:30:00.000Z',
        },
        actions: [
          {
            type: 'VIEW_POS_OPERATIONS',
            method: 'GET',
            path: '/retail/v1/ops/pos-operations?branchId=3&windowHours=24',
            body: null,
            enabled: true,
          },
        ],
        items: [
          {
            orderId: 18,
            queueType: 'FAILED_PAYMENT',
            priority: 'CRITICAL',
            priorityReason:
              'Payment failed 12 hours ago and still needs branch recovery.',
            status: 'PROCESSING',
            paymentMethod: 'BANK_TRANSFER',
            paymentStatus: 'FAILED',
            paymentProofStatus: null,
            total: 80,
            itemCount: 1,
            ageHours: 12,
            createdAt: '2026-03-18T12:00:00.000Z',
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
      }),
      exportPosExceptionsCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,windowHours,orderId,queueType\n3,24,18,FAILED_PAYMENT',
        ),
      getPosExceptionNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        windowHours: 24,
        totalExceptionCount: 3,
        totalFailedPaymentCount: 1,
        totalPaymentReviewCount: 1,
        totalDelayedFulfillmentCount: 1,
        criticalBranchCount: 1,
        highBranchCount: 1,
        normalBranchCount: 0,
        alerts: [
          {
            code: 'NETWORK_POS_EXCEPTION_CRITICAL',
            severity: 'CRITICAL',
            title: 'Critical POS exception pressure spans multiple branches',
            summary:
              'At least one branch has payment or fulfillment exceptions requiring immediate operator action.',
            metric: 1,
            action: 'Open the highest-priority branch exception queues first.',
          },
        ],
        branches: [
          {
            branchId: 3,
            branchName: 'HQ',
            branchCode: 'HQ-3',
            highestPriority: 'CRITICAL',
            highestPriorityReason:
              'Payment failed 12 hours ago and still needs branch recovery.',
            exceptionCount: 2,
            failedPaymentCount: 1,
            paymentReviewCount: 1,
            delayedFulfillmentCount: 0,
            criticalCount: 1,
            highCount: 1,
            normalCount: 0,
            oldestExceptionAgeHours: 12,
            lastOrderAt: '2026-03-19T10:30:00.000Z',
            actions: [
              {
                type: 'VIEW_BRANCH_POS_EXCEPTIONS',
                method: 'GET',
                path: '/retail/v1/ops/pos-operations/exceptions?branchId=3&windowHours=24',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
      }),
      exportPosExceptionNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName,exceptionCount\n3,"HQ",2'),
      getPosOrderDetail: jest.fn().mockResolvedValue({
        summary: {
          orderId: 18,
          branchId: 3,
          queueType: 'PAYMENT_REVIEW',
          priority: 'HIGH',
          priorityReason:
            'Payment proof has been waiting 8 hours for admin review.',
          status: 'PROCESSING',
          paymentMethod: 'BANK_TRANSFER',
          paymentStatus: 'UNPAID',
          paymentProofStatus: 'PENDING_REVIEW',
          total: 80,
          currency: 'USD',
          itemCount: 1,
          totalUnits: 2,
          ageHours: 8,
          createdAt: '2026-03-19T04:00:00.000Z',
          deliveryAssignedAt: null,
          outForDeliveryAt: null,
          deliveryResolvedAt: null,
          proofOfDeliveryUrl: null,
          deliveryFailureReasonCode: null,
          deliveryFailureNotes: null,
          customerName: 'Buyer One',
          customerPhoneNumber: '251900000001',
          shippingCity: 'Addis Ababa',
        },
        actions: [
          {
            type: 'VERIFY_PAYMENT_PROOF',
            method: 'PATCH',
            path: '/admin/orders/18/payment-proof/status',
            body: { status: 'VERIFIED' },
            enabled: true,
          },
        ],
        items: [
          {
            productId: 91,
            productName: 'Rice 5kg',
            quantity: 2,
            unitPrice: 15,
            lineTotal: 30,
          },
        ],
      }),
      getStockHealth: jest.fn(),
      exportStockHealthCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,inventoryId,stockStatus\n3,11,OUT_OF_STOCK',
        ),
      getStockHealthNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        totalSkus: 18,
        healthyCount: 10,
        replenishmentCandidateCount: 5,
        outOfStockCount: 2,
        negativeAvailableCount: 1,
        inboundOpenPoUnits: 24,
        committedUnits: 17,
        outOfStockBranchCount: 1,
        reorderNowBranchCount: 1,
        lowStockBranchCount: 0,
        alerts: [
          {
            code: 'NETWORK_STOCKOUT_PRESSURE',
            severity: 'CRITICAL',
            title: 'Out-of-stock pressure spans multiple branches',
            summary:
              'At least one branch has already crossed into active stockouts and needs immediate replenishment focus.',
            metric: 1,
            action:
              'Open the riskiest branch stock-health queues first and expedite supplier or transfer recovery.',
          },
        ],
        branches: [
          {
            branchId: 3,
            branchName: 'HQ',
            branchCode: 'HQ-3',
            worstStockStatus: 'OUT_OF_STOCK',
            worstStockStatusReason: '2 SKUs are already out of stock.',
            totalSkus: 10,
            healthyCount: 5,
            replenishmentCandidateCount: 3,
            outOfStockCount: 2,
            negativeAvailableCount: 1,
            inboundOpenPoUnits: 16,
            committedUnits: 11,
            lastUpdatedAt: '2026-03-18T09:00:00.000Z',
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
      }),
      exportStockHealthNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,branchName,worstStockStatus\n3,"HQ",OUT_OF_STOCK',
        ),
      getAiInsights: jest.fn().mockResolvedValue({
        summary: {
          branchId: 3,
          generatedAt: '2026-03-18T10:00:00.000Z',
          healthScore: 71,
          totalSkus: 14,
          atRiskSkus: 5,
          outOfStockSkus: 2,
          negativeAvailableSkus: 1,
          inboundOpenPoUnits: 18,
          openPurchaseOrderCount: 3,
          openPurchaseOrderValue: 480.5,
          staleOpenPurchaseOrderCount: 1,
          blockedAutoSubmitDraftCount: 1,
        },
        insights: [
          {
            code: 'STOCKOUT_PRESSURE',
            severity: 'CRITICAL',
            title: '2 SKUs are already out of stock',
            summary:
              'Immediate replenishment is required to recover lost sales and avoid cascading transfer exceptions.',
            metric: 2,
            action:
              'Prioritize emergency reorders for the highest-risk SKUs below.',
          },
        ],
        productRisks: [
          {
            productId: 9,
            stockStatus: 'OUT_OF_STOCK',
            availableToSell: 0,
            safetyStock: 5,
            inboundOpenPo: 4,
            shortageToSafetyStock: 5,
            riskScore: 80,
            recommendedReorderUnits: 1,
            lastReceivedAt: null,
            lastPurchaseOrderId: 71,
          },
        ],
      }),
      exportAiInsightsCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,generatedAt,healthScore,productId,riskScore\n3,"2026-03-18T10:00:00.000Z",71,9,80',
        ),
      getAiNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        averageHealthScore: 64,
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
            title: 'Critical AI operating risk spans multiple branches',
            summary:
              'At least one branch is surfacing critical AI risk signals around stockouts, negative availability, or missing inbound coverage.',
            metric: 1,
            action:
              'Open the lowest-health branches first and clear the critical risk list before new demand widens the gap.',
          },
        ],
        branches: [
          {
            branchId: 3,
            branchName: 'HQ',
            branchCode: 'HQ-3',
            healthScore: 41,
            highestSeverity: 'CRITICAL',
            highestSeverityReason: 'Branch health score is below target',
            totalSkus: 14,
            atRiskSkus: 5,
            outOfStockSkus: 2,
            negativeAvailableSkus: 1,
            inboundOpenPoUnits: 18,
            openPurchaseOrderCount: 3,
            staleOpenPurchaseOrderCount: 1,
            blockedAutoSubmitDraftCount: 1,
            topInsightCodes: ['HEALTH_SCORE_BELOW_TARGET', 'STOCKOUT_PRESSURE'],
            actions: [
              {
                type: 'VIEW_BRANCH_AI_INSIGHTS',
                method: 'GET',
                path: '/retail/v1/ops/ai-insights?branchId=3',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
      }),
      exportAiNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,branchName,healthScore,highestSeverity\n3,"HQ",41,CRITICAL',
        ),
      getAccountingOverview: jest.fn().mockResolvedValue({
        summary: {
          branchId: 3,
          openCommitmentCount: 2,
          openCommitmentValue: 425,
          receivedPendingReconciliationCount: 1,
          receivedPendingReconciliationValue: 300,
          discrepancyOpenCount: 1,
          discrepancyResolvedCount: 0,
          discrepancyApprovedCount: 1,
          reconcileReadyCount: 1,
          oldestOpenCommitmentAgeHours: 54,
          oldestReceivedPendingReconciliationAgeHours: 18,
          supplierExposure: [
            {
              supplierProfileId: 18,
              openCommitmentCount: 1,
              openCommitmentValue: 125,
              receivedPendingReconciliationCount: 0,
              discrepancyOpenCount: 0,
              shortageUnitCount: 0,
              damagedUnitCount: 0,
              shortageValue: 0,
              damagedValue: 0,
            },
          ],
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
            critical: 0,
            high: 1,
            normal: 0,
          },
        },
        alerts: [
          {
            code: 'DISCREPANCY_SLA_BREACH',
            severity: 'CRITICAL',
            title: 'Open receipt discrepancies have breached SLA',
            summary:
              'At least one receipt discrepancy has remained unresolved for more than 72 hours.',
            metric: 1,
            action:
              'Escalate the affected supplier disputes and clear the oldest discrepancy queue first.',
          },
        ],
        items: [
          {
            purchaseOrderId: 82,
            orderNumber: 'PO-82',
            status: 'RECEIVED',
            supplierProfileId: 16,
            currency: 'USD',
            total: 300,
            outstandingUnitCount: 0,
            shortageUnitCount: 0,
            damagedUnitCount: 0,
            orderAgeHours: 18,
            accountingState: 'READY_TO_RECONCILE',
            lastDiscrepancyStatus: 'APPROVED',
            lastReceiptEventId: 502,
            lastReceiptEventAgeHours: 12,
            priority: 'HIGH',
            priorityReason:
              'Received order is aging in the reconciliation queue.',
            actions: [
              {
                type: 'VIEW_RECEIPT_EVENTS',
                method: 'GET',
                path: '/hub/v1/purchase-orders/82/receipt-events',
                body: null,
                enabled: true,
              },
              {
                type: 'MARK_RECONCILED',
                method: 'PATCH',
                path: '/hub/v1/purchase-orders/82/status',
                body: { status: 'RECONCILED' },
                enabled: true,
              },
            ],
          },
        ],
      }),
      exportAccountingOverviewCsv: jest
        .fn()
        .mockResolvedValue('branchId,purchaseOrderId,priority\n3,82,HIGH'),
      getAccountingNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        openCommitmentCount: 1,
        openCommitmentValue: 900,
        receivedPendingReconciliationCount: 0,
        discrepancyOpenCount: 1,
        discrepancyApprovedCount: 1,
        reconcileReadyCount: 1,
        priorityQueue: { critical: 1, high: 1, normal: 1 },
        criticalBranchCount: 1,
        highBranchCount: 1,
        normalBranchCount: 0,
        alerts: [
          {
            code: 'NETWORK_DISCREPANCY_SLA_RISK',
            severity: 'CRITICAL',
            title: 'Discrepancy review risk spans multiple branches',
            summary:
              'At least one branch has open receipt discrepancies that require accounting review.',
            metric: 1,
            action:
              'Clear the oldest discrepancy queues first, then approve resolved supplier responses.',
          },
        ],
        branches: [
          {
            branchId: 3,
            branchName: 'HQ',
            branchCode: 'HQ-3',
            highestPriority: 'CRITICAL',
            highestPriorityReason:
              'Open discrepancy has exceeded the 72-hour SLA.',
            openCommitmentCount: 0,
            openCommitmentValue: 0,
            receivedPendingReconciliationCount: 0,
            discrepancyOpenCount: 1,
            discrepancyApprovedCount: 0,
            reconcileReadyCount: 0,
            oldestOpenCommitmentAgeHours: 0,
            oldestReceivedPendingReconciliationAgeHours: 0,
            priorityQueue: { critical: 1, high: 0, normal: 0 },
            queueItemCount: 1,
            actions: [
              {
                type: 'VIEW_BRANCH_ACCOUNTING_OVERVIEW',
                method: 'GET',
                path: '/retail/v1/ops/accounting-overview?branchId=3&accountingState=DISCREPANCY_REVIEW',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
      }),
      exportAccountingNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,branchName,highestPriority\n3,"HQ",CRITICAL',
        ),
      getAccountingPayoutExceptions: jest.fn().mockResolvedValue({
        summary: {
          branchId: 3,
          windowHours: 168,
          totalExceptionCount: 2,
          filteredExceptionCount: 2,
          autoRetryRequiredCount: 1,
          reconciliationRequiredCount: 1,
          criticalCount: 1,
          highCount: 1,
          normalCount: 0,
          totalAmountAtRisk: 200,
          lastPayoutAt: '2026-03-19T10:30:00.000Z',
        },
        alerts: [
          {
            code: 'ACCOUNTING_PAYOUT_CRITICAL',
            severity: 'CRITICAL',
            title:
              'Critical payout exceptions need immediate finance attention',
            summary:
              "At least one payout exception has breached the tenant's normal recovery window.",
            metric: 1,
            action:
              'Prioritize the oldest failed retries and unreconciled payout debits first.',
          },
        ],
        items: [
          {
            payoutLogId: 901,
            branchId: 3,
            orderId: 18,
            orderItemId: 201,
            exceptionType: 'AUTO_RETRY_REQUIRED',
            priority: 'CRITICAL',
            priorityReason:
              'Auto payout has been failing for more than 24 hours and needs immediate finance recovery.',
            provider: 'EBIRR',
            payoutStatus: 'FAILED',
            orderStatus: 'DELIVERED',
            paymentMethod: 'EBIRR',
            paymentStatus: 'PAID',
            amount: 80,
            currency: 'ETB',
            vendorId: 77,
            vendorName: 'Vendor One',
            vendorPhoneNumber: '251900000111',
            failureReason: 'Gateway timeout',
            ageHours: 30,
            createdAt: '2026-03-18T04:00:00.000Z',
            actions: [
              {
                type: 'RETRY_AUTO_PAYOUT',
                method: 'POST',
                path: '/admin/wallet/payouts/901/retry-auto',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
      }),
      exportAccountingPayoutExceptionsCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,payoutLogId,exceptionType\n3,901,AUTO_RETRY_REQUIRED',
        ),
      getAccountingPayoutNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        windowHours: 168,
        exceptionCount: 2,
        autoRetryRequiredCount: 1,
        reconciliationRequiredCount: 1,
        totalAmountAtRisk: 200,
        priorityQueue: { critical: 1, high: 1, normal: 0 },
        criticalBranchCount: 1,
        highBranchCount: 1,
        normalBranchCount: 0,
        alerts: [
          {
            code: 'NETWORK_ACCOUNTING_PAYOUT_CRITICAL',
            severity: 'CRITICAL',
            title: 'Critical payout-exception pressure spans multiple branches',
            summary:
              'At least one branch has payout recovery work that has aged beyond the normal finance window.',
            metric: 1,
            action:
              'Open the highest-priority branch payout queues first and clear blocked retries.',
          },
        ],
        branches: [
          {
            branchId: 3,
            branchName: 'HQ',
            branchCode: 'HQ-3',
            highestPriority: 'CRITICAL',
            highestPriorityReason:
              'Auto payout has been failing for more than 24 hours and needs immediate finance recovery.',
            exceptionCount: 1,
            autoRetryRequiredCount: 1,
            reconciliationRequiredCount: 0,
            totalAmountAtRisk: 80,
            oldestExceptionAgeHours: 30,
            priorityQueue: { critical: 1, high: 0, normal: 0 },
            actions: [
              {
                type: 'VIEW_BRANCH_ACCOUNTING_PAYOUT_EXCEPTIONS',
                method: 'GET',
                path: '/retail/v1/ops/accounting-overview/payout-exceptions?branchId=3&windowHours=168',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
      }),
      exportAccountingPayoutNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue('branchId,branchName,exceptionCount\n3,"HQ",1'),
      getDesktopWorkbench: jest.fn().mockResolvedValue({
        summary: {
          branchId: 3,
          windowHours: 72,
          failedPosSyncJobCount: 1,
          openPosSyncJobCount: 0,
          rejectedSyncEntryCount: 2,
          pendingTransferCount: 2,
          inboundTransferPendingCount: 1,
          outboundTransferPendingCount: 1,
          negativeAdjustmentCount: 1,
          totalNegativeAdjustmentUnits: 18,
          lastProcessedPosSyncAt: '2026-03-18T09:00:00.000Z',
        },
        alerts: [
          {
            code: 'POS_SYNC_FAILURES',
            severity: 'CRITICAL',
            title: 'POS sync jobs need desktop intervention',
            summary:
              'At least one POS sync job has failed or rejected entries for this branch.',
            metric: 1,
            action:
              'Inspect the failed sync jobs and re-run or correct rejected entries.',
          },
        ],
        syncQueue: [
          {
            jobId: 401,
            syncType: 'STOCK_DELTA',
            status: 'FAILED',
            createdAt: '2026-03-18T05:00:00.000Z',
            processedAt: null,
            rejectedCount: 2,
            failedEntryCount: 2,
            priority: 'CRITICAL',
            priorityReason:
              'POS sync job failed or rejected entries need manual review.',
            actions: [
              {
                type: 'VIEW_SYNC_JOB',
                method: 'GET',
                path: '/admin/b2b/pos-sync-jobs/401',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
        transferQueue: [
          {
            transferId: 301,
            transferNumber: 'TR-301',
            direction: 'INBOUND',
            status: 'DISPATCHED',
            totalUnits: 12,
            ageHours: 60,
            createdAt: '2026-03-15T22:00:00.000Z',
            priority: 'CRITICAL',
            priorityReason:
              'Inbound transfer has been dispatched but not received for more than 48 hours.',
            actions: [
              {
                type: 'VIEW_TRANSFER',
                method: 'GET',
                path: '/admin/b2b/branch-transfers/301',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
        stockExceptions: [
          {
            movementId: 201,
            movementType: 'ADJUSTMENT',
            quantityDelta: -18,
            sourceType: 'MANUAL_RECOUNT',
            createdAt: '2026-03-18T04:00:00.000Z',
            note: 'cycle count drift',
            priority: 'HIGH',
            priorityReason:
              'Negative adjustment is large enough to warrant prompt review.',
            actions: [
              {
                type: 'VIEW_STOCK_MOVEMENTS',
                method: 'GET',
                path: '/admin/b2b/stock-movements?branchId=3',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
      }),
      exportDesktopWorkbenchCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,queueType,recordId,priority\n3,SYNC_QUEUE,401,CRITICAL',
        ),
      getDesktopNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        windowHours: 72,
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
        alerts: [
          {
            code: 'NETWORK_ADJUSTMENT_DRIFT',
            severity: 'WATCH',
            title:
              'Negative inventory drift is concentrated in specific branches',
            summary:
              'Recent stock adjustments show material negative drift in at least one branch.',
            metric: 1,
            action:
              'Audit the largest branch-level adjustment deltas and confirm whether the losses came from valid recounts or process gaps.',
          },
        ],
        branches: [
          {
            branchId: 8,
            branchName: 'Airport',
            branchCode: 'BR-8',
            highestPriority: 'HIGH',
            highestPriorityReason:
              'Negative adjustment is large enough to warrant prompt review.',
            failedPosSyncJobCount: 0,
            openPosSyncJobCount: 0,
            rejectedSyncEntryCount: 0,
            pendingTransferCount: 0,
            inboundTransferPendingCount: 0,
            outboundTransferPendingCount: 0,
            negativeAdjustmentCount: 1,
            totalNegativeAdjustmentUnits: 24,
            oldestTransferAgeHours: null,
            lastProcessedPosSyncAt: null,
            actions: [
              {
                type: 'VIEW_BRANCH_DESKTOP_WORKBENCH',
                method: 'GET',
                path: '/retail/v1/ops/desktop-workbench?branchId=8&windowHours=72&queueType=STOCK_EXCEPTIONS',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
      }),
      exportDesktopNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,branchName,highestPriority\n8,"Airport",HIGH',
        ),
      getDesktopSyncJobFailedEntries: jest.fn().mockResolvedValue({
        summary: {
          jobId: 401,
          branchId: 3,
          syncType: 'STOCK_DELTA',
          status: 'FAILED',
          rejectedCount: 2,
          failedEntryCount: 2,
          filteredEntryCount: 1,
          criticalEntryCount: 1,
          highEntryCount: 0,
          normalEntryCount: 0,
          transferLinkedEntryCount: 1,
          createdAt: '2026-03-18T05:00:00.000Z',
          processedAt: null,
        },
        actions: [
          {
            type: 'VIEW_SYNC_JOB',
            method: 'GET',
            path: '/admin/b2b/pos-sync-jobs/401',
            body: null,
            enabled: true,
          },
          {
            type: 'REPLAY_SYNC_FAILURES',
            method: 'POST',
            path: '/pos/v1/sync/jobs/401/replay-failures',
            body: { branchId: 3, entryIndexes: [1] },
            enabled: true,
          },
        ],
        items: [
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
            priority: 'CRITICAL',
            priorityReason:
              'Failed entry affects a transfer or counterparty branch workflow.',
            actions: [
              {
                type: 'REPLAY_SYNC_FAILURE_ENTRY',
                method: 'POST',
                path: '/pos/v1/sync/jobs/401/replay-failures',
                body: { branchId: 3, entryIndexes: [1] },
                enabled: true,
              },
              {
                type: 'VIEW_TRANSFER_DETAIL',
                method: 'GET',
                path: '/retail/v1/ops/desktop-workbench/transfers/301?branchId=3',
                body: null,
                enabled: true,
              },
            ],
          },
        ],
      }),
      getDesktopTransferDetail: jest.fn().mockResolvedValue({
        summary: {
          transferId: 301,
          transferNumber: 'TR-301',
          branchId: 3,
          direction: 'INBOUND',
          fromBranchId: 8,
          toBranchId: 3,
          status: 'DISPATCHED',
          ageHours: 60,
          totalUnits: 12,
          priority: 'CRITICAL',
          priorityReason:
            'Inbound transfer has been dispatched but not received for more than 48 hours.',
          note: 'urgent transfer',
          requestedAt: '2026-03-15T02:00:00.000Z',
          dispatchedAt: '2026-03-15T22:00:00.000Z',
          receivedAt: null,
          cancelledAt: null,
          createdAt: '2026-03-15T02:00:00.000Z',
          updatedAt: '2026-03-15T22:00:00.000Z',
        },
        actions: [
          {
            type: 'VIEW_TRANSFER',
            method: 'GET',
            path: '/admin/b2b/branch-transfers/301',
            body: null,
            enabled: true,
          },
          {
            type: 'RECEIVE_TRANSFER',
            method: 'PATCH',
            path: '/hub/v1/branch-transfers/301/receive',
            body: {},
            enabled: true,
          },
        ],
        items: [
          {
            id: 1,
            productId: 9,
            quantity: 12,
            note: 'fragile',
          },
        ],
      }),
      getDesktopStockExceptionDetail: jest.fn().mockResolvedValue({
        summary: {
          movementId: 201,
          branchId: 3,
          productId: 9,
          movementType: 'ADJUSTMENT',
          quantityDelta: -18,
          sourceType: 'BRANCH_TRANSFER',
          sourceReferenceId: 301,
          actorUserId: 18,
          note: 'cycle count drift',
          priority: 'HIGH',
          priorityReason:
            'Negative adjustment is large enough to warrant prompt review.',
          ageHours: 6,
          createdAt: '2026-03-18T04:00:00.000Z',
        },
        actions: [
          {
            type: 'VIEW_STOCK_MOVEMENTS',
            method: 'GET',
            path: '/admin/b2b/stock-movements?branchId=3',
            body: null,
            enabled: true,
          },
          {
            type: 'VIEW_TRANSFER_DETAIL',
            method: 'GET',
            path: '/retail/v1/ops/desktop-workbench/transfers/301?branchId=3',
            body: null,
            enabled: true,
          },
        ],
      }),
      getReplenishmentNetworkSummary: jest.fn().mockResolvedValue({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        totalDrafts: 2,
        staleDraftCount: 1,
        totalDraftValue: 200,
        supplierCount: 1,
        autoSubmitDraftCount: 2,
        blockedAutoSubmitDraftCount: 1,
        readyAutoSubmitDraftCount: 1,
        criticalBranchCount: 1,
        highBranchCount: 0,
        normalBranchCount: 1,
        alerts: [
          {
            code: 'NETWORK_REPLENISHMENT_BLOCKED',
            severity: 'CRITICAL',
            title:
              'Automation blockers are stalling replenishment across branches',
            summary:
              'At least one branch has auto-submit drafts blocked by policy, supplier, or entitlement constraints.',
            metric: 1,
            action:
              'Open the blocked branches first and clear the dominant blocked reasons before the next replenishment cycle.',
          },
        ],
        branches: [
          {
            branchId: 3,
            branchName: 'HQ',
            branchCode: 'HQ-3',
            highestPriority: 'CRITICAL',
            highestPriorityReason:
              '1 auto-submit drafts are blocked, led by MINIMUM_ORDER_TOTAL_NOT_MET.',
            totalDrafts: 1,
            staleDraftCount: 1,
            totalDraftValue: 125,
            supplierCount: 1,
            autoSubmitDraftCount: 1,
            blockedAutoSubmitDraftCount: 1,
            readyAutoSubmitDraftCount: 0,
            blockedReasonBreakdown: [
              {
                reason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
                count: 1,
              },
            ],
            actions: [
              {
                type: 'VIEW_BRANCH_REPLENISHMENT_DRAFTS',
                method: 'GET',
                path: '/retail/v1/ops/replenishment-drafts',
                query: {
                  branchId: 3,
                  autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
                  autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
                  supplierProfileId: 14,
                },
                enabled: true,
              },
            ],
          },
        ],
      }),
      exportReplenishmentNetworkSummaryCsv: jest
        .fn()
        .mockResolvedValue(
          'branchId,branchName,highestPriority\n3,"HQ",CRITICAL',
        ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RetailOpsController],
      providers: [
        {
          provide: RetailOpsService,
          useValue: retailOpsService,
        },
        {
          provide: RetailAttendanceService,
          useValue: { getAttendanceSummary: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 18, email: 'buyer@test.com', roles: ['B2B_BUYER'] };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RetailModulesGuard)
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

  it('re-evaluates a replenishment draft for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/retail/v1/ops/replenishment-drafts/42/re-evaluate')
      .query({ branchId: 3 })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 42,
        branchId: 3,
        status: 'SUBMITTED',
        replenishmentActions: [],
        reevaluationOutcome: expect.objectContaining({
          actionTaken: 'SUBMITTED',
        }),
      }),
    );
    expect(retailOpsService.reevaluateReplenishmentDraft).toHaveBeenCalledWith(
      3,
      42,
      {
        id: 18,
        email: 'buyer@test.com',
        roles: ['B2B_BUYER'],
      },
    );
  });

  it('rejects re-evaluation requests without a branchId query', async () => {
    await request(app.getHttpServer())
      .post('/api/retail/v1/ops/replenishment-drafts/42/re-evaluate')
      .expect(400);

    expect(retailOpsService.reevaluateReplenishmentDraft).toHaveBeenCalledTimes(
      1,
    );
  });

  it('returns a network command center summary for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/network-command-center')
      .query({
        branchId: 3,
        branchLimit: 2,
        module: 'INVENTORY_CORE',
        status: 'CRITICAL',
        hasAlertsOnly: true,
        alertSeverity: 'CRITICAL',
      })
      .expect(200);

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
    expect(response.body).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        enabledModuleCount: 2,
        modules: expect.arrayContaining([
          expect.objectContaining({
            module: 'INVENTORY_CORE',
            trend: expect.objectContaining({ direction: 'WORSENING' }),
          }),
          expect.objectContaining({
            module: 'AI_ANALYTICS',
            trend: expect.objectContaining({ direction: 'WORSENING' }),
          }),
        ]),
      }),
    );
  });

  it('captures a network command center report snapshot for scheduled reporting', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/retail/v1/ops/network-command-center/report-snapshots')
      .query({
        branchId: 3,
        branchLimit: 2,
        module: 'INVENTORY_CORE',
        status: 'CRITICAL',
        hasAlertsOnly: true,
        alertSeverity: 'CRITICAL',
      })
      .expect(200);

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
    expect(response.body).toEqual(
      expect.objectContaining({
        snapshotKey: 'retail:ops:command-center:snapshot:3:abc123',
        filters: expect.objectContaining({
          branchId: 3,
          branchLimit: 2,
        }),
      }),
    );
  });

  it('returns the latest network command center report snapshot for the requested filter set', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/network-command-center/report-snapshots/latest')
      .query({
        branchId: 3,
        branchLimit: 2,
        module: 'INVENTORY_CORE',
        status: 'CRITICAL',
        hasAlertsOnly: true,
        alertSeverity: 'CRITICAL',
      })
      .expect(200);

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
    expect(response.body).toEqual(
      expect.objectContaining({
        snapshotKey: 'retail:ops:command-center:snapshot:3:abc123',
      }),
    );
  });

  it('returns a network command center CSV export for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/network-command-center/export')
      .query({
        branchId: 3,
        branchLimit: 2,
        module: 'INVENTORY_CORE',
        status: 'CRITICAL',
        hasAlertsOnly: true,
        alertSeverity: 'CRITICAL',
      })
      .expect(200);

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
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toContain('module,status,previewBranchName');
  });

  it('returns POS operations for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/pos-operations')
      .query({
        branchId: 3,
        windowHours: 24,
        topItemsLimit: 5,
      })
      .expect(200);

    expect(retailOpsService.getPosOperations).toHaveBeenCalledWith({
      branchId: 3,
      windowHours: 24,
      topItemsLimit: 5,
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          branchId: 3,
          orderCount: 12,
          failedPaymentOrderCount: 1,
        }),
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'FAILED_PAYMENT_RECOVERY' }),
        ]),
        topItems: expect.arrayContaining([
          expect.objectContaining({ productName: 'Rice 5kg' }),
        ]),
      }),
    );
  });

  it('returns POS operations CSV export for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/pos-operations/export')
      .query({
        branchId: 3,
        windowHours: 24,
        topItemsLimit: 5,
      })
      .expect(200);

    expect(retailOpsService.exportPosOperationsCsv).toHaveBeenCalledWith({
      branchId: 3,
      windowHours: 24,
      topItemsLimit: 5,
    });
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toBe('branchId,windowHours,orderCount\n3,24,12');
  });

  it('returns POS network summary for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/pos-operations/network-summary')
      .query({
        branchId: 3,
        limit: 5,
        windowHours: 24,
        status: 'CRITICAL',
      })
      .expect(200);

    expect(retailOpsService.getPosNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 24,
      status: 'CRITICAL',
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        criticalBranchCount: 1,
        branches: expect.arrayContaining([
          expect.objectContaining({ highestPriority: 'CRITICAL' }),
        ]),
      }),
    );
  });

  it('returns POS network summary CSV export for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/pos-operations/network-summary/export')
      .query({
        branchId: 3,
        limit: 5,
        windowHours: 24,
        status: 'CRITICAL',
      })
      .expect(200);

    expect(retailOpsService.exportPosNetworkSummaryCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 24,
      status: 'CRITICAL',
    });
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toBe(
      'branchId,branchName,highestPriority\n3,"HQ",CRITICAL',
    );
  });

  it('returns POS exception queue items for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/pos-operations/exceptions')
      .query({
        branchId: 3,
        limit: 25,
        windowHours: 24,
        queueType: 'FAILED_PAYMENT',
        priority: 'CRITICAL',
      })
      .expect(200);

    expect(retailOpsService.getPosExceptions).toHaveBeenCalledWith({
      branchId: 3,
      limit: 25,
      windowHours: 24,
      queueType: 'FAILED_PAYMENT',
      priority: 'CRITICAL',
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({ totalExceptionCount: 2 }),
        items: expect.arrayContaining([
          expect.objectContaining({ orderId: 18, queueType: 'FAILED_PAYMENT' }),
        ]),
      }),
    );
  });

  it('returns POS exception queue CSV export for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/pos-operations/exceptions/export')
      .query({
        branchId: 3,
        limit: 25,
        windowHours: 24,
        queueType: 'FAILED_PAYMENT',
        priority: 'CRITICAL',
      })
      .expect(200);

    expect(retailOpsService.exportPosExceptionsCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 25,
      windowHours: 24,
      queueType: 'FAILED_PAYMENT',
      priority: 'CRITICAL',
    });
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toBe(
      'branchId,windowHours,orderId,queueType\n3,24,18,FAILED_PAYMENT',
    );
  });

  it('returns POS exception network summary for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/pos-operations/exceptions/network-summary')
      .query({
        branchId: 3,
        limit: 5,
        windowHours: 24,
        queueType: 'FAILED_PAYMENT',
        priority: 'CRITICAL',
      })
      .expect(200);

    expect(retailOpsService.getPosExceptionNetworkSummary).toHaveBeenCalledWith(
      {
        branchId: 3,
        limit: 5,
        windowHours: 24,
        queueType: 'FAILED_PAYMENT',
        priority: 'CRITICAL',
      },
    );
    expect(response.body).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        criticalBranchCount: 1,
        branches: expect.arrayContaining([
          expect.objectContaining({
            highestPriority: 'CRITICAL',
            exceptionCount: 2,
          }),
        ]),
      }),
    );
  });

  it('returns POS exception network summary CSV export for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/retail/v1/ops/pos-operations/exceptions/network-summary/export',
      )
      .query({
        branchId: 3,
        limit: 5,
        windowHours: 24,
        queueType: 'FAILED_PAYMENT',
        priority: 'CRITICAL',
      })
      .expect(200);

    expect(
      retailOpsService.exportPosExceptionNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 24,
      queueType: 'FAILED_PAYMENT',
      priority: 'CRITICAL',
    });
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toBe('branchId,branchName,exceptionCount\n3,"HQ",2');
  });

  it('returns POS order drilldown detail for the requested branch order', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/pos-operations/orders/18')
      .query({ branchId: 3 })
      .expect(200);

    expect(retailOpsService.getPosOrderDetail).toHaveBeenCalledWith(18, {
      branchId: 3,
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          orderId: 18,
          queueType: 'PAYMENT_REVIEW',
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({ type: 'VERIFY_PAYMENT_PROOF' }),
        ]),
      }),
    );
  });

  it('returns replenishment network summary for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/replenishment-drafts/network-summary')
      .query({
        branchId: 3,
        supplierProfileId: 14,
        autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
        autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
        limit: 5,
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        criticalBranchCount: 1,
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'NETWORK_REPLENISHMENT_BLOCKED' }),
        ]),
        branches: expect.arrayContaining([
          expect.objectContaining({ branchId: 3, highestPriority: 'CRITICAL' }),
        ]),
      }),
    );
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

  it('returns replenishment network summary CSV export for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/replenishment-drafts/network-summary/export')
      .query({
        branchId: 3,
        supplierProfileId: 14,
        autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
        autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
        limit: 5,
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_replenishment_network_summary_\d+\.csv"$/,
    );
    expect(response.text).toContain('branchId,branchName,highestPriority');
    expect(
      retailOpsService.exportReplenishmentNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      supplierProfileId: 14,
      autoReplenishmentSubmissionMode: 'AUTO_SUBMIT',
      autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
      limit: 5,
    });
  });

  it('returns AI insights for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/ai-insights')
      .query({ branchId: 3, limit: 10 })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          branchId: 3,
          healthScore: 71,
          outOfStockSkus: 2,
        }),
        insights: expect.arrayContaining([
          expect.objectContaining({
            code: 'STOCKOUT_PRESSURE',
          }),
        ]),
        productRisks: expect.arrayContaining([
          expect.objectContaining({
            productId: 9,
            riskScore: 80,
          }),
        ]),
      }),
    );
    expect(retailOpsService.getAiInsights).toHaveBeenCalledWith({
      branchId: 3,
      limit: 10,
    });
  });

  it('returns AI insights CSV export for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/ai-insights/export')
      .query({ branchId: 3, limit: 10 })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_ai_insights_3_\d+\.csv"$/,
    );
    expect(response.text).toContain(
      'branchId,generatedAt,healthScore,productId,riskScore',
    );
    expect(retailOpsService.exportAiInsightsCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 10,
    });
  });

  it('returns AI network summary for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/ai-insights/network-summary')
      .query({ branchId: 3, limit: 5, severity: 'CRITICAL' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        criticalBranchCount: 1,
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'NETWORK_AI_CRITICAL_RISK' }),
        ]),
        branches: expect.arrayContaining([
          expect.objectContaining({
            branchId: 3,
            highestSeverity: 'CRITICAL',
            healthScore: 41,
          }),
        ]),
      }),
    );
    expect(retailOpsService.getAiNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      severity: 'CRITICAL',
    });
  });

  it('returns AI network summary CSV export for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/ai-insights/network-summary/export')
      .query({ branchId: 3, limit: 5, severity: 'CRITICAL' })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_ai_network_summary_\d+\.csv"$/,
    );
    expect(response.text).toContain(
      'branchId,branchName,healthScore,highestSeverity',
    );
    expect(retailOpsService.exportAiNetworkSummaryCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      severity: 'CRITICAL',
    });
  });

  it('rejects AI insight requests without a branchId query', async () => {
    await request(app.getHttpServer())
      .get('/api/retail/v1/ops/ai-insights')
      .expect(400);

    expect(retailOpsService.getAiInsights).toHaveBeenCalledTimes(1);
  });

  it('returns stock-health CSV export for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/stock-health/export')
      .query({ branchId: 3, page: 1, limit: 20 })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_stock_health_3_\d+\.csv"$/,
    );
    expect(response.text).toContain('branchId,inventoryId,stockStatus');
    expect(retailOpsService.exportStockHealthCsv).toHaveBeenCalledWith({
      branchId: 3,
      page: 1,
      limit: 20,
    });
  });

  it('returns stock-health network summary for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/stock-health/network-summary')
      .query({ branchId: 3, limit: 5, stockStatus: 'OUT_OF_STOCK' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        outOfStockBranchCount: 1,
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'NETWORK_STOCKOUT_PRESSURE' }),
        ]),
        branches: expect.arrayContaining([
          expect.objectContaining({
            branchId: 3,
            worstStockStatus: 'OUT_OF_STOCK',
          }),
        ]),
      }),
    );
    expect(retailOpsService.getStockHealthNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      stockStatus: 'OUT_OF_STOCK',
    });
  });

  it('returns stock-health network summary CSV export for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/stock-health/network-summary/export')
      .query({ branchId: 3, limit: 5, stockStatus: 'OUT_OF_STOCK' })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_stock_health_network_summary_\d+\.csv"$/,
    );
    expect(response.text).toContain('branchId,branchName,worstStockStatus');
    expect(
      retailOpsService.exportStockHealthNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      stockStatus: 'OUT_OF_STOCK',
    });
  });

  it('returns accounting overview for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/accounting-overview')
      .query({
        branchId: 3,
        limit: 20,
        accountingState: 'DISCREPANCY_REVIEW',
        priority: 'CRITICAL',
        supplierProfileId: 14,
        slaBreachedOnly: true,
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          branchId: 3,
          openCommitmentCount: 2,
          reconcileReadyCount: 1,
          oldestOpenCommitmentAgeHours: 54,
          priorityQueue: expect.objectContaining({
            high: 1,
          }),
        }),
        alerts: expect.arrayContaining([
          expect.objectContaining({
            code: 'DISCREPANCY_SLA_BREACH',
          }),
        ]),
        items: expect.arrayContaining([
          expect.objectContaining({
            purchaseOrderId: 82,
            accountingState: 'READY_TO_RECONCILE',
            priority: 'HIGH',
            orderAgeHours: 18,
            lastReceiptEventAgeHours: 12,
          }),
        ]),
      }),
    );
    expect(retailOpsService.getAccountingOverview).toHaveBeenCalledWith({
      branchId: 3,
      limit: 20,
      accountingState: 'DISCREPANCY_REVIEW',
      priority: 'CRITICAL',
      supplierProfileId: 14,
      slaBreachedOnly: true,
    });
  });

  it('returns accounting overview CSV export for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/accounting-overview/export')
      .query({
        branchId: 3,
        limit: 20,
        accountingState: 'DISCREPANCY_REVIEW',
        priority: 'CRITICAL',
        supplierProfileId: 14,
        slaBreachedOnly: true,
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_accounting_overview_3_\d+\.csv"$/,
    );
    expect(response.text).toContain('branchId,purchaseOrderId,priority');
    expect(retailOpsService.exportAccountingOverviewCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 20,
      accountingState: 'DISCREPANCY_REVIEW',
      priority: 'CRITICAL',
      supplierProfileId: 14,
      slaBreachedOnly: true,
    });
  });

  it('returns accounting network summary for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/accounting-overview/network-summary')
      .query({
        branchId: 3,
        limit: 5,
        priority: 'CRITICAL',
        accountingState: 'DISCREPANCY_REVIEW',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        priorityQueue: expect.objectContaining({ critical: 1 }),
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'NETWORK_DISCREPANCY_SLA_RISK' }),
        ]),
        branches: expect.arrayContaining([
          expect.objectContaining({ branchId: 3, highestPriority: 'CRITICAL' }),
        ]),
      }),
    );
    expect(retailOpsService.getAccountingNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      priority: 'CRITICAL',
      accountingState: 'DISCREPANCY_REVIEW',
    });
  });

  it('returns accounting network summary CSV export for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/accounting-overview/network-summary/export')
      .query({
        branchId: 3,
        limit: 5,
        priority: 'CRITICAL',
        accountingState: 'DISCREPANCY_REVIEW',
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_accounting_network_summary_\d+\.csv"$/,
    );
    expect(response.text).toContain('branchId,branchName,highestPriority');
    expect(
      retailOpsService.exportAccountingNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      priority: 'CRITICAL',
      accountingState: 'DISCREPANCY_REVIEW',
    });
  });

  it('returns accounting payout exceptions for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/accounting-overview/payout-exceptions')
      .query({
        branchId: 3,
        limit: 25,
        windowHours: 168,
        exceptionType: 'AUTO_RETRY_REQUIRED',
        priority: 'CRITICAL',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          branchId: 3,
          totalExceptionCount: 2,
          totalAmountAtRisk: 200,
        }),
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'ACCOUNTING_PAYOUT_CRITICAL' }),
        ]),
        items: expect.arrayContaining([
          expect.objectContaining({
            payoutLogId: 901,
            exceptionType: 'AUTO_RETRY_REQUIRED',
          }),
        ]),
      }),
    );
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

  it('returns accounting payout exception CSV export for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/accounting-overview/payout-exceptions/export')
      .query({
        branchId: 3,
        limit: 25,
        windowHours: 168,
        exceptionType: 'AUTO_RETRY_REQUIRED',
        priority: 'CRITICAL',
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_accounting_payout_exceptions_3_\d+\.csv"$/,
    );
    expect(response.text).toContain('branchId,payoutLogId,exceptionType');
    expect(
      retailOpsService.exportAccountingPayoutExceptionsCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 25,
      windowHours: 168,
      exceptionType: 'AUTO_RETRY_REQUIRED',
      priority: 'CRITICAL',
    });
  });

  it('returns accounting payout network summary for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/retail/v1/ops/accounting-overview/payout-exceptions/network-summary',
      )
      .query({
        branchId: 3,
        limit: 5,
        windowHours: 168,
        priority: 'CRITICAL',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        priorityQueue: expect.objectContaining({ critical: 1 }),
        alerts: expect.arrayContaining([
          expect.objectContaining({
            code: 'NETWORK_ACCOUNTING_PAYOUT_CRITICAL',
          }),
        ]),
        branches: expect.arrayContaining([
          expect.objectContaining({ branchId: 3, highestPriority: 'CRITICAL' }),
        ]),
      }),
    );
    expect(
      retailOpsService.getAccountingPayoutNetworkSummary,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 168,
      priority: 'CRITICAL',
    });
  });

  it('returns accounting payout network summary CSV export for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/retail/v1/ops/accounting-overview/payout-exceptions/network-summary/export',
      )
      .query({
        branchId: 3,
        limit: 5,
        windowHours: 168,
        priority: 'CRITICAL',
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_accounting_payout_network_summary_\d+\.csv"$/,
    );
    expect(response.text).toContain('branchId,branchName,exceptionCount');
    expect(
      retailOpsService.exportAccountingPayoutNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 168,
      priority: 'CRITICAL',
    });
  });

  it('rejects accounting network summary requests without a branchId query', async () => {
    await request(app.getHttpServer())
      .get('/api/retail/v1/ops/accounting-overview/network-summary')
      .expect(400);

    expect(retailOpsService.getAccountingNetworkSummary).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rejects accounting overview requests without a branchId query', async () => {
    await request(app.getHttpServer())
      .get('/api/retail/v1/ops/accounting-overview')
      .expect(400);

    expect(retailOpsService.getAccountingOverview).toHaveBeenCalledTimes(1);
  });

  it('returns desktop workbench for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench')
      .query({
        branchId: 3,
        limit: 10,
        windowHours: 72,
        queueType: 'SYNC_QUEUE',
        priority: 'CRITICAL',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          branchId: 3,
          failedPosSyncJobCount: 1,
          pendingTransferCount: 2,
        }),
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'POS_SYNC_FAILURES' }),
        ]),
        syncQueue: expect.arrayContaining([
          expect.objectContaining({ jobId: 401, priority: 'CRITICAL' }),
        ]),
        transferQueue: expect.arrayContaining([
          expect.objectContaining({ transferId: 301, direction: 'INBOUND' }),
        ]),
        stockExceptions: expect.arrayContaining([
          expect.objectContaining({ movementId: 201, priority: 'HIGH' }),
        ]),
      }),
    );
    expect(retailOpsService.getDesktopWorkbench).toHaveBeenCalledWith({
      branchId: 3,
      limit: 10,
      windowHours: 72,
      queueType: 'SYNC_QUEUE',
      priority: 'CRITICAL',
    });
  });

  it('returns desktop workbench CSV export for the requested branch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench/export')
      .query({
        branchId: 3,
        limit: 10,
        windowHours: 72,
        queueType: 'SYNC_QUEUE',
        priority: 'CRITICAL',
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_desktop_workbench_3_\d+\.csv"$/,
    );
    expect(response.text).toContain('branchId,queueType,recordId,priority');
    expect(retailOpsService.exportDesktopWorkbenchCsv).toHaveBeenCalledWith({
      branchId: 3,
      limit: 10,
      windowHours: 72,
      queueType: 'SYNC_QUEUE',
      priority: 'CRITICAL',
    });
  });

  it('returns desktop network summary for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench/network-summary')
      .query({
        branchId: 3,
        limit: 5,
        windowHours: 72,
        queueType: 'STOCK_EXCEPTIONS',
        priority: 'HIGH',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        anchorBranchId: 3,
        retailTenantId: 21,
        branchCount: 2,
        criticalBranchCount: 0,
        alerts: expect.arrayContaining([
          expect.objectContaining({ code: 'NETWORK_ADJUSTMENT_DRIFT' }),
        ]),
        branches: expect.arrayContaining([
          expect.objectContaining({ branchId: 8, highestPriority: 'HIGH' }),
        ]),
      }),
    );
    expect(retailOpsService.getDesktopNetworkSummary).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 72,
      queueType: 'STOCK_EXCEPTIONS',
      priority: 'HIGH',
    });
  });

  it('returns desktop network summary CSV export for the requested branch tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench/network-summary/export')
      .query({
        branchId: 3,
        limit: 5,
        windowHours: 72,
        queueType: 'STOCK_EXCEPTIONS',
        priority: 'HIGH',
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="retail_desktop_network_summary_\d+\.csv"$/,
    );
    expect(response.text).toContain('branchId,branchName,highestPriority');
    expect(
      retailOpsService.exportDesktopNetworkSummaryCsv,
    ).toHaveBeenCalledWith({
      branchId: 3,
      limit: 5,
      windowHours: 72,
      queueType: 'STOCK_EXCEPTIONS',
      priority: 'HIGH',
    });
  });

  it('rejects desktop network summary requests without a branchId query', async () => {
    await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench/network-summary')
      .expect(400);

    expect(retailOpsService.getDesktopNetworkSummary).toHaveBeenCalledTimes(1);
  });

  it('rejects desktop workbench requests without a branchId query', async () => {
    await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench')
      .expect(400);

    expect(retailOpsService.getDesktopWorkbench).toHaveBeenCalledTimes(1);
  });

  it('returns desktop sync failed entries for the requested branch job', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench/sync-jobs/401/failed-entries')
      .query({
        branchId: 3,
        limit: 25,
        priority: 'CRITICAL',
        movementType: 'TRANSFER',
        transferOnly: true,
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          jobId: 401,
          branchId: 3,
          failedEntryCount: 2,
          filteredEntryCount: 1,
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({
            type: 'REPLAY_SYNC_FAILURES',
            body: { branchId: 3, entryIndexes: [1] },
          }),
        ]),
        items: expect.arrayContaining([
          expect.objectContaining({
            entryIndex: 1,
            priority: 'CRITICAL',
            actions: expect.arrayContaining([
              expect.objectContaining({ type: 'REPLAY_SYNC_FAILURE_ENTRY' }),
              expect.objectContaining({ type: 'VIEW_TRANSFER_DETAIL' }),
            ]),
          }),
        ]),
      }),
    );
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

  it('rejects desktop sync failed-entry requests without a branchId query', async () => {
    await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench/sync-jobs/401/failed-entries')
      .expect(400);

    expect(
      retailOpsService.getDesktopSyncJobFailedEntries,
    ).toHaveBeenCalledTimes(1);
  });

  it('returns desktop transfer detail for the requested branch transfer', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench/transfers/301')
      .query({ branchId: 3, includeItems: true })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          transferId: 301,
          branchId: 3,
          direction: 'INBOUND',
          priority: 'CRITICAL',
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({ type: 'RECEIVE_TRANSFER' }),
        ]),
        items: expect.arrayContaining([
          expect.objectContaining({ id: 1, productId: 9, quantity: 12 }),
        ]),
      }),
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

  it('rejects desktop transfer detail requests without a branchId query', async () => {
    await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench/transfers/301')
      .expect(400);

    expect(retailOpsService.getDesktopTransferDetail).toHaveBeenCalledTimes(1);
  });

  it('returns desktop stock exception detail for the requested branch movement', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench/stock-exceptions/201')
      .query({ branchId: 3 })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          movementId: 201,
          branchId: 3,
          sourceReferenceId: 301,
          priority: 'HIGH',
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({ type: 'VIEW_TRANSFER_DETAIL' }),
        ]),
      }),
    );
    expect(
      retailOpsService.getDesktopStockExceptionDetail,
    ).toHaveBeenCalledWith(201, {
      branchId: 3,
    });
  });

  it('rejects desktop stock exception detail requests without a branchId query', async () => {
    await request(app.getHttpServer())
      .get('/api/retail/v1/ops/desktop-workbench/stock-exceptions/201')
      .expect(400);

    expect(
      retailOpsService.getDesktopStockExceptionDetail,
    ).toHaveBeenCalledTimes(1);
  });
});
