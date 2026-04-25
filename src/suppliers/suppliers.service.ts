import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/roles.enum';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PurchaseOrderStatus,
  PurchaseOrder,
} from '../purchase-orders/entities/purchase-order.entity';
import { ProcurementWebhookEventType } from '../procurement-webhooks/entities/procurement-webhook-subscription.entity';
import { ProcurementWebhooksService } from '../procurement-webhooks/procurement-webhooks.service';
import {
  PurchaseOrderReceiptDiscrepancyStatus,
  PurchaseOrderReceiptEvent,
} from '../purchase-orders/entities/purchase-order-receipt-event.entity';
import { User } from '../users/entities/user.entity';
import { SupplierStaffAssignment } from '../supplier-staff/entities/supplier-staff-assignment.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateSupplierProfileDto } from './dto/create-supplier-profile.dto';
import {
  ActOnSupplierProcurementBranchInterventionDto,
  SupplierProcurementBranchInterventionAction,
} from './dto/act-on-supplier-procurement-branch-intervention.dto';
import {
  SupplierProcurementBranchInterventionActionHintMixEntryResponseDto,
  SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto,
  SupplierProcurementBranchInterventionAlertCountsResponseDto,
  SupplierProcurementBranchInterventionAlertCountsDeltaResponseDto,
  SupplierProcurementBranchInterventionAlertMixDeltaResponseDto,
  SupplierProcurementBranchInterventionAlertMixResponseDto,
  SupplierProcurementBranchInterventionBranchRollupResponseDto,
  SupplierProcurementBranchInterventionAppliedFiltersResponseDto,
  SupplierProcurementBranchInterventionDashboardAppliedFiltersResponseDto,
  SupplierProcurementBranchInterventionDashboardResponseDto,
  SupplierProcurementBranchInterventionEntryResponseDto,
  SupplierProcurementBranchInterventionIssueMixEntryResponseDto,
  SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto,
  SupplierProcurementBranchInterventionOverviewAlertStatusTransitionEntryResponseDto,
  SupplierProcurementBranchInterventionOverviewAlertStatusTransitionsResponseDto,
  SupplierProcurementBranchInterventionOverviewAlertStatusesResponseDto,
  SupplierProcurementBranchInterventionOverviewComparisonWindowResponseDto,
  SupplierProcurementBranchInterventionOverviewResponseDto,
  SupplierProcurementBranchInterventionOverviewSeverityTrendsResponseDto,
  SupplierProcurementBranchInterventionResponseDto,
  SupplierProcurementBranchInterventionBranchHotspotDeltaResponseDto,
  SupplierProcurementBranchInterventionSummaryResponseDto,
  SupplierProcurementBranchInterventionSummaryDeltaResponseDto,
  SupplierProcurementBranchInterventionSupplierHotspotDeltaResponseDto,
  SupplierProcurementBranchInterventionSupplierRollupResponseDto,
  SupplierProcurementOverviewAlertLevel,
  SupplierProcurementOverviewAlertStatusTransition,
  SupplierProcurementOverviewSeverityTrend,
} from './dto/supplier-procurement-branch-intervention-response.dto';
import { SupplierProcurementBranchInterventionDashboardQueryDto } from './dto/supplier-procurement-branch-intervention-dashboard-query.dto';
import {
  SupplierProcurementDashboardBranchRollupSortBy,
  SupplierProcurementDashboardSupplierRollupSortBy,
} from './dto/supplier-procurement-branch-intervention-dashboard-query.dto';
import {
  SupplierProcurementBranchInterventionAgeBucket,
  SupplierProcurementBranchInterventionQueryDto,
  SupplierProcurementBranchInterventionSortBy,
} from './dto/supplier-procurement-branch-intervention-query.dto';
import { SupplierProcurementBranchInterventionDetailQueryDto } from './dto/supplier-procurement-branch-intervention-detail-query.dto';
import { SupplierProcurementBranchInterventionDetailResponseDto } from './dto/supplier-procurement-branch-intervention-detail-response.dto';
import { SupplierProcurementScorecardQueryDto } from './dto/supplier-procurement-scorecard-query.dto';
import {
  SupplierProcurementScorecardAppliedFiltersResponseDto,
  SupplierProcurementScorecardBreakdownResponseDto,
  SupplierProcurementScorecardEntryResponseDto,
  SupplierProcurementScorecardResponseDto,
} from './dto/supplier-procurement-scorecard-response.dto';
import { SupplierProcurementSummaryQueryDto } from './dto/supplier-procurement-summary-query.dto';
import {
  SupplierProcurementRecentOrderResponseDto,
  SupplierProcurementStatusCountResponseDto,
  SupplierProcurementSummaryResponseDto,
} from './dto/supplier-procurement-summary-response.dto';
import { SupplierProcurementTrendQueryDto } from './dto/supplier-procurement-trend-query.dto';
import {
  SupplierProcurementTrendAppliedFiltersResponseDto,
  SupplierProcurementTrendBranchBucketResponseDto,
  SupplierProcurementTrendResponseDto,
  SupplierProcurementTrendDiscrepancyContributorResponseDto,
  SupplierProcurementTrendOrderContributorResponseDto,
  SupplierProcurementTrendWindowResponseDto,
} from './dto/supplier-procurement-trend-response.dto';
import { UpdateSupplierProfileStatusDto } from './dto/update-supplier-profile-status.dto';
import { UpdateSupplierProfileActiveDto } from './dto/update-supplier-profile-active.dto';
import {
  SupplierOnboardingStatus,
  SupplierProfile,
} from './entities/supplier-profile.entity';

type SupplierProcurementMetrics = Pick<
  SupplierProcurementSummaryResponseDto,
  'totalOrders' | 'activeOrderCount' | 'statusCounts' | 'workQueues' | 'sla'
>;

type SupplierProcurementScoreComputation = {
  finalScore: number;
  breakdown: SupplierProcurementScorecardBreakdownResponseDto;
};

type SupplierProcurementBranchInterventionWorkflowSummary = {
  latestAction: SupplierProcurementBranchInterventionAction | null;
  latestActionAt: string | null;
  latestActionActorEmail: string | null;
  latestAssigneeUserId: number | null;
};

const SUPPLIER_PROFILE_TRANSITIONS: Record<
  SupplierOnboardingStatus,
  SupplierOnboardingStatus[]
> = {
  [SupplierOnboardingStatus.DRAFT]: [SupplierOnboardingStatus.PENDING_REVIEW],
  [SupplierOnboardingStatus.PENDING_REVIEW]: [
    SupplierOnboardingStatus.APPROVED,
    SupplierOnboardingStatus.REJECTED,
  ],
  [SupplierOnboardingStatus.APPROVED]: [],
  [SupplierOnboardingStatus.REJECTED]: [
    SupplierOnboardingStatus.PENDING_REVIEW,
  ],
};

const PROCUREMENT_TREND_WINDOWS = [7, 30, 90] as const;
const PROCUREMENT_INTERVENTION_BASELINE_DAYS = 90;

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    @InjectRepository(SupplierProfile)
    private readonly supplierProfilesRepository: Repository<SupplierProfile>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderReceiptEvent)
    private readonly purchaseOrderReceiptEventsRepository: Repository<PurchaseOrderReceiptEvent>,
    @InjectRepository(SupplierStaffAssignment)
    private readonly supplierStaffAssignmentsRepository: Repository<SupplierStaffAssignment>,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly procurementWebhooksService: ProcurementWebhooksService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(dto: CreateSupplierProfileDto): Promise<SupplierProfile> {
    const user = await this.usersRepository.findOne({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    // Self-serve onboarding: suppliers are auto-approved on profile creation so
    // they can immediately publish offers visible to POS buyers. Revisit once
    // an admin review queue exists in the suuq-admin panel.
    const profile = this.supplierProfilesRepository.create({
      ...dto,
      countriesServed: dto.countriesServed ?? [],
      onboardingStatus: SupplierOnboardingStatus.APPROVED,
    });
    await this.supplierProfilesRepository.save(profile);
    return this.findOneById(profile.id);
  }

  async findAll(): Promise<SupplierProfile[]> {
    return this.supplierProfilesRepository.find({
      order: { createdAt: 'DESC' },
      relations: { user: true },
    });
  }

  /**
   * Returns supplier profiles visible to the calling user. Platform admins
   * see everything; suppliers see only profiles they own OR have an active
   * staff assignment for.
   */
  async findAllForUser(actor: {
    id: number | null;
    roles: UserRole[];
  }): Promise<SupplierProfile[]> {
    const isAdmin =
      actor.roles?.includes(UserRole.SUPER_ADMIN) ||
      actor.roles?.includes(UserRole.ADMIN);
    if (isAdmin) {
      return this.findAll();
    }
    if (!actor.id) return [];
    const staffAssignments = await this.supplierStaffAssignmentsRepository.find(
      {
        where: { userId: actor.id, isActive: true },
        select: ['supplierProfileId'],
      },
    );
    const staffedIds = staffAssignments.map((a) => a.supplierProfileId);
    const ownerProfiles = await this.supplierProfilesRepository.find({
      where: { userId: actor.id },
      relations: { user: true },
    });
    const staffedProfiles = staffedIds.length
      ? await this.supplierProfilesRepository.find({
          where: { id: In(staffedIds) },
          relations: { user: true },
        })
      : [];
    const dedup = new Map<number, SupplierProfile>();
    [...ownerProfiles, ...staffedProfiles].forEach((p) => dedup.set(p.id, p));
    return Array.from(dedup.values()).sort(
      (a, b) => Number(b.createdAt) - Number(a.createdAt),
    );
  }

  async findReviewQueue(
    status: SupplierOnboardingStatus = SupplierOnboardingStatus.PENDING_REVIEW,
  ): Promise<SupplierProfile[]> {
    return this.supplierProfilesRepository.find({
      where: { onboardingStatus: status },
      order: { createdAt: 'ASC' },
      relations: { user: true },
    });
  }

  async getProcurementSummary(
    id: number,
    query: SupplierProcurementSummaryQueryDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<SupplierProcurementSummaryResponseDto> {
    const profile = await this.findOneById(id);
    this.assertCanAccessProfile(profile, actor.id ?? null, actor.roles ?? []);

    const windowDays = Math.min(Math.max(query.windowDays ?? 30, 1), 365);
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const orders = await this.purchaseOrdersRepository.find({
      where: {
        supplierProfileId: id,
        createdAt: MoreThanOrEqual(windowStart),
      },
      relations: {
        branch: true,
      },
      order: {
        updatedAt: 'DESC',
        id: 'DESC',
      },
    });

    const orderIds = orders.map((order) => order.id);
    const receiptEvents =
      orderIds.length > 0
        ? await this.purchaseOrderReceiptEventsRepository.find({
            where: {
              purchaseOrderId: In(orderIds),
            },
            order: { createdAt: 'DESC', id: 'DESC' },
          })
        : [];
    const receiptEventsByOrderId =
      this.groupReceiptEventsByOrderId(receiptEvents);
    const metrics = this.buildProcurementMetrics(orders, receiptEvents);

    return {
      supplierProfileId: profile.id,
      companyName: profile.companyName,
      onboardingStatus: profile.onboardingStatus,
      isActive: profile.isActive,
      windowDays,
      ...metrics,
      recentOrders: orders
        .slice(0, limit)
        .map((order) =>
          this.mapRecentOrder(
            order,
            receiptEventsByOrderId.get(order.id) ?? [],
          ),
        ),
    };
  }

  async getProcurementTrend(
    id: number,
    query: SupplierProcurementTrendQueryDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<SupplierProcurementTrendResponseDto> {
    const profile = await this.findOneById(id);
    this.assertCanAccessProfile(profile, actor.id ?? null, actor.roles ?? []);

    const asOf = query.asOf ?? new Date();
    const earliestWindowStart = new Date(
      asOf.getTime() -
        Math.max(...PROCUREMENT_TREND_WINDOWS) * 24 * 60 * 60 * 1000,
    );

    const orders = await this.purchaseOrdersRepository.find({
      where: {
        supplierProfileId: id,
        createdAt: Between(earliestWindowStart, asOf),
        ...(query.branchIds?.length ? { branchId: In(query.branchIds) } : {}),
        ...(query.statuses?.length ? { status: In(query.statuses) } : {}),
      },
      relations: {
        branch: true,
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });

    const orderIds = orders.map((order) => order.id);
    const receiptEvents =
      orderIds.length > 0
        ? await this.purchaseOrderReceiptEventsRepository.find({
            where: {
              purchaseOrderId: In(orderIds),
            },
            order: { createdAt: 'DESC', id: 'DESC' },
          })
        : [];
    const receiptEventsByOrderId =
      this.groupReceiptEventsByOrderId(receiptEvents);

    const windows = PROCUREMENT_TREND_WINDOWS.map((windowDays) => {
      const windowStart = new Date(
        asOf.getTime() - windowDays * 24 * 60 * 60 * 1000,
      );
      const windowOrders = orders.filter(
        (order) => order.createdAt >= windowStart && order.createdAt <= asOf,
      );
      const windowReceiptEvents = windowOrders.flatMap(
        (order) => receiptEventsByOrderId.get(order.id) ?? [],
      );
      const metrics = this.buildProcurementMetrics(
        windowOrders,
        windowReceiptEvents,
      );
      const score = this.computeProcurementScore(metrics);

      return {
        windowDays,
        procurementScore: score.finalScore,
        scoreBreakdown: score.breakdown,
        totalOrders: metrics.totalOrders,
        activeOrderCount: metrics.activeOrderCount,
        fillRatePercent: metrics.sla.fillRatePercent,
        averageAcknowledgementHours: metrics.sla.averageAcknowledgementHours,
        averageShipmentLatencyHours: metrics.sla.averageShipmentLatencyHours,
        averageReceiptAcknowledgementHours:
          metrics.sla.averageReceiptAcknowledgementHours,
        pendingAcknowledgementCount:
          metrics.workQueues.pendingAcknowledgementCount,
        pendingShipmentCount: metrics.workQueues.pendingShipmentCount,
        pendingReceiptAcknowledgementCount:
          metrics.workQueues.pendingReceiptAcknowledgementCount,
        openDiscrepancyCount: metrics.workQueues.openDiscrepancyCount,
      } satisfies SupplierProcurementTrendWindowResponseDto;
    });

    const shortestWindow = windows[0];
    const longestWindow = windows[windows.length - 1];
    const scoreDeltaFrom90d = Number(
      (
        shortestWindow.procurementScore - longestWindow.procurementScore
      ).toFixed(2),
    );
    const fillRateDeltaFrom90d = Number(
      (shortestWindow.fillRatePercent - longestWindow.fillRatePercent).toFixed(
        2,
      ),
    );
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const orderContributors = this.buildTrendOrderContributors(orders);
    const discrepancyContributors = this.buildTrendDiscrepancyContributors(
      receiptEvents,
      ordersById,
    );

    return {
      supplierProfileId: profile.id,
      companyName: profile.companyName,
      onboardingStatus: profile.onboardingStatus,
      isActive: profile.isActive,
      generatedAt: new Date().toISOString(),
      asOf: asOf.toISOString(),
      trendDirection:
        scoreDeltaFrom90d > 2
          ? 'IMPROVING'
          : scoreDeltaFrom90d < -2
            ? 'WORSENING'
            : 'STABLE',
      scoreDeltaFrom90d,
      fillRateDeltaFrom90d,
      appliedFilters: this.buildTrendAppliedFilters(query, asOf),
      windows,
      branchBuckets: this.buildTrendBranchBuckets(
        orders,
        asOf,
        receiptEventsByOrderId,
        orderContributors,
        discrepancyContributors,
      ),
      topContributingOrders: orderContributors,
      topDiscrepancyEvents: discrepancyContributors,
    };
  }

  async exportProcurementTrendCsv(
    id: number,
    query: SupplierProcurementTrendQueryDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<string> {
    const trend = await this.getProcurementTrend(id, query, actor);
    const header = [
      'section',
      'supplierProfileId',
      'companyName',
      'asOf',
      'windowDays',
      'purchaseOrderId',
      'receiptEventId',
      'branchId',
      'branchName',
      'branchCode',
      'branchOrderCount',
      'branchDiscrepancyEventCount',
      'orderNumber',
      'status',
      'discrepancyStatus',
      'procurementScore',
      'branchTrendDirection',
      'branchScoreDeltaFrom90d',
      'branchFillRateDeltaFrom90d',
      'impactScore',
      'impactSharePercent',
      'fillRatePercent',
      'shortageQuantity',
      'damagedQuantity',
      'acknowledgementHours',
      'shipmentLatencyHours',
      'pendingAcknowledgementCount',
      'pendingShipmentCount',
      'pendingReceiptAcknowledgementCount',
      'openDiscrepancyCount',
      'dominantIssue',
      'note',
      'createdAt',
      'supplierAcknowledgedAt',
      'trendDirection',
      'scoreDeltaFrom90d',
      'fillRateDeltaFrom90d',
    ].join(',');

    const summaryRow = [
      this.escapeCsvValue('SUMMARY'),
      trend.supplierProfileId,
      this.escapeCsvValue(trend.companyName),
      this.escapeCsvValue(trend.asOf),
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
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      this.escapeCsvValue(trend.trendDirection),
      trend.scoreDeltaFrom90d,
      trend.fillRateDeltaFrom90d,
    ].join(',');

    const windowRows = trend.windows.map((window) =>
      [
        this.escapeCsvValue('WINDOW'),
        trend.supplierProfileId,
        this.escapeCsvValue(trend.companyName),
        this.escapeCsvValue(trend.asOf),
        window.windowDays,
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
        '',
        '',
        '',
        window.procurementScore,
        '',
        '',
        '',
        '',
        '',
        window.fillRatePercent,
        '',
        '',
        window.averageAcknowledgementHours,
        window.averageShipmentLatencyHours,
        window.pendingAcknowledgementCount,
        window.pendingShipmentCount,
        window.pendingReceiptAcknowledgementCount,
        window.openDiscrepancyCount,
        '',
        '',
        '',
        '',
        this.escapeCsvValue(trend.trendDirection),
        trend.scoreDeltaFrom90d,
        trend.fillRateDeltaFrom90d,
      ].join(','),
    );

    const orderRows = trend.topContributingOrders.map((order) =>
      [
        this.escapeCsvValue('ORDER_CONTRIBUTOR'),
        trend.supplierProfileId,
        this.escapeCsvValue(trend.companyName),
        this.escapeCsvValue(trend.asOf),
        '',
        order.purchaseOrderId,
        '',
        order.branchId,
        this.escapeCsvValue(order.branchName),
        this.escapeCsvValue(order.branchCode ?? ''),
        '',
        '',
        this.escapeCsvValue(order.orderNumber),
        this.escapeCsvValue(order.status),
        '',
        '',
        '',
        '',
        '',
        order.impactScore,
        '',
        order.fillRatePercent,
        order.shortageQuantity,
        order.damagedQuantity,
        order.acknowledgementHours ?? '',
        order.shipmentLatencyHours ?? '',
        '',
        '',
        '',
        '',
        this.escapeCsvValue(order.dominantIssue),
        '',
        this.escapeCsvValue(order.createdAt),
        '',
        this.escapeCsvValue(trend.trendDirection),
        trend.scoreDeltaFrom90d,
        trend.fillRateDeltaFrom90d,
      ].join(','),
    );

    const discrepancyRows = trend.topDiscrepancyEvents.map((event) =>
      [
        this.escapeCsvValue('DISCREPANCY_CONTRIBUTOR'),
        trend.supplierProfileId,
        this.escapeCsvValue(trend.companyName),
        this.escapeCsvValue(trend.asOf),
        '',
        event.purchaseOrderId,
        event.receiptEventId,
        event.branchId,
        this.escapeCsvValue(event.branchName),
        this.escapeCsvValue(event.branchCode ?? ''),
        '',
        '',
        this.escapeCsvValue(event.orderNumber),
        '',
        this.escapeCsvValue(event.discrepancyStatus ?? ''),
        '',
        '',
        '',
        '',
        event.impactScore,
        '',
        '',
        event.shortageQuantity,
        event.damagedQuantity,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        this.escapeCsvValue(event.note ?? ''),
        this.escapeCsvValue(event.createdAt),
        this.escapeCsvValue(event.supplierAcknowledgedAt ?? ''),
        this.escapeCsvValue(trend.trendDirection),
        trend.scoreDeltaFrom90d,
        trend.fillRateDeltaFrom90d,
      ].join(','),
    );

    const branchRows = trend.branchBuckets.map((branch) =>
      [
        this.escapeCsvValue('BRANCH_BUCKET'),
        trend.supplierProfileId,
        this.escapeCsvValue(trend.companyName),
        this.escapeCsvValue(trend.asOf),
        '',
        '',
        '',
        branch.branchId,
        this.escapeCsvValue(branch.branchName),
        this.escapeCsvValue(branch.branchCode ?? ''),
        branch.orderCount,
        branch.discrepancyEventCount,
        '',
        '',
        '',
        branch.procurementScore,
        this.escapeCsvValue(branch.trendDirection),
        branch.scoreDeltaFrom90d,
        branch.fillRateDeltaFrom90d,
        branch.impactScore,
        branch.impactSharePercent,
        branch.fillRatePercent,
        '',
        '',
        branch.averageAcknowledgementHours,
        branch.averageShipmentLatencyHours,
        '',
        '',
        branch.openDiscrepancyCount,
        '',
        '',
        '',
        '',
        this.escapeCsvValue(trend.trendDirection),
        trend.scoreDeltaFrom90d,
        trend.fillRateDeltaFrom90d,
      ].join(','),
    );

    return [
      header,
      summaryRow,
      ...windowRows,
      ...branchRows,
      ...orderRows,
      ...discrepancyRows,
    ].join('\n');
  }

  async listProcurementBranchInterventions(
    query: SupplierProcurementBranchInterventionQueryDto,
  ): Promise<SupplierProcurementBranchInterventionResponseDto> {
    const windowDays = Math.min(Math.max(query.windowDays ?? 30, 1), 365);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const to = query.to ?? new Date();
    const from =
      query.from ?? new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);

    if (from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const where: FindOptionsWhere<SupplierProfile> = {};
    if (!query.includeInactive) {
      where.isActive = true;
    }
    if (query.onboardingStatus) {
      where.onboardingStatus = query.onboardingStatus;
    }
    if (query.supplierProfileIds?.length) {
      where.id = In(query.supplierProfileIds);
    }

    const profiles = await this.supplierProfilesRepository.find({
      where,
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });

    const appliedFilters = this.buildInterventionAppliedFilters(
      query,
      from,
      to,
    );

    if (profiles.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        windowDays,
        baselineWindowDays: PROCUREMENT_INTERVENTION_BASELINE_DAYS,
        totalBranchesEvaluated: 0,
        summary: {
          totalInterventions: 0,
          assignedCount: 0,
          untriagedCount: 0,
          over24hCount: 0,
          over72hCount: 0,
          alertCounts: {
            normal: 0,
            warning: 0,
            critical: 0,
          },
          alertMix: {
            normalPercent: 0,
            warningPercent: 0,
            criticalPercent: 0,
          },
          issueMix: [],
          actionHintMix: [],
        },
        appliedFilters,
        interventions: [],
        supplierRollups: [],
        branchRollups: [],
      };
    }

    const baselineFrom = new Date(
      to.getTime() -
        PROCUREMENT_INTERVENTION_BASELINE_DAYS * 24 * 60 * 60 * 1000,
    );
    const fetchFrom = from < baselineFrom ? from : baselineFrom;
    const profileIds = profiles.map((profile) => profile.id);
    const latestWorkflowByBranch =
      await this.listLatestInterventionActionsByBranch(profileIds);
    const orders = await this.purchaseOrdersRepository.find({
      where: {
        supplierProfileId: In(profileIds),
        createdAt: Between(fetchFrom, to),
        ...(query.branchIds?.length ? { branchId: In(query.branchIds) } : {}),
        ...(query.statuses?.length ? { status: In(query.statuses) } : {}),
      },
      relations: {
        branch: true,
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });

    const currentOrders = orders.filter(
      (order) =>
        order.branchId != null &&
        order.createdAt >= from &&
        order.createdAt <= to,
    );
    const orderIds = orders.map((order) => order.id);
    const receiptEvents =
      orderIds.length > 0
        ? await this.purchaseOrderReceiptEventsRepository.find({
            where: {
              purchaseOrderId: In(orderIds),
            },
            order: { createdAt: 'DESC', id: 'DESC' },
          })
        : [];
    const receiptEventsByOrderId =
      this.groupReceiptEventsByOrderId(receiptEvents);
    const profilesById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );
    const currentGroups = new Map<string, PurchaseOrder[]>();

    for (const order of currentOrders) {
      const key = `${order.supplierProfileId}:${order.branchId}`;
      const existingOrders = currentGroups.get(key);
      if (existingOrders) {
        existingOrders.push(order);
      } else {
        currentGroups.set(key, [order]);
      }
    }

    const filteredInterventions = Array.from(currentGroups.entries())
      .map(([key, branchOrders]) => {
        const [supplierProfileIdValue, branchIdValue] = key.split(':');
        const supplierProfileId = Number(supplierProfileIdValue);
        const branchId = Number(branchIdValue);
        const profile = profilesById.get(supplierProfileId);
        if (!profile) {
          return null;
        }

        const baselineOrders = orders.filter(
          (order) =>
            order.supplierProfileId === supplierProfileId &&
            order.branchId === branchId &&
            order.createdAt >= baselineFrom &&
            order.createdAt <= to,
        );
        const currentReceiptEvents = branchOrders.flatMap(
          (order) => receiptEventsByOrderId.get(order.id) ?? [],
        );
        const baselineReceiptEvents = baselineOrders.flatMap(
          (order) => receiptEventsByOrderId.get(order.id) ?? [],
        );
        const currentMetrics = this.buildProcurementMetrics(
          branchOrders,
          currentReceiptEvents,
        );
        const baselineMetrics = this.buildProcurementMetrics(
          baselineOrders,
          baselineReceiptEvents,
        );
        const currentScore =
          this.computeProcurementScore(currentMetrics).finalScore;
        const baselineScore =
          this.computeProcurementScore(baselineMetrics).finalScore;
        const scoreDeltaFrom90d = Number(
          (currentScore - baselineScore).toFixed(2),
        );
        const fillRateDeltaFrom90d = Number(
          (
            currentMetrics.sla.fillRatePercent -
            baselineMetrics.sla.fillRatePercent
          ).toFixed(2),
        );
        const trendDirection = this.determineTrendDirection(scoreDeltaFrom90d);
        const discrepancyEventCount = currentReceiptEvents.filter(
          (event) => event.discrepancyStatus != null,
        ).length;
        const branch = branchOrders[0]?.branch;
        const workflowSummary = latestWorkflowByBranch.get(key) ?? {
          latestAction: null,
          latestActionAt: null,
          latestActionActorEmail: null,
          latestAssigneeUserId: null,
        };
        const topIssues = this.buildInterventionTopIssues(
          currentMetrics,
          scoreDeltaFrom90d,
          fillRateDeltaFrom90d,
        );
        const actionHints = this.buildInterventionActionHints(
          currentMetrics,
          topIssues,
        );
        const interventionPriorityScore = this.computeInterventionPriorityScore(
          currentMetrics,
          scoreDeltaFrom90d,
          fillRateDeltaFrom90d,
          discrepancyEventCount,
        );

        return {
          supplierProfileId: profile.id,
          companyName: profile.companyName,
          onboardingStatus: profile.onboardingStatus,
          isActive: profile.isActive,
          branchId,
          branchName: branch?.name ?? '',
          branchCode: branch?.code ?? null,
          latestAction: workflowSummary.latestAction,
          latestActionAt: workflowSummary.latestActionAt,
          latestActionActorEmail: workflowSummary.latestActionActorEmail,
          latestAssigneeUserId: workflowSummary.latestAssigneeUserId,
          interventionPriorityScore,
          trendDirection,
          procurementScore: currentScore,
          baselineProcurementScore: baselineScore,
          scoreDeltaFrom90d,
          fillRatePercent: currentMetrics.sla.fillRatePercent,
          baselineFillRatePercent: baselineMetrics.sla.fillRatePercent,
          fillRateDeltaFrom90d,
          orderCount: branchOrders.length,
          discrepancyEventCount,
          openDiscrepancyCount: currentMetrics.workQueues.openDiscrepancyCount,
          pendingAcknowledgementCount:
            currentMetrics.workQueues.pendingAcknowledgementCount,
          pendingShipmentCount: currentMetrics.workQueues.pendingShipmentCount,
          pendingReceiptAcknowledgementCount:
            currentMetrics.workQueues.pendingReceiptAcknowledgementCount,
          averageAcknowledgementHours:
            currentMetrics.sla.averageAcknowledgementHours,
          averageShipmentLatencyHours:
            currentMetrics.sla.averageShipmentLatencyHours,
          alertLevel: this.getInterventionEntryAlertLevel(
            interventionPriorityScore,
            workflowSummary.latestActionAt,
            workflowSummary.latestAssigneeUserId,
          ),
          topIssues,
          actionHints,
        } satisfies SupplierProcurementBranchInterventionEntryResponseDto;
      })
      .filter(
        (
          entry,
        ): entry is SupplierProcurementBranchInterventionEntryResponseDto =>
          entry != null,
      )
      .filter((entry) => this.matchesInterventionWorkflowFilters(entry, query));

    const interventions = filteredInterventions
      .sort((left, right) =>
        this.compareInterventions(
          left,
          right,
          query.sortBy ??
            SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
        ),
      )
      .slice(0, limit);

    return {
      generatedAt: new Date().toISOString(),
      windowDays,
      baselineWindowDays: PROCUREMENT_INTERVENTION_BASELINE_DAYS,
      totalBranchesEvaluated: filteredInterventions.length,
      summary: this.buildInterventionSummary(filteredInterventions, to),
      appliedFilters,
      interventions,
      supplierRollups: this.buildInterventionSupplierRollups(
        filteredInterventions,
        to,
      ),
      branchRollups: this.buildInterventionBranchRollups(
        filteredInterventions,
        to,
      ),
    };
  }

  async getProcurementBranchInterventionDashboard(
    query: SupplierProcurementBranchInterventionDashboardQueryDto,
  ): Promise<SupplierProcurementBranchInterventionDashboardResponseDto> {
    const report = await this.listProcurementBranchInterventions(query);
    const supplierRollupSortBy =
      query.supplierRollupSortBy ??
      SupplierProcurementDashboardSupplierRollupSortBy.OVER_72H_DESC;
    const branchRollupSortBy =
      query.branchRollupSortBy ??
      SupplierProcurementDashboardBranchRollupSortBy.OVER_72H_DESC;
    const supplierRollupLimit = query.supplierRollupLimit
      ? Math.min(Math.max(query.supplierRollupLimit, 1), 100)
      : null;
    const branchRollupLimit = query.branchRollupLimit
      ? Math.min(Math.max(query.branchRollupLimit, 1), 100)
      : null;
    const supplierRollups = [...report.supplierRollups].sort((left, right) =>
      this.compareDashboardSupplierRollups(left, right, supplierRollupSortBy),
    );
    const branchRollups = [...report.branchRollups].sort((left, right) =>
      this.compareDashboardBranchRollups(left, right, branchRollupSortBy),
    );
    const trimmedSupplierRollups =
      supplierRollupLimit == null
        ? supplierRollups
        : supplierRollups.slice(0, supplierRollupLimit);
    const trimmedBranchRollups =
      branchRollupLimit == null
        ? branchRollups
        : branchRollups.slice(0, branchRollupLimit);

    return {
      generatedAt: report.generatedAt,
      windowDays: report.windowDays,
      baselineWindowDays: report.baselineWindowDays,
      totalBranchesEvaluated: report.totalBranchesEvaluated,
      summary: report.summary,
      summaryAlertLevel: this.getInterventionSummaryAlertLevel(report.summary),
      appliedFilters: {
        ...(report.appliedFilters as SupplierProcurementBranchInterventionDashboardAppliedFiltersResponseDto),
        supplierRollupSortBy,
        branchRollupSortBy,
        supplierRollupLimit,
        branchRollupLimit,
      },
      supplierRollups: trimmedSupplierRollups.map((rollup) => ({
        ...rollup,
        alertLevel: this.getInterventionSupplierHotspotAlertLevel(rollup),
      })),
      branchRollups: trimmedBranchRollups.map((rollup) => ({
        ...rollup,
        alertLevel: this.getInterventionBranchHotspotAlertLevel(rollup),
      })),
    };
  }

  async getProcurementBranchInterventionOverview(
    query: SupplierProcurementBranchInterventionDashboardQueryDto,
  ): Promise<SupplierProcurementBranchInterventionOverviewResponseDto> {
    const report = await this.getProcurementBranchInterventionDashboard(query);
    const comparisonWindow = this.buildPreviousInterventionOverviewWindow(
      report.appliedFilters.from,
      report.appliedFilters.to ?? report.generatedAt,
    );
    const previousReport = await this.listProcurementBranchInterventions({
      ...query,
      from: new Date(comparisonWindow.previousFrom),
      to: new Date(comparisonWindow.previousTo),
    });
    const topSupplierHotspot = report.supplierRollups[0] ?? null;
    const topBranchHotspot = report.branchRollups[0] ?? null;
    const previousTopSupplierHotspot =
      previousReport.supplierRollups[0] ?? null;
    const previousTopBranchHotspot = previousReport.branchRollups[0] ?? null;
    const previousSupplierHotspot = topSupplierHotspot
      ? (previousReport.supplierRollups.find(
          (rollup) =>
            rollup.supplierProfileId === topSupplierHotspot.supplierProfileId,
        ) ?? null)
      : null;
    const previousBranchHotspot = topBranchHotspot
      ? (previousReport.branchRollups.find(
          (rollup) => rollup.branchId === topBranchHotspot.branchId,
        ) ?? null)
      : null;
    const previousSummaryAlertLevel = this.getInterventionSummaryAlertLevel(
      previousReport.summary,
    );
    const summaryDelta = this.buildInterventionSummaryDelta(
      report.summary,
      previousReport.summary,
    );
    const alertStatuses = this.buildInterventionOverviewAlertStatuses(
      report.summary,
      topSupplierHotspot,
      topBranchHotspot,
    );
    const previousSupplierAlertLevel = previousTopSupplierHotspot
      ? this.getInterventionSupplierHotspotAlertLevel(
          previousTopSupplierHotspot,
        )
      : null;
    const previousBranchAlertLevel = previousTopBranchHotspot
      ? this.getInterventionBranchHotspotAlertLevel(previousTopBranchHotspot)
      : null;
    const topSupplierHotspotDelta = this.buildSupplierHotspotDelta(
      topSupplierHotspot,
      previousSupplierHotspot,
    );
    const topBranchHotspotDelta = this.buildBranchHotspotDelta(
      topBranchHotspot,
      previousBranchHotspot,
    );
    const severityTrends = this.buildInterventionOverviewSeverityTrends(
      alertStatuses.summary,
      previousSummaryAlertLevel,
      summaryDelta,
      alertStatuses.topSupplierHotspot,
      previousSupplierAlertLevel,
      topSupplierHotspotDelta,
      alertStatuses.topBranchHotspot,
      previousBranchAlertLevel,
      topBranchHotspotDelta,
    );
    const alertStatusTransitions =
      this.buildInterventionOverviewAlertStatusTransitions(
        alertStatuses.summary,
        previousSummaryAlertLevel,
        alertStatuses.topSupplierHotspot,
        previousSupplierAlertLevel,
        alertStatuses.topBranchHotspot,
        previousBranchAlertLevel,
      );

    return {
      generatedAt: report.generatedAt,
      windowDays: report.windowDays,
      baselineWindowDays: report.baselineWindowDays,
      totalBranchesEvaluated: report.totalBranchesEvaluated,
      summary: report.summary,
      appliedFilters: report.appliedFilters,
      comparisonWindow,
      summaryDelta,
      alertStatuses,
      severityTrends,
      alertStatusTransitions,
      topSupplierHotspot,
      topSupplierHotspotDelta,
      topBranchHotspot,
      topBranchHotspotDelta,
    };
  }

  async exportProcurementBranchInterventionOverviewCsv(
    query: SupplierProcurementBranchInterventionDashboardQueryDto,
  ): Promise<string> {
    const report = await this.getProcurementBranchInterventionOverview(query);
    const header = [
      'section',
      'generatedAt',
      'windowDays',
      'baselineWindowDays',
      'totalBranchesEvaluated',
      'filterIncludeInactive',
      'filterOnboardingStatus',
      'filterSupplierProfileIds',
      'filterBranchIds',
      'filterStatuses',
      'filterLatestActions',
      'filterActionAgeBuckets',
      'filterSortBy',
      'filterAssigneeUserIds',
      'filterIncludeUntriaged',
      'filterSupplierRollupSortBy',
      'filterBranchRollupSortBy',
      'filterSupplierRollupLimit',
      'filterBranchRollupLimit',
      'filterFrom',
      'filterTo',
      'comparisonPreviousFrom',
      'comparisonPreviousTo',
      'summaryTotalInterventions',
      'summaryAssignedCount',
      'summaryUntriagedCount',
      'summaryOver24hCount',
      'summaryOver72hCount',
      'summaryNormalAlertCount',
      'summaryWarningAlertCount',
      'summaryCriticalAlertCount',
      'summaryNormalAlertPercent',
      'summaryWarningAlertPercent',
      'summaryCriticalAlertPercent',
      'summaryIssueMix',
      'summaryActionHintMix',
      'summaryIssueMixDelta',
      'summaryActionHintMixDelta',
      'summaryDeltaTotalInterventions',
      'summaryDeltaAssignedCount',
      'summaryDeltaUntriagedCount',
      'summaryDeltaOver24hCount',
      'summaryDeltaOver72hCount',
      'summaryDeltaNormalAlertCount',
      'summaryDeltaWarningAlertCount',
      'summaryDeltaCriticalAlertCount',
      'summaryDeltaNormalAlertPercent',
      'summaryDeltaWarningAlertPercent',
      'summaryDeltaCriticalAlertPercent',
      'summaryAlertLevel',
      'summarySeverityTrend',
      'summaryPreviousAlertLevel',
      'summaryAlertTransition',
      'summaryAlertStatusChanged',
      'supplierProfileId',
      'companyName',
      'supplierBranchCount',
      'supplierAssignedCount',
      'supplierUntriagedCount',
      'supplierOver24hCount',
      'supplierOver72hCount',
      'supplierHighestPriorityScore',
      'supplierNormalAlertCount',
      'supplierWarningAlertCount',
      'supplierCriticalAlertCount',
      'supplierNormalAlertPercent',
      'supplierWarningAlertPercent',
      'supplierCriticalAlertPercent',
      'supplierIssueMix',
      'supplierActionHintMix',
      'supplierDeltaBranchCount',
      'supplierDeltaAssignedCount',
      'supplierDeltaUntriagedCount',
      'supplierDeltaOver24hCount',
      'supplierDeltaOver72hCount',
      'supplierDeltaHighestPriorityScore',
      'supplierDeltaNormalAlertCount',
      'supplierDeltaWarningAlertCount',
      'supplierDeltaCriticalAlertCount',
      'supplierDeltaNormalAlertPercent',
      'supplierDeltaWarningAlertPercent',
      'supplierDeltaCriticalAlertPercent',
      'supplierDeltaIssueMix',
      'supplierDeltaActionHintMix',
      'supplierAlertLevel',
      'supplierSeverityTrend',
      'supplierPreviousAlertLevel',
      'supplierAlertTransition',
      'supplierAlertStatusChanged',
      'branchId',
      'branchName',
      'branchCode',
      'branchSupplierCount',
      'branchInterventionCount',
      'branchAssignedCount',
      'branchUntriagedCount',
      'branchOver24hCount',
      'branchOver72hCount',
      'branchHighestPriorityScore',
      'branchNormalAlertCount',
      'branchWarningAlertCount',
      'branchCriticalAlertCount',
      'branchNormalAlertPercent',
      'branchWarningAlertPercent',
      'branchCriticalAlertPercent',
      'branchIssueMix',
      'branchActionHintMix',
      'branchDeltaSupplierCount',
      'branchDeltaInterventionCount',
      'branchDeltaAssignedCount',
      'branchDeltaUntriagedCount',
      'branchDeltaOver24hCount',
      'branchDeltaOver72hCount',
      'branchDeltaHighestPriorityScore',
      'branchDeltaNormalAlertCount',
      'branchDeltaWarningAlertCount',
      'branchDeltaCriticalAlertCount',
      'branchDeltaNormalAlertPercent',
      'branchDeltaWarningAlertPercent',
      'branchDeltaCriticalAlertPercent',
      'branchDeltaIssueMix',
      'branchDeltaActionHintMix',
      'branchAlertLevel',
      'branchSeverityTrend',
      'branchPreviousAlertLevel',
      'branchAlertTransition',
      'branchAlertStatusChanged',
    ].join(',');

    const filters = report.appliedFilters;
    const summaryRow = [
      this.escapeCsvValue('SUMMARY'),
      this.escapeCsvValue(report.generatedAt),
      report.windowDays,
      report.baselineWindowDays,
      report.totalBranchesEvaluated,
      filters.includeInactive,
      this.escapeCsvValue(filters.onboardingStatus ?? ''),
      this.escapeCsvValue(filters.supplierProfileIds.join('|')),
      this.escapeCsvValue(filters.branchIds.join('|')),
      this.escapeCsvValue(filters.statuses.join('|')),
      this.escapeCsvValue(filters.latestActions.join('|')),
      this.escapeCsvValue(filters.actionAgeBuckets.join('|')),
      this.escapeCsvValue(filters.sortBy),
      this.escapeCsvValue(filters.assigneeUserIds.join('|')),
      filters.includeUntriaged,
      this.escapeCsvValue(filters.supplierRollupSortBy),
      this.escapeCsvValue(filters.branchRollupSortBy),
      this.escapeCsvValue(filters.supplierRollupLimit ?? ''),
      this.escapeCsvValue(filters.branchRollupLimit ?? ''),
      this.escapeCsvValue(filters.from),
      this.escapeCsvValue(filters.to ?? ''),
      this.escapeCsvValue(report.comparisonWindow.previousFrom),
      this.escapeCsvValue(report.comparisonWindow.previousTo),
      report.summary.totalInterventions,
      report.summary.assignedCount,
      report.summary.untriagedCount,
      report.summary.over24hCount,
      report.summary.over72hCount,
      report.summary.alertCounts.normal,
      report.summary.alertCounts.warning,
      report.summary.alertCounts.critical,
      report.summary.alertMix.normalPercent,
      report.summary.alertMix.warningPercent,
      report.summary.alertMix.criticalPercent,
      this.escapeCsvValue(
        this.formatInterventionIssueMix(report.summary.issueMix),
      ),
      this.escapeCsvValue(
        this.formatInterventionActionHintMix(report.summary.actionHintMix),
      ),
      this.escapeCsvValue(
        this.formatInterventionIssueMixDelta(report.summaryDelta.issueMixDelta),
      ),
      this.escapeCsvValue(
        this.formatInterventionActionHintMixDelta(
          report.summaryDelta.actionHintMixDelta,
        ),
      ),
      report.summaryDelta.totalInterventionsDelta,
      report.summaryDelta.assignedCountDelta,
      report.summaryDelta.untriagedCountDelta,
      report.summaryDelta.over24hCountDelta,
      report.summaryDelta.over72hCountDelta,
      report.summaryDelta.alertCountsDelta.normalDelta,
      report.summaryDelta.alertCountsDelta.warningDelta,
      report.summaryDelta.alertCountsDelta.criticalDelta,
      report.summaryDelta.alertMixDelta.normalPercentDelta,
      report.summaryDelta.alertMixDelta.warningPercentDelta,
      report.summaryDelta.alertMixDelta.criticalPercentDelta,
      this.escapeCsvValue(report.alertStatuses.summary),
      this.escapeCsvValue(report.severityTrends.summary),
      this.escapeCsvValue(
        report.alertStatusTransitions.summary.previousAlertLevel ?? '',
      ),
      this.escapeCsvValue(report.alertStatusTransitions.summary.transition),
      report.alertStatusTransitions.summary.changed,
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
      '',
    ].join(',');

    const supplierRow = report.topSupplierHotspot
      ? [
          this.escapeCsvValue('TOP_SUPPLIER_HOTSPOT'),
          this.escapeCsvValue(report.generatedAt),
          report.windowDays,
          report.baselineWindowDays,
          report.totalBranchesEvaluated,
          filters.includeInactive,
          this.escapeCsvValue(filters.onboardingStatus ?? ''),
          this.escapeCsvValue(filters.supplierProfileIds.join('|')),
          this.escapeCsvValue(filters.branchIds.join('|')),
          this.escapeCsvValue(filters.statuses.join('|')),
          this.escapeCsvValue(filters.latestActions.join('|')),
          this.escapeCsvValue(filters.actionAgeBuckets.join('|')),
          this.escapeCsvValue(filters.sortBy),
          this.escapeCsvValue(filters.assigneeUserIds.join('|')),
          filters.includeUntriaged,
          this.escapeCsvValue(filters.supplierRollupSortBy),
          this.escapeCsvValue(filters.branchRollupSortBy),
          this.escapeCsvValue(filters.supplierRollupLimit ?? ''),
          this.escapeCsvValue(filters.branchRollupLimit ?? ''),
          this.escapeCsvValue(filters.from),
          this.escapeCsvValue(filters.to ?? ''),
          this.escapeCsvValue(report.comparisonWindow.previousFrom),
          this.escapeCsvValue(report.comparisonWindow.previousTo),
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          report.topSupplierHotspot.supplierProfileId,
          this.escapeCsvValue(report.topSupplierHotspot.companyName),
          report.topSupplierHotspot.branchCount,
          report.topSupplierHotspot.assignedCount,
          report.topSupplierHotspot.untriagedCount,
          report.topSupplierHotspot.over24hCount,
          report.topSupplierHotspot.over72hCount,
          report.topSupplierHotspot.highestPriorityScore,
          report.topSupplierHotspot.alertCounts.normal,
          report.topSupplierHotspot.alertCounts.warning,
          report.topSupplierHotspot.alertCounts.critical,
          report.topSupplierHotspot.alertMix.normalPercent,
          report.topSupplierHotspot.alertMix.warningPercent,
          report.topSupplierHotspot.alertMix.criticalPercent,
          this.escapeCsvValue(
            this.formatInterventionIssueMix(report.topSupplierHotspot.issueMix),
          ),
          this.escapeCsvValue(
            this.formatInterventionActionHintMix(
              report.topSupplierHotspot.actionHintMix,
            ),
          ),
          report.topSupplierHotspotDelta?.branchCountDelta ?? '',
          report.topSupplierHotspotDelta?.assignedCountDelta ?? '',
          report.topSupplierHotspotDelta?.untriagedCountDelta ?? '',
          report.topSupplierHotspotDelta?.over24hCountDelta ?? '',
          report.topSupplierHotspotDelta?.over72hCountDelta ?? '',
          report.topSupplierHotspotDelta?.highestPriorityScoreDelta ?? '',
          report.topSupplierHotspotDelta?.alertCountsDelta.normalDelta ?? '',
          report.topSupplierHotspotDelta?.alertCountsDelta.warningDelta ?? '',
          report.topSupplierHotspotDelta?.alertCountsDelta.criticalDelta ?? '',
          report.topSupplierHotspotDelta?.alertMixDelta.normalPercentDelta ??
            '',
          report.topSupplierHotspotDelta?.alertMixDelta.warningPercentDelta ??
            '',
          report.topSupplierHotspotDelta?.alertMixDelta.criticalPercentDelta ??
            '',
          this.escapeCsvValue(
            this.formatInterventionIssueMixDelta(
              report.topSupplierHotspotDelta?.issueMixDelta ?? [],
            ),
          ),
          this.escapeCsvValue(
            this.formatInterventionActionHintMixDelta(
              report.topSupplierHotspotDelta?.actionHintMixDelta ?? [],
            ),
          ),
          this.escapeCsvValue(report.alertStatuses.topSupplierHotspot ?? ''),
          this.escapeCsvValue(report.severityTrends.topSupplierHotspot ?? ''),
          this.escapeCsvValue(
            report.alertStatusTransitions.topSupplierHotspot
              .previousAlertLevel ?? '',
          ),
          this.escapeCsvValue(
            report.alertStatusTransitions.topSupplierHotspot.transition,
          ),
          report.alertStatusTransitions.topSupplierHotspot.changed,
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
          '',
          '',
          '',
          '',
        ].join(',')
      : null;

    const branchRow = report.topBranchHotspot
      ? [
          this.escapeCsvValue('TOP_BRANCH_HOTSPOT'),
          this.escapeCsvValue(report.generatedAt),
          report.windowDays,
          report.baselineWindowDays,
          report.totalBranchesEvaluated,
          filters.includeInactive,
          this.escapeCsvValue(filters.onboardingStatus ?? ''),
          this.escapeCsvValue(filters.supplierProfileIds.join('|')),
          this.escapeCsvValue(filters.branchIds.join('|')),
          this.escapeCsvValue(filters.statuses.join('|')),
          this.escapeCsvValue(filters.latestActions.join('|')),
          this.escapeCsvValue(filters.actionAgeBuckets.join('|')),
          this.escapeCsvValue(filters.sortBy),
          this.escapeCsvValue(filters.assigneeUserIds.join('|')),
          filters.includeUntriaged,
          this.escapeCsvValue(filters.supplierRollupSortBy),
          this.escapeCsvValue(filters.branchRollupSortBy),
          this.escapeCsvValue(filters.supplierRollupLimit ?? ''),
          this.escapeCsvValue(filters.branchRollupLimit ?? ''),
          this.escapeCsvValue(filters.from),
          this.escapeCsvValue(filters.to ?? ''),
          this.escapeCsvValue(report.comparisonWindow.previousFrom),
          this.escapeCsvValue(report.comparisonWindow.previousTo),
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
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          report.topBranchHotspot.branchId,
          this.escapeCsvValue(report.topBranchHotspot.branchName),
          this.escapeCsvValue(report.topBranchHotspot.branchCode ?? ''),
          report.topBranchHotspot.supplierCount,
          report.topBranchHotspot.interventionCount,
          report.topBranchHotspot.assignedCount,
          report.topBranchHotspot.untriagedCount,
          report.topBranchHotspot.over24hCount,
          report.topBranchHotspot.over72hCount,
          report.topBranchHotspot.highestPriorityScore,
          report.topBranchHotspot.alertCounts.normal,
          report.topBranchHotspot.alertCounts.warning,
          report.topBranchHotspot.alertCounts.critical,
          report.topBranchHotspot.alertMix.normalPercent,
          report.topBranchHotspot.alertMix.warningPercent,
          report.topBranchHotspot.alertMix.criticalPercent,
          this.escapeCsvValue(
            this.formatInterventionIssueMix(report.topBranchHotspot.issueMix),
          ),
          this.escapeCsvValue(
            this.formatInterventionActionHintMix(
              report.topBranchHotspot.actionHintMix,
            ),
          ),
          report.topBranchHotspotDelta?.supplierCountDelta ?? '',
          report.topBranchHotspotDelta?.interventionCountDelta ?? '',
          report.topBranchHotspotDelta?.assignedCountDelta ?? '',
          report.topBranchHotspotDelta?.untriagedCountDelta ?? '',
          report.topBranchHotspotDelta?.over24hCountDelta ?? '',
          report.topBranchHotspotDelta?.over72hCountDelta ?? '',
          report.topBranchHotspotDelta?.highestPriorityScoreDelta ?? '',
          report.topBranchHotspotDelta?.alertCountsDelta.normalDelta ?? '',
          report.topBranchHotspotDelta?.alertCountsDelta.warningDelta ?? '',
          report.topBranchHotspotDelta?.alertCountsDelta.criticalDelta ?? '',
          report.topBranchHotspotDelta?.alertMixDelta.normalPercentDelta ?? '',
          report.topBranchHotspotDelta?.alertMixDelta.warningPercentDelta ?? '',
          report.topBranchHotspotDelta?.alertMixDelta.criticalPercentDelta ??
            '',
          this.escapeCsvValue(
            this.formatInterventionIssueMixDelta(
              report.topBranchHotspotDelta?.issueMixDelta ?? [],
            ),
          ),
          this.escapeCsvValue(
            this.formatInterventionActionHintMixDelta(
              report.topBranchHotspotDelta?.actionHintMixDelta ?? [],
            ),
          ),
          this.escapeCsvValue(report.alertStatuses.topBranchHotspot ?? ''),
          this.escapeCsvValue(report.severityTrends.topBranchHotspot ?? ''),
          this.escapeCsvValue(
            report.alertStatusTransitions.topBranchHotspot.previousAlertLevel ??
              '',
          ),
          this.escapeCsvValue(
            report.alertStatusTransitions.topBranchHotspot.transition,
          ),
          report.alertStatusTransitions.topBranchHotspot.changed,
        ].join(',')
      : null;

    return [header, summaryRow, supplierRow, branchRow]
      .filter((row): row is string => row != null)
      .join('\n');
  }

  async exportProcurementBranchInterventionDashboardCsv(
    query: SupplierProcurementBranchInterventionDashboardQueryDto,
  ): Promise<string> {
    const report = await this.getProcurementBranchInterventionDashboard(query);
    const header = [
      'section',
      'generatedAt',
      'windowDays',
      'baselineWindowDays',
      'totalBranchesEvaluated',
      'filterIncludeInactive',
      'filterOnboardingStatus',
      'filterSupplierProfileIds',
      'filterBranchIds',
      'filterStatuses',
      'filterLatestActions',
      'filterActionAgeBuckets',
      'filterSortBy',
      'filterAssigneeUserIds',
      'filterIncludeUntriaged',
      'filterSupplierRollupSortBy',
      'filterBranchRollupSortBy',
      'filterSupplierRollupLimit',
      'filterBranchRollupLimit',
      'filterFrom',
      'filterTo',
      'supplierProfileId',
      'companyName',
      'branchId',
      'branchName',
      'branchCode',
      'summaryTotalInterventions',
      'summaryAssignedCount',
      'summaryUntriagedCount',
      'summaryOver24hCount',
      'summaryOver72hCount',
      'summaryNormalAlertCount',
      'summaryWarningAlertCount',
      'summaryCriticalAlertCount',
      'summaryNormalAlertPercent',
      'summaryWarningAlertPercent',
      'summaryCriticalAlertPercent',
      'summaryIssueMix',
      'summaryActionHintMix',
      'summaryAlertLevel',
      'rollupBranchCount',
      'rollupSupplierCount',
      'rollupInterventionCount',
      'rollupAssignedCount',
      'rollupUntriagedCount',
      'rollupOver24hCount',
      'rollupOver72hCount',
      'rollupHighestPriorityScore',
      'rollupNormalAlertCount',
      'rollupWarningAlertCount',
      'rollupCriticalAlertCount',
      'rollupNormalAlertPercent',
      'rollupWarningAlertPercent',
      'rollupCriticalAlertPercent',
      'rollupIssueMix',
      'rollupActionHintMix',
      'rollupAlertLevel',
    ].join(',');

    const filters = report.appliedFilters;
    const summaryRow = [
      this.escapeCsvValue('SUMMARY'),
      this.escapeCsvValue(report.generatedAt),
      report.windowDays,
      report.baselineWindowDays,
      report.totalBranchesEvaluated,
      filters.includeInactive,
      this.escapeCsvValue(filters.onboardingStatus ?? ''),
      this.escapeCsvValue(filters.supplierProfileIds.join('|')),
      this.escapeCsvValue(filters.branchIds.join('|')),
      this.escapeCsvValue(filters.statuses.join('|')),
      this.escapeCsvValue(filters.latestActions.join('|')),
      this.escapeCsvValue(filters.actionAgeBuckets.join('|')),
      this.escapeCsvValue(filters.sortBy),
      this.escapeCsvValue(filters.assigneeUserIds.join('|')),
      filters.includeUntriaged,
      this.escapeCsvValue(filters.supplierRollupSortBy),
      this.escapeCsvValue(filters.branchRollupSortBy),
      this.escapeCsvValue(filters.supplierRollupLimit ?? ''),
      this.escapeCsvValue(filters.branchRollupLimit ?? ''),
      this.escapeCsvValue(filters.from),
      this.escapeCsvValue(filters.to ?? ''),
      '',
      '',
      '',
      '',
      '',
      report.summary.totalInterventions,
      report.summary.assignedCount,
      report.summary.untriagedCount,
      report.summary.over24hCount,
      report.summary.over72hCount,
      report.summary.alertCounts.normal,
      report.summary.alertCounts.warning,
      report.summary.alertCounts.critical,
      report.summary.alertMix.normalPercent,
      report.summary.alertMix.warningPercent,
      report.summary.alertMix.criticalPercent,
      this.escapeCsvValue(
        this.formatInterventionIssueMix(report.summary.issueMix),
      ),
      this.escapeCsvValue(
        this.formatInterventionActionHintMix(report.summary.actionHintMix),
      ),
      this.escapeCsvValue(report.summaryAlertLevel),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ].join(',');

    const supplierRollupRows = report.supplierRollups.map((rollup) =>
      [
        this.escapeCsvValue('SUPPLIER_ROLLUP'),
        this.escapeCsvValue(report.generatedAt),
        report.windowDays,
        report.baselineWindowDays,
        report.totalBranchesEvaluated,
        filters.includeInactive,
        this.escapeCsvValue(filters.onboardingStatus ?? ''),
        this.escapeCsvValue(filters.supplierProfileIds.join('|')),
        this.escapeCsvValue(filters.branchIds.join('|')),
        this.escapeCsvValue(filters.statuses.join('|')),
        this.escapeCsvValue(filters.latestActions.join('|')),
        this.escapeCsvValue(filters.actionAgeBuckets.join('|')),
        this.escapeCsvValue(filters.sortBy),
        this.escapeCsvValue(filters.assigneeUserIds.join('|')),
        filters.includeUntriaged,
        this.escapeCsvValue(filters.supplierRollupSortBy),
        this.escapeCsvValue(filters.branchRollupSortBy),
        this.escapeCsvValue(filters.supplierRollupLimit ?? ''),
        this.escapeCsvValue(filters.branchRollupLimit ?? ''),
        this.escapeCsvValue(filters.from),
        this.escapeCsvValue(filters.to ?? ''),
        rollup.supplierProfileId,
        this.escapeCsvValue(rollup.companyName),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        rollup.branchCount,
        '',
        '',
        rollup.assignedCount,
        rollup.untriagedCount,
        rollup.over24hCount,
        rollup.over72hCount,
        rollup.highestPriorityScore,
        rollup.alertCounts.normal,
        rollup.alertCounts.warning,
        rollup.alertCounts.critical,
        rollup.alertMix.normalPercent,
        rollup.alertMix.warningPercent,
        rollup.alertMix.criticalPercent,
        this.escapeCsvValue(this.formatInterventionIssueMix(rollup.issueMix)),
        this.escapeCsvValue(
          this.formatInterventionActionHintMix(rollup.actionHintMix),
        ),
        this.escapeCsvValue(rollup.alertLevel),
      ].join(','),
    );

    const branchRollupRows = report.branchRollups.map((rollup) =>
      [
        this.escapeCsvValue('BRANCH_ROLLUP'),
        this.escapeCsvValue(report.generatedAt),
        report.windowDays,
        report.baselineWindowDays,
        report.totalBranchesEvaluated,
        filters.includeInactive,
        this.escapeCsvValue(filters.onboardingStatus ?? ''),
        this.escapeCsvValue(filters.supplierProfileIds.join('|')),
        this.escapeCsvValue(filters.branchIds.join('|')),
        this.escapeCsvValue(filters.statuses.join('|')),
        this.escapeCsvValue(filters.latestActions.join('|')),
        this.escapeCsvValue(filters.actionAgeBuckets.join('|')),
        this.escapeCsvValue(filters.sortBy),
        this.escapeCsvValue(filters.assigneeUserIds.join('|')),
        filters.includeUntriaged,
        this.escapeCsvValue(filters.supplierRollupSortBy),
        this.escapeCsvValue(filters.branchRollupSortBy),
        this.escapeCsvValue(filters.supplierRollupLimit ?? ''),
        this.escapeCsvValue(filters.branchRollupLimit ?? ''),
        this.escapeCsvValue(filters.from),
        this.escapeCsvValue(filters.to ?? ''),
        '',
        '',
        rollup.branchId,
        this.escapeCsvValue(rollup.branchName),
        this.escapeCsvValue(rollup.branchCode ?? ''),
        '',
        '',
        '',
        '',
        '',
        '',
        rollup.supplierCount,
        rollup.interventionCount,
        rollup.assignedCount,
        rollup.untriagedCount,
        rollup.over24hCount,
        rollup.over72hCount,
        rollup.highestPriorityScore,
        rollup.alertCounts.normal,
        rollup.alertCounts.warning,
        rollup.alertCounts.critical,
        rollup.alertMix.normalPercent,
        rollup.alertMix.warningPercent,
        rollup.alertMix.criticalPercent,
        this.escapeCsvValue(this.formatInterventionIssueMix(rollup.issueMix)),
        this.escapeCsvValue(
          this.formatInterventionActionHintMix(rollup.actionHintMix),
        ),
        this.escapeCsvValue(rollup.alertLevel),
      ].join(','),
    );

    return [
      header,
      summaryRow,
      ...supplierRollupRows,
      ...branchRollupRows,
    ].join('\n');
  }

  async exportProcurementBranchInterventionsCsv(
    query: SupplierProcurementBranchInterventionQueryDto,
  ): Promise<string> {
    const report = await this.listProcurementBranchInterventions(query);
    const header = [
      'section',
      'generatedAt',
      'windowDays',
      'baselineWindowDays',
      'filterIncludeInactive',
      'filterOnboardingStatus',
      'filterSupplierProfileIds',
      'filterBranchIds',
      'filterStatuses',
      'filterLatestActions',
      'filterActionAgeBuckets',
      'filterSortBy',
      'filterAssigneeUserIds',
      'filterIncludeUntriaged',
      'filterFrom',
      'filterTo',
      'supplierProfileId',
      'companyName',
      'onboardingStatus',
      'isActive',
      'branchId',
      'branchName',
      'branchCode',
      'latestAction',
      'latestActionAt',
      'latestActionActorEmail',
      'latestAssigneeUserId',
      'summaryTotalInterventions',
      'summaryAssignedCount',
      'summaryUntriagedCount',
      'summaryOver24hCount',
      'summaryOver72hCount',
      'summaryNormalAlertCount',
      'summaryWarningAlertCount',
      'summaryCriticalAlertCount',
      'summaryNormalAlertPercent',
      'summaryWarningAlertPercent',
      'summaryCriticalAlertPercent',
      'summaryIssueMix',
      'summaryActionHintMix',
      'rollupIssueMix',
      'rollupActionHintMix',
      'rollupBranchCount',
      'rollupAssignedCount',
      'rollupUntriagedCount',
      'rollupOver24hCount',
      'rollupOver72hCount',
      'rollupHighestPriorityScore',
      'rollupNormalAlertCount',
      'rollupWarningAlertCount',
      'rollupCriticalAlertCount',
      'rollupNormalAlertPercent',
      'rollupWarningAlertPercent',
      'rollupCriticalAlertPercent',
      'rollupSupplierCount',
      'rollupInterventionCount',
      'interventionPriorityScore',
      'trendDirection',
      'procurementScore',
      'baselineProcurementScore',
      'scoreDeltaFrom90d',
      'fillRatePercent',
      'baselineFillRatePercent',
      'fillRateDeltaFrom90d',
      'orderCount',
      'discrepancyEventCount',
      'openDiscrepancyCount',
      'pendingAcknowledgementCount',
      'pendingShipmentCount',
      'pendingReceiptAcknowledgementCount',
      'averageAcknowledgementHours',
      'averageShipmentLatencyHours',
      'alertLevel',
      'topIssues',
      'actionHints',
    ].join(',');

    const filters = report.appliedFilters;
    const summaryRow = [
      this.escapeCsvValue('SUMMARY'),
      this.escapeCsvValue(report.generatedAt),
      report.windowDays,
      report.baselineWindowDays,
      filters.includeInactive,
      this.escapeCsvValue(filters.onboardingStatus ?? ''),
      this.escapeCsvValue(filters.supplierProfileIds.join('|')),
      this.escapeCsvValue(filters.branchIds.join('|')),
      this.escapeCsvValue(filters.statuses.join('|')),
      this.escapeCsvValue(filters.latestActions.join('|')),
      this.escapeCsvValue(filters.actionAgeBuckets.join('|')),
      this.escapeCsvValue(filters.sortBy),
      this.escapeCsvValue(filters.assigneeUserIds.join('|')),
      filters.includeUntriaged,
      this.escapeCsvValue(filters.from),
      this.escapeCsvValue(filters.to ?? ''),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      report.summary.totalInterventions,
      report.summary.assignedCount,
      report.summary.untriagedCount,
      report.summary.over24hCount,
      report.summary.over72hCount,
      report.summary.alertCounts.normal,
      report.summary.alertCounts.warning,
      report.summary.alertCounts.critical,
      report.summary.alertMix.normalPercent,
      report.summary.alertMix.warningPercent,
      report.summary.alertMix.criticalPercent,
      this.escapeCsvValue(
        this.formatInterventionIssueMix(report.summary.issueMix),
      ),
      this.escapeCsvValue(
        this.formatInterventionActionHintMix(report.summary.actionHintMix),
      ),
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
      '',
      '',
      '',
      '',
      '',
    ].join(',');

    const supplierRollupRows = report.supplierRollups.map((rollup) =>
      [
        this.escapeCsvValue('SUPPLIER_ROLLUP'),
        this.escapeCsvValue(report.generatedAt),
        report.windowDays,
        report.baselineWindowDays,
        filters.includeInactive,
        this.escapeCsvValue(filters.onboardingStatus ?? ''),
        this.escapeCsvValue(filters.supplierProfileIds.join('|')),
        this.escapeCsvValue(filters.branchIds.join('|')),
        this.escapeCsvValue(filters.statuses.join('|')),
        this.escapeCsvValue(filters.latestActions.join('|')),
        this.escapeCsvValue(filters.actionAgeBuckets.join('|')),
        this.escapeCsvValue(filters.sortBy),
        this.escapeCsvValue(filters.assigneeUserIds.join('|')),
        filters.includeUntriaged,
        this.escapeCsvValue(filters.from),
        this.escapeCsvValue(filters.to ?? ''),
        rollup.supplierProfileId,
        this.escapeCsvValue(rollup.companyName),
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
        '',
        '',
        '',
        '',
        rollup.branchCount,
        rollup.assignedCount,
        rollup.untriagedCount,
        rollup.over24hCount,
        rollup.over72hCount,
        rollup.highestPriorityScore,
        rollup.alertCounts.normal,
        rollup.alertCounts.warning,
        rollup.alertCounts.critical,
        rollup.alertMix.normalPercent,
        rollup.alertMix.warningPercent,
        rollup.alertMix.criticalPercent,
        this.escapeCsvValue(this.formatInterventionIssueMix(rollup.issueMix)),
        this.escapeCsvValue(
          this.formatInterventionActionHintMix(rollup.actionHintMix),
        ),
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
        '',
        '',
        '',
        '',
        '',
      ].join(','),
    );

    const branchRollupRows = report.branchRollups.map((rollup) =>
      [
        this.escapeCsvValue('BRANCH_ROLLUP'),
        this.escapeCsvValue(report.generatedAt),
        report.windowDays,
        report.baselineWindowDays,
        filters.includeInactive,
        this.escapeCsvValue(filters.onboardingStatus ?? ''),
        this.escapeCsvValue(filters.supplierProfileIds.join('|')),
        this.escapeCsvValue(filters.branchIds.join('|')),
        this.escapeCsvValue(filters.statuses.join('|')),
        this.escapeCsvValue(filters.latestActions.join('|')),
        this.escapeCsvValue(filters.actionAgeBuckets.join('|')),
        this.escapeCsvValue(filters.sortBy),
        this.escapeCsvValue(filters.assigneeUserIds.join('|')),
        filters.includeUntriaged,
        this.escapeCsvValue(filters.from),
        this.escapeCsvValue(filters.to ?? ''),
        '',
        '',
        '',
        '',
        rollup.branchId,
        this.escapeCsvValue(rollup.branchName),
        this.escapeCsvValue(rollup.branchCode ?? ''),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        rollup.assignedCount,
        rollup.untriagedCount,
        rollup.over24hCount,
        rollup.over72hCount,
        rollup.highestPriorityScore,
        rollup.alertCounts.normal,
        rollup.alertCounts.warning,
        rollup.alertCounts.critical,
        rollup.alertMix.normalPercent,
        rollup.alertMix.warningPercent,
        rollup.alertMix.criticalPercent,
        this.escapeCsvValue(this.formatInterventionIssueMix(rollup.issueMix)),
        this.escapeCsvValue(
          this.formatInterventionActionHintMix(rollup.actionHintMix),
        ),
        rollup.supplierCount,
        rollup.interventionCount,
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
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ].join(','),
    );

    const interventionRows = report.interventions.map((entry) =>
      [
        this.escapeCsvValue('INTERVENTION'),
        this.escapeCsvValue(report.generatedAt),
        report.windowDays,
        report.baselineWindowDays,
        filters.includeInactive,
        this.escapeCsvValue(filters.onboardingStatus ?? ''),
        this.escapeCsvValue(filters.supplierProfileIds.join('|')),
        this.escapeCsvValue(filters.branchIds.join('|')),
        this.escapeCsvValue(filters.statuses.join('|')),
        this.escapeCsvValue(filters.latestActions.join('|')),
        this.escapeCsvValue(filters.actionAgeBuckets.join('|')),
        this.escapeCsvValue(filters.sortBy),
        this.escapeCsvValue(filters.assigneeUserIds.join('|')),
        filters.includeUntriaged,
        this.escapeCsvValue(filters.from),
        this.escapeCsvValue(filters.to ?? ''),
        entry.supplierProfileId,
        this.escapeCsvValue(entry.companyName),
        this.escapeCsvValue(entry.onboardingStatus),
        entry.isActive,
        entry.branchId,
        this.escapeCsvValue(entry.branchName),
        this.escapeCsvValue(entry.branchCode ?? ''),
        this.escapeCsvValue(entry.latestAction ?? ''),
        this.escapeCsvValue(entry.latestActionAt ?? ''),
        this.escapeCsvValue(entry.latestActionActorEmail ?? ''),
        entry.latestAssigneeUserId ?? '',
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
        '',
        '',
        '',
        entry.interventionPriorityScore,
        this.escapeCsvValue(entry.trendDirection),
        entry.procurementScore,
        entry.baselineProcurementScore,
        entry.scoreDeltaFrom90d,
        entry.fillRatePercent,
        entry.baselineFillRatePercent,
        entry.fillRateDeltaFrom90d,
        entry.orderCount,
        entry.discrepancyEventCount,
        entry.openDiscrepancyCount,
        entry.pendingAcknowledgementCount,
        entry.pendingShipmentCount,
        entry.pendingReceiptAcknowledgementCount,
        entry.averageAcknowledgementHours,
        entry.averageShipmentLatencyHours,
        this.escapeCsvValue(entry.alertLevel),
        this.escapeCsvValue(entry.topIssues.join('|')),
        this.escapeCsvValue(entry.actionHints.join('|')),
      ].join(','),
    );

    const rows = [
      summaryRow,
      ...supplierRollupRows,
      ...branchRollupRows,
      ...interventionRows,
    ];

    return rows.length > 0 ? `${header}\n${rows.join('\n')}` : `${header}\n`;
  }

  async getProcurementBranchInterventionDetail(
    supplierProfileId: number,
    branchId: number,
    query: SupplierProcurementBranchInterventionDetailQueryDto,
  ): Promise<SupplierProcurementBranchInterventionDetailResponseDto> {
    const profile = await this.findOneById(supplierProfileId);
    const windowDays = Math.min(Math.max(query.windowDays ?? 30, 1), 365);
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);
    const to = query.to ?? new Date();
    const from =
      query.from ?? new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);

    if (from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const baselineFrom = new Date(
      to.getTime() -
        PROCUREMENT_INTERVENTION_BASELINE_DAYS * 24 * 60 * 60 * 1000,
    );
    const fetchFrom = from < baselineFrom ? from : baselineFrom;

    const orders = await this.purchaseOrdersRepository.find({
      where: {
        supplierProfileId,
        branchId,
        createdAt: Between(fetchFrom, to),
        ...(query.statuses?.length ? { status: In(query.statuses) } : {}),
      },
      relations: {
        branch: true,
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });

    const currentOrders = orders.filter(
      (order) => order.createdAt >= from && order.createdAt <= to,
    );
    if (currentOrders.length === 0) {
      throw new NotFoundException(
        `No procurement intervention detail found for supplier profile ${supplierProfileId} and branch ${branchId}`,
      );
    }

    const orderIds = orders.map((order) => order.id);
    const receiptEvents =
      orderIds.length > 0
        ? await this.purchaseOrderReceiptEventsRepository.find({
            where: {
              purchaseOrderId: In(orderIds),
            },
            order: { createdAt: 'DESC', id: 'DESC' },
          })
        : [];
    const receiptEventsByOrderId =
      this.groupReceiptEventsByOrderId(receiptEvents);
    const currentReceiptEvents = currentOrders.flatMap(
      (order) => receiptEventsByOrderId.get(order.id) ?? [],
    );
    const baselineOrders = orders.filter(
      (order) => order.createdAt >= baselineFrom && order.createdAt <= to,
    );
    const baselineReceiptEvents = baselineOrders.flatMap(
      (order) => receiptEventsByOrderId.get(order.id) ?? [],
    );
    const currentMetrics = this.buildProcurementMetrics(
      currentOrders,
      currentReceiptEvents,
    );
    const baselineMetrics = this.buildProcurementMetrics(
      baselineOrders,
      baselineReceiptEvents,
    );
    const currentScore =
      this.computeProcurementScore(currentMetrics).finalScore;
    const baselineScore =
      this.computeProcurementScore(baselineMetrics).finalScore;
    const scoreDeltaFrom90d = Number((currentScore - baselineScore).toFixed(2));
    const fillRateDeltaFrom90d = Number(
      (
        currentMetrics.sla.fillRatePercent - baselineMetrics.sla.fillRatePercent
      ).toFixed(2),
    );
    const discrepancyEventCount = currentReceiptEvents.filter(
      (event) => event.discrepancyStatus != null,
    ).length;
    const topIssues = this.buildInterventionTopIssues(
      currentMetrics,
      scoreDeltaFrom90d,
      fillRateDeltaFrom90d,
    );
    const actionHints = this.buildInterventionActionHints(
      currentMetrics,
      topIssues,
    );
    const branch = currentOrders[0]?.branch;
    const recentActions = await this.listRecentInterventionActions(
      supplierProfileId,
      branchId,
    );
    const latestAction = recentActions[0];
    const intervention = {
      supplierProfileId: profile.id,
      companyName: profile.companyName,
      onboardingStatus: profile.onboardingStatus,
      isActive: profile.isActive,
      branchId,
      branchName: branch?.name ?? '',
      branchCode: branch?.code ?? null,
      latestAction: this.parseInterventionWorkflowAction(
        latestAction?.action ?? '',
      ),
      latestActionAt: latestAction?.createdAt ?? null,
      latestActionActorEmail: latestAction?.actorEmail ?? null,
      latestAssigneeUserId: latestAction?.assigneeUserId ?? null,
      interventionPriorityScore: this.computeInterventionPriorityScore(
        currentMetrics,
        scoreDeltaFrom90d,
        fillRateDeltaFrom90d,
        discrepancyEventCount,
      ),
      trendDirection: this.determineTrendDirection(scoreDeltaFrom90d),
      procurementScore: currentScore,
      baselineProcurementScore: baselineScore,
      scoreDeltaFrom90d,
      fillRatePercent: currentMetrics.sla.fillRatePercent,
      baselineFillRatePercent: baselineMetrics.sla.fillRatePercent,
      fillRateDeltaFrom90d,
      orderCount: currentOrders.length,
      discrepancyEventCount,
      openDiscrepancyCount: currentMetrics.workQueues.openDiscrepancyCount,
      pendingAcknowledgementCount:
        currentMetrics.workQueues.pendingAcknowledgementCount,
      pendingShipmentCount: currentMetrics.workQueues.pendingShipmentCount,
      pendingReceiptAcknowledgementCount:
        currentMetrics.workQueues.pendingReceiptAcknowledgementCount,
      averageAcknowledgementHours:
        currentMetrics.sla.averageAcknowledgementHours,
      averageShipmentLatencyHours:
        currentMetrics.sla.averageShipmentLatencyHours,
      alertLevel: this.getInterventionEntryAlertLevel(
        this.computeInterventionPriorityScore(
          currentMetrics,
          scoreDeltaFrom90d,
          fillRateDeltaFrom90d,
          discrepancyEventCount,
        ),
        latestAction?.createdAt ?? null,
        latestAction?.assigneeUserId ?? null,
      ),
      topIssues,
      actionHints,
    } satisfies SupplierProcurementBranchInterventionEntryResponseDto;
    const currentOrdersById = new Map(
      currentOrders.map((order) => [order.id, order]),
    );

    return {
      generatedAt: new Date().toISOString(),
      appliedFilters: {
        windowDays,
        limit,
        statuses: query.statuses ?? [],
        from: from.toISOString(),
        to: to.toISOString(),
      },
      intervention,
      recentOrders: currentOrders
        .slice(0, limit)
        .map((order) =>
          this.mapRecentOrder(
            order,
            receiptEventsByOrderId.get(order.id) ?? [],
          ),
        ),
      topContributingOrders: this.buildTrendOrderContributors(
        currentOrders,
      ).slice(0, limit),
      discrepancyEvents: this.buildTrendDiscrepancyContributors(
        currentReceiptEvents,
        currentOrdersById,
      ).slice(0, limit),
      recentActions,
    };
  }

  async actOnProcurementBranchIntervention(
    supplierProfileId: number,
    branchId: number,
    dto: ActOnSupplierProcurementBranchInterventionDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<SupplierProcurementBranchInterventionDetailResponseDto> {
    if (
      !this.hasAnyRole(actor.roles ?? [], [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
      ])
    ) {
      throw new ForbiddenException(
        'Only admins can act on procurement branch interventions',
      );
    }

    await this.findOneById(supplierProfileId);
    await this.auditService.log({
      action: `procurement_branch_intervention.${dto.action.toLowerCase()}`,
      targetType: 'SUPPLIER_PROFILE',
      targetId: supplierProfileId,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.note ?? null,
      meta: {
        branchId,
        assigneeUserId: dto.assigneeUserId ?? null,
      },
    });

    const detail = await this.getProcurementBranchInterventionDetail(
      supplierProfileId,
      branchId,
      {},
    );

    this.dispatchProcurementInterventionActionFanout(detail, dto, actor).catch(
      (error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown procurement fanout failure';
        this.logger.error(
          `Failed to fan out procurement intervention action for supplier ${supplierProfileId} branch ${branchId}: ${message}`,
        );
      },
    );

    return detail;
  }

  private async dispatchProcurementInterventionActionFanout(
    detail: SupplierProcurementBranchInterventionDetailResponseDto,
    dto: ActOnSupplierProcurementBranchInterventionDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    },
  ): Promise<void> {
    const fanoutTasks: Promise<unknown>[] = [
      this.realtimeGateway.notifyProcurementInterventionUpdated({
        supplierProfileId: detail.intervention.supplierProfileId,
        branchId: detail.intervention.branchId,
        action: dto.action,
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? null,
        assigneeUserId: dto.assigneeUserId ?? null,
        note: dto.note ?? null,
        occurredAt: detail.generatedAt,
        intervention: {
          supplierProfileId: detail.intervention.supplierProfileId,
          companyName: detail.intervention.companyName,
          branchId: detail.intervention.branchId,
          branchName: detail.intervention.branchName,
          branchCode: detail.intervention.branchCode,
          alertLevel: detail.intervention.alertLevel,
          interventionPriorityScore:
            detail.intervention.interventionPriorityScore,
          topIssues: detail.intervention.topIssues,
          actionHints: detail.intervention.actionHints,
          latestAction: detail.intervention.latestAction,
          latestActionAt: detail.intervention.latestActionAt,
          latestActionActorEmail: detail.intervention.latestActionActorEmail,
          latestAssigneeUserId: detail.intervention.latestAssigneeUserId,
        },
      }),
      this.procurementWebhooksService.dispatchProcurementEvent({
        eventType: ProcurementWebhookEventType.INTERVENTION_UPDATED,
        eventKey: `procurement-intervention:${detail.intervention.supplierProfileId}:${detail.intervention.branchId}:${dto.action}:${detail.generatedAt}`,
        branchId: detail.intervention.branchId,
        supplierProfileId: detail.intervention.supplierProfileId,
        payload: {
          supplierProfileId: detail.intervention.supplierProfileId,
          branchId: detail.intervention.branchId,
          action: dto.action,
          actorId: actor.id ?? null,
          actorEmail: actor.email ?? null,
          assigneeUserId: dto.assigneeUserId ?? null,
          note: dto.note ?? null,
          occurredAt: detail.generatedAt,
          intervention: {
            supplierProfileId: detail.intervention.supplierProfileId,
            companyName: detail.intervention.companyName,
            branchId: detail.intervention.branchId,
            branchName: detail.intervention.branchName,
            branchCode: detail.intervention.branchCode,
            alertLevel: detail.intervention.alertLevel,
            interventionPriorityScore:
              detail.intervention.interventionPriorityScore,
            topIssues: detail.intervention.topIssues,
            actionHints: detail.intervention.actionHints,
            latestAction: detail.intervention.latestAction,
            latestActionAt: detail.intervention.latestActionAt,
            latestActionActorEmail: detail.intervention.latestActionActorEmail,
            latestAssigneeUserId: detail.intervention.latestAssigneeUserId,
          },
        },
      }),
    ];

    if (
      dto.action === SupplierProcurementBranchInterventionAction.ASSIGN &&
      dto.assigneeUserId != null &&
      dto.assigneeUserId !== actor.id
    ) {
      const assignee = await this.usersRepository.findOne({
        where: { id: dto.assigneeUserId },
      });
      if (assignee) {
        fanoutTasks.push(
          this.notificationsService.createAndDispatch({
            userId: assignee.id,
            title: `Procurement intervention assigned: ${detail.intervention.companyName}`,
            body: `${detail.intervention.branchName} now requires attention for ${detail.intervention.companyName}.`,
            type: NotificationType.SYSTEM,
            data: {
              category: 'procurement_intervention',
              route: '/admin/b2b/procurement/branch-interventions',
              supplierProfileId: detail.intervention.supplierProfileId,
              branchId: detail.intervention.branchId,
              action: dto.action,
              alertLevel: detail.intervention.alertLevel,
            },
          }),
        );
      }
    }

    await Promise.allSettled(fanoutTasks);
  }

  async exportProcurementBranchInterventionDetailCsv(
    supplierProfileId: number,
    branchId: number,
    query: SupplierProcurementBranchInterventionDetailQueryDto,
  ): Promise<string> {
    const detail = await this.getProcurementBranchInterventionDetail(
      supplierProfileId,
      branchId,
      query,
    );
    const header = [
      'section',
      'generatedAt',
      'supplierProfileId',
      'companyName',
      'branchId',
      'branchName',
      'branchCode',
      'windowDays',
      'limit',
      'statuses',
      'from',
      'to',
      'purchaseOrderId',
      'receiptEventId',
      'orderNumber',
      'status',
      'discrepancyStatus',
      'interventionPriorityScore',
      'trendDirection',
      'procurementScore',
      'baselineProcurementScore',
      'scoreDeltaFrom90d',
      'fillRatePercent',
      'baselineFillRatePercent',
      'fillRateDeltaFrom90d',
      'latestAction',
      'latestActionAt',
      'latestActionActorEmail',
      'latestAssigneeUserId',
      'impactScore',
      'topIssues',
      'actionHints',
      'createdAt',
      'supplierAcknowledgedAt',
      'note',
    ].join(',');
    const filters = detail.appliedFilters;
    const summaryRow = [
      this.escapeCsvValue('SUMMARY'),
      this.escapeCsvValue(detail.generatedAt),
      detail.intervention.supplierProfileId,
      this.escapeCsvValue(detail.intervention.companyName),
      detail.intervention.branchId,
      this.escapeCsvValue(detail.intervention.branchName),
      this.escapeCsvValue(detail.intervention.branchCode ?? ''),
      filters.windowDays,
      filters.limit,
      this.escapeCsvValue(filters.statuses.join('|')),
      this.escapeCsvValue(filters.from),
      this.escapeCsvValue(filters.to),
      '',
      '',
      '',
      '',
      '',
      detail.intervention.interventionPriorityScore,
      this.escapeCsvValue(detail.intervention.trendDirection),
      detail.intervention.procurementScore,
      detail.intervention.baselineProcurementScore,
      detail.intervention.scoreDeltaFrom90d,
      detail.intervention.fillRatePercent,
      detail.intervention.baselineFillRatePercent,
      detail.intervention.fillRateDeltaFrom90d,
      this.escapeCsvValue(detail.intervention.latestAction ?? ''),
      this.escapeCsvValue(detail.intervention.latestActionAt ?? ''),
      this.escapeCsvValue(detail.intervention.latestActionActorEmail ?? ''),
      detail.intervention.latestAssigneeUserId ?? '',
      '',
      this.escapeCsvValue(detail.intervention.topIssues.join('|')),
      this.escapeCsvValue(detail.intervention.actionHints.join('|')),
      '',
      '',
      '',
    ].join(',');

    const orderRows = detail.topContributingOrders.map((order) =>
      [
        this.escapeCsvValue('ORDER'),
        this.escapeCsvValue(detail.generatedAt),
        detail.intervention.supplierProfileId,
        this.escapeCsvValue(detail.intervention.companyName),
        detail.intervention.branchId,
        this.escapeCsvValue(detail.intervention.branchName),
        this.escapeCsvValue(detail.intervention.branchCode ?? ''),
        filters.windowDays,
        filters.limit,
        this.escapeCsvValue(filters.statuses.join('|')),
        this.escapeCsvValue(filters.from),
        this.escapeCsvValue(filters.to),
        order.purchaseOrderId,
        '',
        this.escapeCsvValue(order.orderNumber),
        this.escapeCsvValue(order.status),
        '',
        detail.intervention.interventionPriorityScore,
        this.escapeCsvValue(detail.intervention.trendDirection),
        detail.intervention.procurementScore,
        detail.intervention.baselineProcurementScore,
        detail.intervention.scoreDeltaFrom90d,
        order.fillRatePercent,
        detail.intervention.baselineFillRatePercent,
        detail.intervention.fillRateDeltaFrom90d,
        this.escapeCsvValue(detail.intervention.latestAction ?? ''),
        this.escapeCsvValue(detail.intervention.latestActionAt ?? ''),
        this.escapeCsvValue(detail.intervention.latestActionActorEmail ?? ''),
        detail.intervention.latestAssigneeUserId ?? '',
        order.impactScore,
        '',
        '',
        this.escapeCsvValue(order.createdAt),
        '',
        '',
      ].join(','),
    );

    const discrepancyRows = detail.discrepancyEvents.map((event) =>
      [
        this.escapeCsvValue('DISCREPANCY'),
        this.escapeCsvValue(detail.generatedAt),
        detail.intervention.supplierProfileId,
        this.escapeCsvValue(detail.intervention.companyName),
        detail.intervention.branchId,
        this.escapeCsvValue(detail.intervention.branchName),
        this.escapeCsvValue(detail.intervention.branchCode ?? ''),
        filters.windowDays,
        filters.limit,
        this.escapeCsvValue(filters.statuses.join('|')),
        this.escapeCsvValue(filters.from),
        this.escapeCsvValue(filters.to),
        event.purchaseOrderId,
        event.receiptEventId,
        this.escapeCsvValue(event.orderNumber),
        '',
        this.escapeCsvValue(event.discrepancyStatus ?? ''),
        detail.intervention.interventionPriorityScore,
        this.escapeCsvValue(detail.intervention.trendDirection),
        detail.intervention.procurementScore,
        detail.intervention.baselineProcurementScore,
        detail.intervention.scoreDeltaFrom90d,
        detail.intervention.fillRatePercent,
        detail.intervention.baselineFillRatePercent,
        detail.intervention.fillRateDeltaFrom90d,
        this.escapeCsvValue(detail.intervention.latestAction ?? ''),
        this.escapeCsvValue(detail.intervention.latestActionAt ?? ''),
        this.escapeCsvValue(detail.intervention.latestActionActorEmail ?? ''),
        detail.intervention.latestAssigneeUserId ?? '',
        event.impactScore,
        '',
        '',
        this.escapeCsvValue(event.createdAt),
        this.escapeCsvValue(event.supplierAcknowledgedAt ?? ''),
        this.escapeCsvValue(event.note ?? ''),
      ].join(','),
    );

    const actionRows = detail.recentActions.map((action) =>
      [
        this.escapeCsvValue('ACTION'),
        this.escapeCsvValue(detail.generatedAt),
        detail.intervention.supplierProfileId,
        this.escapeCsvValue(detail.intervention.companyName),
        detail.intervention.branchId,
        this.escapeCsvValue(detail.intervention.branchName),
        this.escapeCsvValue(detail.intervention.branchCode ?? ''),
        filters.windowDays,
        filters.limit,
        this.escapeCsvValue(filters.statuses.join('|')),
        this.escapeCsvValue(filters.from),
        this.escapeCsvValue(filters.to),
        '',
        '',
        '',
        '',
        '',
        detail.intervention.interventionPriorityScore,
        this.escapeCsvValue(detail.intervention.trendDirection),
        detail.intervention.procurementScore,
        detail.intervention.baselineProcurementScore,
        detail.intervention.scoreDeltaFrom90d,
        detail.intervention.fillRatePercent,
        detail.intervention.baselineFillRatePercent,
        detail.intervention.fillRateDeltaFrom90d,
        this.escapeCsvValue(
          this.parseInterventionWorkflowAction(action.action) ?? action.action,
        ),
        this.escapeCsvValue(action.createdAt),
        this.escapeCsvValue(action.actorEmail ?? ''),
        action.assigneeUserId ?? '',
        '',
        '',
        '',
        this.escapeCsvValue(action.createdAt),
        '',
        this.escapeCsvValue(action.note ?? ''),
      ].join(','),
    );

    return [
      header,
      summaryRow,
      ...orderRows,
      ...discrepancyRows,
      ...actionRows,
    ].join('\n');
  }

  async listProcurementScorecard(
    query: SupplierProcurementScorecardQueryDto,
  ): Promise<SupplierProcurementScorecardResponseDto> {
    const windowDays = Math.min(Math.max(query.windowDays ?? 30, 1), 365);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const defaultFrom = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const from = query.from ?? defaultFrom;
    const to = query.to;

    if (to && from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const where: FindOptionsWhere<SupplierProfile> = {};
    if (!query.includeInactive) {
      where.isActive = true;
    }
    if (query.onboardingStatus) {
      where.onboardingStatus = query.onboardingStatus;
    }
    if (query.supplierProfileIds?.length) {
      where.id = In(query.supplierProfileIds);
    }

    const createdAtFilter = to ? Between(from, to) : MoreThanOrEqual(from);

    const profiles = await this.supplierProfilesRepository.find({
      where,
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });

    if (profiles.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        windowDays,
        totalSuppliersEvaluated: 0,
        appliedFilters: this.buildScorecardAppliedFilters(query, from, to),
        rankedSuppliers: [],
      };
    }

    const profileIds = profiles.map((profile) => profile.id);
    const orders = await this.purchaseOrdersRepository.find({
      where: {
        supplierProfileId: In(profileIds),
        ...(query.branchIds?.length ? { branchId: In(query.branchIds) } : {}),
        createdAt: createdAtFilter,
        ...(query.statuses?.length ? { status: In(query.statuses) } : {}),
      },
      order: {
        updatedAt: 'DESC',
        id: 'DESC',
      },
    });

    const orderIds = orders.map((order) => order.id);
    const receiptEvents =
      orderIds.length > 0
        ? await this.purchaseOrderReceiptEventsRepository.find({
            where: {
              purchaseOrderId: In(orderIds),
            },
            order: { createdAt: 'DESC', id: 'DESC' },
          })
        : [];

    const ordersByProfileId = this.groupOrdersByProfileId(orders);
    const receiptEventsByOrderId =
      this.groupReceiptEventsByOrderId(receiptEvents);

    const rankedSuppliers = profiles
      .map((profile) => {
        const supplierOrders = ordersByProfileId.get(profile.id) ?? [];
        const supplierReceiptEvents = supplierOrders.flatMap(
          (order) => receiptEventsByOrderId.get(order.id) ?? [],
        );
        const metrics = this.buildProcurementMetrics(
          supplierOrders,
          supplierReceiptEvents,
        );
        const score = this.computeProcurementScore(metrics);

        return {
          supplierProfileId: profile.id,
          companyName: profile.companyName,
          onboardingStatus: profile.onboardingStatus,
          isActive: profile.isActive,
          procurementScore: score.finalScore,
          scoreBreakdown: score.breakdown,
          totalOrders: metrics.totalOrders,
          activeOrderCount: metrics.activeOrderCount,
          averageAcknowledgementHours: metrics.sla.averageAcknowledgementHours,
          averageShipmentLatencyHours: metrics.sla.averageShipmentLatencyHours,
          averageReceiptAcknowledgementHours:
            metrics.sla.averageReceiptAcknowledgementHours,
          fillRatePercent: metrics.sla.fillRatePercent,
          shortageRatePercent: metrics.sla.shortageRatePercent,
          damageRatePercent: metrics.sla.damageRatePercent,
          pendingAcknowledgementCount:
            metrics.workQueues.pendingAcknowledgementCount,
          pendingShipmentCount: metrics.workQueues.pendingShipmentCount,
          pendingReceiptAcknowledgementCount:
            metrics.workQueues.pendingReceiptAcknowledgementCount,
          openDiscrepancyCount: metrics.workQueues.openDiscrepancyCount,
          awaitingApprovalDiscrepancyCount:
            metrics.workQueues.awaitingApprovalDiscrepancyCount,
        } satisfies SupplierProcurementScorecardEntryResponseDto;
      })
      .sort((left, right) => {
        if (right.procurementScore !== left.procurementScore) {
          return right.procurementScore - left.procurementScore;
        }

        if (right.totalOrders !== left.totalOrders) {
          return right.totalOrders - left.totalOrders;
        }

        return left.companyName.localeCompare(right.companyName);
      })
      .slice(0, limit);

    return {
      generatedAt: new Date().toISOString(),
      windowDays,
      totalSuppliersEvaluated: profiles.length,
      appliedFilters: this.buildScorecardAppliedFilters(query, from, to),
      rankedSuppliers,
    };
  }

  async exportProcurementScorecardCsv(
    query: SupplierProcurementScorecardQueryDto,
  ): Promise<string> {
    const scorecard = await this.listProcurementScorecard(query);
    const header = [
      'generatedAt',
      'windowDays',
      'filterIncludeInactive',
      'filterOnboardingStatus',
      'filterSupplierProfileIds',
      'filterBranchIds',
      'filterStatuses',
      'filterFrom',
      'filterTo',
      'supplierProfileId',
      'companyName',
      'onboardingStatus',
      'isActive',
      'procurementScore',
      'fillRateScore',
      'acknowledgementScore',
      'shipmentScore',
      'receiptAcknowledgementScore',
      'discrepancyScore',
      'discrepancyPenalty',
      'totalOrders',
      'activeOrderCount',
      'averageAcknowledgementHours',
      'averageShipmentLatencyHours',
      'averageReceiptAcknowledgementHours',
      'fillRatePercent',
      'shortageRatePercent',
      'damageRatePercent',
      'pendingAcknowledgementCount',
      'pendingShipmentCount',
      'pendingReceiptAcknowledgementCount',
      'openDiscrepancyCount',
      'awaitingApprovalDiscrepancyCount',
    ].join(',');

    const appliedFilters = scorecard.appliedFilters;

    const rows = scorecard.rankedSuppliers.map((supplier) =>
      [
        this.escapeCsvValue(scorecard.generatedAt),
        scorecard.windowDays,
        appliedFilters.includeInactive,
        this.escapeCsvValue(appliedFilters.onboardingStatus ?? ''),
        this.escapeCsvValue(appliedFilters.supplierProfileIds.join('|')),
        this.escapeCsvValue(appliedFilters.branchIds.join('|')),
        this.escapeCsvValue(appliedFilters.statuses.join('|')),
        this.escapeCsvValue(appliedFilters.from),
        this.escapeCsvValue(appliedFilters.to ?? ''),
        supplier.supplierProfileId,
        this.escapeCsvValue(supplier.companyName),
        this.escapeCsvValue(supplier.onboardingStatus),
        supplier.isActive,
        supplier.procurementScore,
        supplier.scoreBreakdown.fillRateScore,
        supplier.scoreBreakdown.acknowledgementScore,
        supplier.scoreBreakdown.shipmentScore,
        supplier.scoreBreakdown.receiptAcknowledgementScore,
        supplier.scoreBreakdown.discrepancyScore,
        supplier.scoreBreakdown.discrepancyPenalty,
        supplier.totalOrders,
        supplier.activeOrderCount,
        supplier.averageAcknowledgementHours,
        supplier.averageShipmentLatencyHours,
        supplier.averageReceiptAcknowledgementHours,
        supplier.fillRatePercent,
        supplier.shortageRatePercent,
        supplier.damageRatePercent,
        supplier.pendingAcknowledgementCount,
        supplier.pendingShipmentCount,
        supplier.pendingReceiptAcknowledgementCount,
        supplier.openDiscrepancyCount,
        supplier.awaitingApprovalDiscrepancyCount,
      ].join(','),
    );

    return rows.length > 0 ? `${header}\n${rows.join('\n')}` : `${header}\n`;
  }

  async updateStatus(
    id: number,
    dto: UpdateSupplierProfileStatusDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
      reason?: string;
    } = {},
  ): Promise<SupplierProfile> {
    const profile = await this.findOneById(id);
    const nextStatus = dto.status;
    const roles = actor.roles ?? [];
    const previousStatus = profile.onboardingStatus;

    if (previousStatus === nextStatus) {
      return profile;
    }

    const allowedTransitions =
      SUPPLIER_PROFILE_TRANSITIONS[previousStatus] ?? [];
    if (!allowedTransitions.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid supplier profile transition from ${profile.onboardingStatus} to ${nextStatus}`,
      );
    }

    if (
      [
        SupplierOnboardingStatus.APPROVED,
        SupplierOnboardingStatus.REJECTED,
      ].includes(nextStatus) &&
      !this.hasAnyRole(roles, [UserRole.SUPER_ADMIN, UserRole.ADMIN])
    ) {
      throw new ForbiddenException(
        `Only admins can move supplier profiles to ${nextStatus}`,
      );
    }

    if (
      nextStatus === SupplierOnboardingStatus.PENDING_REVIEW &&
      !this.hasAnyRole(roles, [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.SUPPLIER_ACCOUNT,
      ])
    ) {
      throw new ForbiddenException(
        'Only supplier accounts or admins can submit supplier profiles for review',
      );
    }

    profile.onboardingStatus = nextStatus;
    await this.supplierProfilesRepository.save(profile);

    await this.auditService.log({
      action: 'supplier_profile.status.update',
      targetType: 'SUPPLIER_PROFILE',
      targetId: id,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: actor.reason ?? null,
      meta: {
        fromStatus: previousStatus,
        toStatus: nextStatus,
      },
    });

    return this.findOneById(id);
  }

  async updateActive(
    id: number,
    dto: UpdateSupplierProfileActiveDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
      reason?: string;
    } = {},
  ): Promise<SupplierProfile> {
    const profile = await this.findOneById(id);
    const previousActive = profile.isActive;
    const nextActive = Boolean(dto.isActive);

    if (previousActive === nextActive) {
      return profile;
    }

    if (
      !this.hasAnyRole(actor.roles ?? [], [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
      ])
    ) {
      throw new ForbiddenException(
        'Only admins can change supplier active state',
      );
    }

    profile.isActive = nextActive;
    await this.supplierProfilesRepository.save(profile);

    await this.auditService.log({
      action: 'supplier_profile.active.update',
      targetType: 'SUPPLIER_PROFILE',
      targetId: id,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.reason ?? actor.reason ?? null,
      meta: {
        fromIsActive: previousActive,
        toIsActive: nextActive,
      },
    });

    return this.findOneById(id);
  }

  private async findOneById(id: number): Promise<SupplierProfile> {
    const profile = await this.supplierProfilesRepository.findOne({
      where: { id },
      relations: { user: true },
    });

    if (!profile) {
      throw new NotFoundException(`Supplier profile with ID ${id} not found`);
    }

    return profile;
  }

  private assertCanAccessProfile(
    profile: SupplierProfile,
    actorId: number | null,
    roles: string[],
  ): void {
    if (this.hasAnyRole(roles, [UserRole.SUPER_ADMIN, UserRole.ADMIN])) {
      return;
    }

    if (
      this.hasAnyRole(roles, [UserRole.SUPPLIER_ACCOUNT]) &&
      actorId != null &&
      profile.userId === actorId
    ) {
      return;
    }

    throw new ForbiddenException(
      'You are not allowed to access procurement summary for this supplier profile',
    );
  }

  private buildStatusCounts(
    orders: PurchaseOrder[],
  ): SupplierProcurementStatusCountResponseDto[] {
    return [
      PurchaseOrderStatus.DRAFT,
      PurchaseOrderStatus.SUBMITTED,
      PurchaseOrderStatus.ACKNOWLEDGED,
      PurchaseOrderStatus.SHIPPED,
      PurchaseOrderStatus.RECEIVED,
      PurchaseOrderStatus.RECONCILED,
      PurchaseOrderStatus.CANCELLED,
    ].map((status) => ({
      status,
      count: orders.filter((order) => order.status === status).length,
    }));
  }

  private buildProcurementMetrics(
    orders: PurchaseOrder[],
    receiptEvents: PurchaseOrderReceiptEvent[],
  ): SupplierProcurementMetrics {
    const totalOrderedQuantity = orders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (itemSum, item) => itemSum + item.orderedQuantity,
          0,
        ),
      0,
    );
    const totalReceivedQuantity = orders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (itemSum, item) => itemSum + item.receivedQuantity,
          0,
        ),
      0,
    );
    const totalShortageQuantity = orders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (itemSum, item) => itemSum + item.shortageQuantity,
          0,
        ),
      0,
    );
    const totalDamagedQuantity = orders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (itemSum, item) => itemSum + item.damagedQuantity,
          0,
        ),
      0,
    );
    const acknowledgementHours = orders
      .map((order) =>
        order.submittedAt && order.acknowledgedAt
          ? this.diffHours(order.submittedAt, order.acknowledgedAt)
          : null,
      )
      .filter((value): value is number => value != null);
    const shipmentLatencyHours = orders
      .map((order) =>
        order.acknowledgedAt && order.shippedAt
          ? this.diffHours(order.acknowledgedAt, order.shippedAt)
          : null,
      )
      .filter((value): value is number => value != null);
    const receiptAcknowledgementHours = receiptEvents
      .map((event) =>
        event.supplierAcknowledgedAt
          ? this.diffHours(event.createdAt, event.supplierAcknowledgedAt)
          : null,
      )
      .filter((value): value is number => value != null);

    return {
      totalOrders: orders.length,
      activeOrderCount: orders.filter(
        (order) =>
          ![
            PurchaseOrderStatus.RECONCILED,
            PurchaseOrderStatus.CANCELLED,
          ].includes(order.status),
      ).length,
      statusCounts: this.buildStatusCounts(orders),
      workQueues: {
        pendingAcknowledgementCount: orders.filter(
          (order) => order.status === PurchaseOrderStatus.SUBMITTED,
        ).length,
        pendingShipmentCount: orders.filter(
          (order) => order.status === PurchaseOrderStatus.ACKNOWLEDGED,
        ).length,
        pendingReceiptAcknowledgementCount: receiptEvents.filter(
          (event) => !event.supplierAcknowledgedAt,
        ).length,
        openDiscrepancyCount: receiptEvents.filter(
          (event) =>
            event.discrepancyStatus ===
            PurchaseOrderReceiptDiscrepancyStatus.OPEN,
        ).length,
        awaitingApprovalDiscrepancyCount: receiptEvents.filter(
          (event) =>
            event.discrepancyStatus ===
            PurchaseOrderReceiptDiscrepancyStatus.RESOLVED,
        ).length,
      },
      sla: {
        averageAcknowledgementHours: this.average(acknowledgementHours),
        averageShipmentLatencyHours: this.average(shipmentLatencyHours),
        averageReceiptAcknowledgementHours: this.average(
          receiptAcknowledgementHours,
        ),
        fillRatePercent:
          totalOrderedQuantity > 0
            ? this.toPercent(totalReceivedQuantity / totalOrderedQuantity)
            : 0,
        shortageRatePercent:
          totalOrderedQuantity > 0
            ? this.toPercent(totalShortageQuantity / totalOrderedQuantity)
            : 0,
        damageRatePercent:
          totalOrderedQuantity > 0
            ? this.toPercent(totalDamagedQuantity / totalOrderedQuantity)
            : 0,
      },
    };
  }

  private groupOrdersByProfileId(
    orders: PurchaseOrder[],
  ): Map<number, PurchaseOrder[]> {
    const grouped = new Map<number, PurchaseOrder[]>();

    for (const order of orders) {
      const existingOrders = grouped.get(order.supplierProfileId);
      if (existingOrders) {
        existingOrders.push(order);
      } else {
        grouped.set(order.supplierProfileId, [order]);
      }
    }

    return grouped;
  }

  private groupReceiptEventsByOrderId(
    receiptEvents: PurchaseOrderReceiptEvent[],
  ): Map<number, PurchaseOrderReceiptEvent[]> {
    const grouped = new Map<number, PurchaseOrderReceiptEvent[]>();

    for (const receiptEvent of receiptEvents) {
      const existingEvents = grouped.get(receiptEvent.purchaseOrderId);
      if (existingEvents) {
        existingEvents.push(receiptEvent);
      } else {
        grouped.set(receiptEvent.purchaseOrderId, [receiptEvent]);
      }
    }

    return grouped;
  }

  private computeProcurementScore(
    metrics: SupplierProcurementMetrics,
  ): SupplierProcurementScoreComputation {
    if (metrics.totalOrders === 0) {
      return {
        finalScore: 0,
        breakdown: {
          fillRateScore: 0,
          acknowledgementScore: 0,
          shipmentScore: 0,
          receiptAcknowledgementScore: 0,
          discrepancyScore: 0,
          discrepancyPenalty: 0,
        },
      };
    }

    const acknowledgementScore = this.latencyScore(
      metrics.sla.averageAcknowledgementHours,
      4,
      48,
    );
    const shipmentScore = this.latencyScore(
      metrics.sla.averageShipmentLatencyHours,
      24,
      120,
    );
    const receiptAcknowledgementScore = this.latencyScore(
      metrics.sla.averageReceiptAcknowledgementHours,
      8,
      72,
    );
    const discrepancyPenalty = Math.min(
      40,
      metrics.sla.shortageRatePercent + metrics.sla.damageRatePercent,
    );
    const discrepancyScore = this.clampScore(100 - discrepancyPenalty);
    const fillRateScore = this.clampScore(metrics.sla.fillRatePercent);

    return {
      finalScore: Number(
        (
          fillRateScore * 0.4 +
          acknowledgementScore * 0.2 +
          shipmentScore * 0.15 +
          receiptAcknowledgementScore * 0.1 +
          discrepancyScore * 0.15
        ).toFixed(2),
      ),
      breakdown: {
        fillRateScore,
        acknowledgementScore,
        shipmentScore,
        receiptAcknowledgementScore,
        discrepancyScore,
        discrepancyPenalty,
      },
    };
  }

  private buildTrendOrderContributors(
    orders: PurchaseOrder[],
  ): SupplierProcurementTrendOrderContributorResponseDto[] {
    return orders
      .map((order) => this.mapTrendOrderContributor(order))
      .sort((left, right) => {
        if (right.impactScore !== left.impactScore) {
          return right.impactScore - left.impactScore;
        }

        return right.createdAt.localeCompare(left.createdAt);
      })
      .slice(0, 5);
  }

  private buildTrendDiscrepancyContributors(
    receiptEvents: PurchaseOrderReceiptEvent[],
    ordersById: Map<number, PurchaseOrder>,
  ): SupplierProcurementTrendDiscrepancyContributorResponseDto[] {
    return receiptEvents
      .filter((event) => event.discrepancyStatus != null)
      .map((event) => this.mapTrendDiscrepancyContributor(event, ordersById))
      .sort((left, right) => {
        if (right.impactScore !== left.impactScore) {
          return right.impactScore - left.impactScore;
        }

        return right.createdAt.localeCompare(left.createdAt);
      })
      .slice(0, 5);
  }

  private buildTrendBranchBuckets(
    orders: PurchaseOrder[],
    asOf: Date,
    receiptEventsByOrderId: Map<number, PurchaseOrderReceiptEvent[]>,
    orderContributors: SupplierProcurementTrendOrderContributorResponseDto[],
    discrepancyContributors: SupplierProcurementTrendDiscrepancyContributorResponseDto[],
  ): SupplierProcurementTrendBranchBucketResponseDto[] {
    const ordersByBranchId = new Map<number, PurchaseOrder[]>();

    for (const order of orders) {
      const existingOrders = ordersByBranchId.get(order.branchId);
      if (existingOrders) {
        existingOrders.push(order);
      } else {
        ordersByBranchId.set(order.branchId, [order]);
      }
    }

    const totalImpact = Number(
      (
        orderContributors.reduce((sum, item) => sum + item.impactScore, 0) +
        discrepancyContributors.reduce((sum, item) => sum + item.impactScore, 0)
      ).toFixed(2),
    );

    return Array.from(ordersByBranchId.entries())
      .map(([branchId, branchOrders]) => {
        const branchReceiptEvents = branchOrders.flatMap(
          (order) => receiptEventsByOrderId.get(order.id) ?? [],
        );
        const metrics = this.buildProcurementMetrics(
          branchOrders,
          branchReceiptEvents,
        );
        const score = this.computeProcurementScore(metrics);
        const branch = branchOrders[0]?.branch;
        const branchWindows = PROCUREMENT_TREND_WINDOWS.map((windowDays) => {
          const windowStart = new Date(
            asOf.getTime() - windowDays * 24 * 60 * 60 * 1000,
          );
          const windowOrders = branchOrders.filter(
            (order) =>
              order.createdAt >= windowStart && order.createdAt <= asOf,
          );
          const windowReceiptEvents = windowOrders.flatMap(
            (order) => receiptEventsByOrderId.get(order.id) ?? [],
          );
          const windowMetrics = this.buildProcurementMetrics(
            windowOrders,
            windowReceiptEvents,
          );

          return {
            procurementScore:
              this.computeProcurementScore(windowMetrics).finalScore,
            fillRatePercent: windowMetrics.sla.fillRatePercent,
          };
        });
        const shortestWindow = branchWindows[0];
        const longestWindow = branchWindows[branchWindows.length - 1];
        const scoreDeltaFrom90d = Number(
          (
            shortestWindow.procurementScore - longestWindow.procurementScore
          ).toFixed(2),
        );
        const fillRateDeltaFrom90d = Number(
          (
            shortestWindow.fillRatePercent - longestWindow.fillRatePercent
          ).toFixed(2),
        );
        const branchImpactScore = Number(
          (
            orderContributors
              .filter((item) => item.branchId === branchId)
              .reduce((sum, item) => sum + item.impactScore, 0) +
            discrepancyContributors
              .filter((item) => item.branchId === branchId)
              .reduce((sum, item) => sum + item.impactScore, 0)
          ).toFixed(2),
        );

        return {
          branchId,
          branchName: branch?.name ?? '',
          branchCode: branch?.code ?? null,
          procurementScore: score.finalScore,
          trendDirection:
            scoreDeltaFrom90d > 2
              ? 'IMPROVING'
              : scoreDeltaFrom90d < -2
                ? 'WORSENING'
                : 'STABLE',
          scoreDeltaFrom90d,
          fillRateDeltaFrom90d,
          impactScore: branchImpactScore,
          impactSharePercent:
            totalImpact > 0
              ? this.toPercent(branchImpactScore / totalImpact)
              : 0,
          orderCount: branchOrders.length,
          discrepancyEventCount: branchReceiptEvents.filter(
            (event) => event.discrepancyStatus != null,
          ).length,
          openDiscrepancyCount: metrics.workQueues.openDiscrepancyCount,
          fillRatePercent: metrics.sla.fillRatePercent,
          averageAcknowledgementHours: metrics.sla.averageAcknowledgementHours,
          averageShipmentLatencyHours: metrics.sla.averageShipmentLatencyHours,
          averageReceiptAcknowledgementHours:
            metrics.sla.averageReceiptAcknowledgementHours,
        } satisfies SupplierProcurementTrendBranchBucketResponseDto;
      })
      .sort((left, right) => {
        if (right.impactScore !== left.impactScore) {
          return right.impactScore - left.impactScore;
        }

        if (right.openDiscrepancyCount !== left.openDiscrepancyCount) {
          return right.openDiscrepancyCount - left.openDiscrepancyCount;
        }

        return left.branchName.localeCompare(right.branchName);
      })
      .slice(0, 5);
  }

  private computeInterventionPriorityScore(
    metrics: SupplierProcurementMetrics,
    scoreDeltaFrom90d: number,
    fillRateDeltaFrom90d: number,
    discrepancyEventCount: number,
  ): number {
    return Number(
      (
        Math.max(0, -scoreDeltaFrom90d) * 1.5 +
        Math.max(0, -fillRateDeltaFrom90d) * 0.75 +
        metrics.workQueues.openDiscrepancyCount * 12 +
        discrepancyEventCount * 5 +
        metrics.workQueues.pendingAcknowledgementCount * 8 +
        metrics.workQueues.pendingShipmentCount * 6 +
        metrics.workQueues.pendingReceiptAcknowledgementCount * 6 +
        Math.max(0, 90 - metrics.sla.fillRatePercent) * 0.8 +
        Math.max(0, metrics.sla.averageAcknowledgementHours - 4) +
        Math.max(0, metrics.sla.averageShipmentLatencyHours - 24) / 2
      ).toFixed(2),
    );
  }

  private buildInterventionTopIssues(
    metrics: SupplierProcurementMetrics,
    scoreDeltaFrom90d: number,
    fillRateDeltaFrom90d: number,
  ): string[] {
    const issues = [
      {
        key: 'WORSENING_PROCUREMENT_SCORE',
        value: Math.max(0, -scoreDeltaFrom90d),
      },
      {
        key: 'OPEN_DISCREPANCIES',
        value: metrics.workQueues.openDiscrepancyCount * 10,
      },
      {
        key: 'LOW_FILL_RATE',
        value:
          Math.max(0, 90 - metrics.sla.fillRatePercent) +
          Math.max(0, -fillRateDeltaFrom90d),
      },
      {
        key: 'PENDING_ACKNOWLEDGEMENTS',
        value: metrics.workQueues.pendingAcknowledgementCount * 8,
      },
      {
        key: 'PENDING_SHIPMENTS',
        value: metrics.workQueues.pendingShipmentCount * 6,
      },
      {
        key: 'PENDING_RECEIPT_ACKNOWLEDGEMENTS',
        value: metrics.workQueues.pendingReceiptAcknowledgementCount * 6,
      },
      {
        key: 'SLOW_ACKNOWLEDGEMENT',
        value: Math.max(0, metrics.sla.averageAcknowledgementHours - 4),
      },
      {
        key: 'SLOW_SHIPMENT',
        value: Math.max(0, metrics.sla.averageShipmentLatencyHours - 24) / 2,
      },
    ]
      .filter((issue) => issue.value > 0)
      .sort((left, right) => right.value - left.value)
      .slice(0, 4)
      .map((issue) => issue.key);

    return issues.length > 0 ? issues : ['MONITOR_BRANCH'];
  }

  private buildInterventionActionHints(
    metrics: SupplierProcurementMetrics,
    topIssues: string[],
  ): string[] {
    const hints = new Set<string>();

    if (metrics.workQueues.openDiscrepancyCount > 0) {
      hints.add('RESOLVE_OPEN_DISCREPANCIES');
    }
    if (metrics.workQueues.pendingReceiptAcknowledgementCount > 0) {
      hints.add('CLEAR_RECEIPT_ACKNOWLEDGEMENTS');
    }
    if (metrics.workQueues.pendingAcknowledgementCount > 0) {
      hints.add('FOLLOW_UP_PENDING_ACKNOWLEDGEMENTS');
    }
    if (metrics.workQueues.pendingShipmentCount > 0) {
      hints.add('ESCALATE_PENDING_SHIPMENTS');
    }
    if (topIssues.includes('LOW_FILL_RATE')) {
      hints.add('REVIEW_FILL_RATE_SLIPPAGE');
    }
    if (topIssues.includes('SLOW_ACKNOWLEDGEMENT')) {
      hints.add('REVIEW_ACKNOWLEDGEMENT_LATENCY');
    }
    if (topIssues.includes('SLOW_SHIPMENT')) {
      hints.add('REVIEW_SHIPMENT_LATENCY');
    }

    return Array.from(hints).slice(0, 4);
  }

  private mapTrendOrderContributor(
    order: PurchaseOrder,
  ): SupplierProcurementTrendOrderContributorResponseDto {
    const orderedQuantity = order.items.reduce(
      (sum, item) => sum + item.orderedQuantity,
      0,
    );
    const receivedQuantity = order.items.reduce(
      (sum, item) => sum + item.receivedQuantity,
      0,
    );
    const shortageQuantity = order.items.reduce(
      (sum, item) => sum + item.shortageQuantity,
      0,
    );
    const damagedQuantity = order.items.reduce(
      (sum, item) => sum + item.damagedQuantity,
      0,
    );
    const fillRatePercent =
      orderedQuantity > 0
        ? this.toPercent(receivedQuantity / orderedQuantity)
        : 0;
    const acknowledgementHours =
      order.submittedAt && order.acknowledgedAt
        ? this.diffHours(order.submittedAt, order.acknowledgedAt)
        : null;
    const shipmentLatencyHours =
      order.acknowledgedAt && order.shippedAt
        ? this.diffHours(order.acknowledgedAt, order.shippedAt)
        : null;
    const acknowledgementPenalty = Math.max(0, (acknowledgementHours ?? 0) - 4);
    const shipmentPenalty = Math.max(0, (shipmentLatencyHours ?? 0) - 24);
    const issueWeights = [
      { key: 'LOW_FILL_RATE', value: 100 - fillRatePercent },
      { key: 'SHORTAGE', value: shortageQuantity * 5 },
      { key: 'DAMAGE', value: damagedQuantity * 6 },
      { key: 'SLOW_ACKNOWLEDGEMENT', value: acknowledgementPenalty },
      { key: 'SLOW_SHIPMENT', value: shipmentPenalty / 2 },
    ].sort((left, right) => right.value - left.value);

    return {
      purchaseOrderId: order.id,
      branchId: order.branchId,
      branchName: order.branch?.name ?? '',
      branchCode: order.branch?.code ?? null,
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      impactScore: Number(
        issueWeights.reduce((sum, item) => sum + item.value, 0).toFixed(2),
      ),
      fillRatePercent,
      shortageQuantity,
      damagedQuantity,
      acknowledgementHours,
      shipmentLatencyHours,
      dominantIssue: issueWeights[0]?.key ?? 'NORMAL',
    };
  }

  private mapTrendDiscrepancyContributor(
    event: PurchaseOrderReceiptEvent,
    ordersById: Map<number, PurchaseOrder>,
  ): SupplierProcurementTrendDiscrepancyContributorResponseDto {
    const receiptLines = event.receiptLines ?? [];
    const shortageQuantity = receiptLines.reduce(
      (sum, line) => sum + (line.shortageQuantity ?? 0),
      0,
    );
    const damagedQuantity = receiptLines.reduce(
      (sum, line) => sum + (line.damagedQuantity ?? 0),
      0,
    );
    const statusPenalty =
      event.discrepancyStatus === PurchaseOrderReceiptDiscrepancyStatus.OPEN
        ? 20
        : event.discrepancyStatus ===
            PurchaseOrderReceiptDiscrepancyStatus.RESOLVED
          ? 10
          : 0;
    const order = ordersById.get(event.purchaseOrderId);

    return {
      receiptEventId: event.id,
      purchaseOrderId: event.purchaseOrderId,
      branchId: order?.branchId ?? 0,
      branchName: order?.branch?.name ?? '',
      branchCode: order?.branch?.code ?? null,
      orderNumber: order?.orderNumber ?? `PO-${event.purchaseOrderId}`,
      discrepancyStatus: event.discrepancyStatus ?? null,
      createdAt: event.createdAt.toISOString(),
      impactScore: Number(
        (shortageQuantity * 5 + damagedQuantity * 6 + statusPenalty).toFixed(2),
      ),
      shortageQuantity,
      damagedQuantity,
      supplierAcknowledgedAt: event.supplierAcknowledgedAt
        ? event.supplierAcknowledgedAt.toISOString()
        : null,
      note: event.note ?? event.discrepancyResolutionNote ?? null,
    };
  }

  private latencyScore(
    actualHours: number,
    targetHours: number,
    breachHours: number,
  ): number {
    if (actualHours <= 0) {
      return 0;
    }

    if (actualHours <= targetHours) {
      return 100;
    }

    if (actualHours >= breachHours) {
      return 0;
    }

    return Number(
      (
        ((breachHours - actualHours) / (breachHours - targetHours)) *
        100
      ).toFixed(2),
    );
  }

  private clampScore(value: number): number {
    return Math.max(0, Math.min(100, Number(value.toFixed(2))));
  }

  private mapRecentOrder(
    order: PurchaseOrder,
    receiptEvents: PurchaseOrderReceiptEvent[],
  ): SupplierProcurementRecentOrderResponseDto {
    return {
      purchaseOrderId: order.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      branchName: order.branch?.name ?? '',
      branchCode: order.branch?.code ?? null,
      status: order.status,
      total: order.total,
      currency: order.currency,
      expectedDeliveryDate: order.expectedDeliveryDate ?? null,
      submittedAt: order.submittedAt ?? null,
      acknowledgedAt: order.acknowledgedAt ?? null,
      shippedAt: order.shippedAt ?? null,
      receivedAt: order.receivedAt ?? null,
      pendingReceiptAcknowledgementCount: receiptEvents.filter(
        (event) => !event.supplierAcknowledgedAt,
      ).length,
      openDiscrepancyCount: receiptEvents.filter(
        (event) =>
          event.discrepancyStatus ===
          PurchaseOrderReceiptDiscrepancyStatus.OPEN,
      ).length,
      awaitingApprovalDiscrepancyCount: receiptEvents.filter(
        (event) =>
          event.discrepancyStatus ===
          PurchaseOrderReceiptDiscrepancyStatus.RESOLVED,
      ).length,
      acknowledgementHours:
        order.submittedAt && order.acknowledgedAt
          ? this.diffHours(order.submittedAt, order.acknowledgedAt)
          : null,
      shipmentLatencyHours:
        order.acknowledgedAt && order.shippedAt
          ? this.diffHours(order.acknowledgedAt, order.shippedAt)
          : null,
    };
  }

  private buildScorecardAppliedFilters(
    query: SupplierProcurementScorecardQueryDto,
    from: Date,
    to?: Date,
  ): SupplierProcurementScorecardAppliedFiltersResponseDto {
    return {
      includeInactive: Boolean(query.includeInactive),
      onboardingStatus: query.onboardingStatus ?? null,
      supplierProfileIds: query.supplierProfileIds ?? [],
      branchIds: query.branchIds ?? [],
      statuses: query.statuses ?? [],
      from: from.toISOString(),
      to: to ? to.toISOString() : null,
    };
  }

  private buildInterventionAppliedFilters(
    query: SupplierProcurementBranchInterventionQueryDto,
    from: Date,
    to?: Date,
  ): SupplierProcurementBranchInterventionAppliedFiltersResponseDto {
    return {
      ...this.buildScorecardAppliedFilters(query, from, to),
      latestActions: query.latestActions ?? [],
      actionAgeBuckets: query.actionAgeBuckets ?? [],
      sortBy:
        query.sortBy ??
        SupplierProcurementBranchInterventionSortBy.PRIORITY_DESC,
      assigneeUserIds: query.assigneeUserIds ?? [],
      includeUntriaged: query.includeUntriaged !== false,
    };
  }

  private buildTrendAppliedFilters(
    query: SupplierProcurementTrendQueryDto,
    asOf: Date,
  ): SupplierProcurementTrendAppliedFiltersResponseDto {
    return {
      branchIds: query.branchIds ?? [],
      statuses: query.statuses ?? [],
      asOf: asOf.toISOString(),
    };
  }

  private async listRecentInterventionActions(
    supplierProfileId: number,
    branchId: number,
  ) {
    const logs = await this.auditService.listForTarget(
      'SUPPLIER_PROFILE',
      supplierProfileId,
      50,
    );

    return logs
      .filter(
        (log) =>
          log.action.startsWith('procurement_branch_intervention.') &&
          Number(log.meta?.branchId) === branchId,
      )
      .slice(0, 10)
      .map((log) => ({
        id: log.id,
        action: log.action,
        actorId: log.actorId ?? null,
        actorEmail: log.actorEmail ?? null,
        note: log.reason ?? null,
        assigneeUserId:
          typeof log.meta?.assigneeUserId === 'number'
            ? log.meta.assigneeUserId
            : null,
        createdAt: log.createdAt.toISOString(),
      }));
  }

  private async listLatestInterventionActionsByBranch(
    supplierProfileIds: number[],
  ): Promise<
    Map<string, SupplierProcurementBranchInterventionWorkflowSummary>
  > {
    const logs = await this.auditService.listForTargets(
      'SUPPLIER_PROFILE',
      supplierProfileIds,
      {
        actionPrefix: 'procurement_branch_intervention.',
      },
    );
    const latestByBranch = new Map<
      string,
      SupplierProcurementBranchInterventionWorkflowSummary
    >();

    for (const log of logs) {
      const branchId = Number(log.meta?.branchId);
      if (!Number.isInteger(branchId) || branchId <= 0) {
        continue;
      }

      const key = `${log.targetId}:${branchId}`;
      if (latestByBranch.has(key)) {
        continue;
      }

      latestByBranch.set(key, {
        latestAction: this.parseInterventionWorkflowAction(log.action),
        latestActionAt: log.createdAt.toISOString(),
        latestActionActorEmail: log.actorEmail ?? null,
        latestAssigneeUserId: this.extractAuditAssigneeUserId(log.meta),
      });
    }

    return latestByBranch;
  }

  private matchesInterventionWorkflowFilters(
    entry: SupplierProcurementBranchInterventionEntryResponseDto,
    query: SupplierProcurementBranchInterventionQueryDto,
  ): boolean {
    if (query.includeUntriaged === false && entry.latestAction == null) {
      return false;
    }

    if (
      query.latestActions?.length &&
      (entry.latestAction == null ||
        !query.latestActions.includes(entry.latestAction))
    ) {
      return false;
    }

    if (
      query.assigneeUserIds?.length &&
      (entry.latestAssigneeUserId == null ||
        !query.assigneeUserIds.includes(entry.latestAssigneeUserId))
    ) {
      return false;
    }

    if (
      query.actionAgeBuckets?.length &&
      !this.matchesInterventionAgeBuckets(
        entry.latestActionAt,
        query.actionAgeBuckets,
        query.to ?? new Date(),
      )
    ) {
      return false;
    }

    return true;
  }

  private parseInterventionWorkflowAction(
    action: string,
  ): SupplierProcurementBranchInterventionAction | null {
    const rawAction = action.split('.').pop()?.toUpperCase();
    if (
      rawAction &&
      Object.values(SupplierProcurementBranchInterventionAction).includes(
        rawAction as SupplierProcurementBranchInterventionAction,
      )
    ) {
      return rawAction as SupplierProcurementBranchInterventionAction;
    }

    return null;
  }

  private extractAuditAssigneeUserId(
    meta?: Record<string, any> | null,
  ): number | null {
    const assigneeUserId = Number(meta?.assigneeUserId);
    return Number.isInteger(assigneeUserId) && assigneeUserId > 0
      ? assigneeUserId
      : null;
  }

  private compareInterventionActionRecency(
    leftLatestActionAt: string | null,
    rightLatestActionAt: string | null,
  ): number {
    if (!leftLatestActionAt && !rightLatestActionAt) {
      return 0;
    }
    if (!leftLatestActionAt) {
      return -1;
    }
    if (!rightLatestActionAt) {
      return 1;
    }

    const leftTimestamp = new Date(leftLatestActionAt).getTime();
    const rightTimestamp = new Date(rightLatestActionAt).getTime();
    if (Number.isNaN(leftTimestamp) || Number.isNaN(rightTimestamp)) {
      return 0;
    }

    return leftTimestamp - rightTimestamp;
  }

  private compareInterventions(
    left: SupplierProcurementBranchInterventionEntryResponseDto,
    right: SupplierProcurementBranchInterventionEntryResponseDto,
    sortBy: SupplierProcurementBranchInterventionSortBy,
  ): number {
    if (
      sortBy === SupplierProcurementBranchInterventionSortBy.UNTRIAGED_FIRST
    ) {
      const untriagedDifference =
        Number(left.latestActionAt != null) -
        Number(right.latestActionAt != null);
      if (untriagedDifference !== 0) {
        return untriagedDifference;
      }
    }

    if (sortBy === SupplierProcurementBranchInterventionSortBy.STALE_FIRST) {
      const actionRecencyComparison = this.compareInterventionActionRecency(
        left.latestActionAt,
        right.latestActionAt,
      );
      if (actionRecencyComparison !== 0) {
        return actionRecencyComparison;
      }
    }

    if (right.interventionPriorityScore !== left.interventionPriorityScore) {
      return right.interventionPriorityScore - left.interventionPriorityScore;
    }

    const actionRecencyComparison = this.compareInterventionActionRecency(
      left.latestActionAt,
      right.latestActionAt,
    );
    if (actionRecencyComparison !== 0) {
      return actionRecencyComparison;
    }

    if (right.openDiscrepancyCount !== left.openDiscrepancyCount) {
      return right.openDiscrepancyCount - left.openDiscrepancyCount;
    }

    return left.companyName.localeCompare(right.companyName);
  }

  private matchesInterventionAgeBuckets(
    latestActionAt: string | null,
    buckets: SupplierProcurementBranchInterventionAgeBucket[],
    referenceTime: Date,
  ): boolean {
    return buckets.some((bucket) =>
      this.matchesInterventionAgeBucket(latestActionAt, bucket, referenceTime),
    );
  }

  private matchesInterventionAgeBucket(
    latestActionAt: string | null,
    bucket: SupplierProcurementBranchInterventionAgeBucket,
    referenceTime: Date,
  ): boolean {
    if (bucket === SupplierProcurementBranchInterventionAgeBucket.UNTRIAGED) {
      return latestActionAt == null;
    }

    if (latestActionAt == null) {
      return false;
    }

    const actionTimestamp = new Date(latestActionAt).getTime();
    const referenceTimestamp = referenceTime.getTime();
    if (Number.isNaN(actionTimestamp) || Number.isNaN(referenceTimestamp)) {
      return false;
    }

    const ageHours = (referenceTimestamp - actionTimestamp) / (60 * 60 * 1000);
    if (bucket === SupplierProcurementBranchInterventionAgeBucket.OVER_72H) {
      return ageHours >= 72;
    }

    if (bucket === SupplierProcurementBranchInterventionAgeBucket.OVER_24H) {
      return ageHours >= 24;
    }

    return false;
  }

  private buildInterventionSummary(
    entries: SupplierProcurementBranchInterventionEntryResponseDto[],
    referenceTime: Date,
  ): SupplierProcurementBranchInterventionSummaryResponseDto {
    const alertCounts = {
      normal: entries.filter(
        (entry) =>
          entry.alertLevel === SupplierProcurementOverviewAlertLevel.NORMAL,
      ).length,
      warning: entries.filter(
        (entry) =>
          entry.alertLevel === SupplierProcurementOverviewAlertLevel.WARNING,
      ).length,
      critical: entries.filter(
        (entry) =>
          entry.alertLevel === SupplierProcurementOverviewAlertLevel.CRITICAL,
      ).length,
    };

    return {
      totalInterventions: entries.length,
      assignedCount: entries.filter(
        (entry) => entry.latestAssigneeUserId != null,
      ).length,
      untriagedCount: entries.filter((entry) => entry.latestActionAt == null)
        .length,
      over24hCount: entries.filter((entry) =>
        this.matchesInterventionAgeBucket(
          entry.latestActionAt,
          SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
          referenceTime,
        ),
      ).length,
      over72hCount: entries.filter((entry) =>
        this.matchesInterventionAgeBucket(
          entry.latestActionAt,
          SupplierProcurementBranchInterventionAgeBucket.OVER_72H,
          referenceTime,
        ),
      ).length,
      alertCounts,
      alertMix: this.buildInterventionAlertMix(alertCounts, entries.length),
      issueMix: this.buildInterventionIssueMix(entries),
      actionHintMix: this.buildInterventionActionHintMix(entries),
    };
  }

  private buildInterventionIssueMix(
    entries: SupplierProcurementBranchInterventionEntryResponseDto[],
  ): SupplierProcurementBranchInterventionIssueMixEntryResponseDto[] {
    const issueCounts = new Map<string, number>();
    for (const entry of entries) {
      for (const issue of entry.topIssues) {
        issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
      }
    }

    return this.buildInterventionIssueMixFromCounts(
      issueCounts,
      entries.length,
    );
  }

  private buildInterventionActionHintMix(
    entries: SupplierProcurementBranchInterventionEntryResponseDto[],
  ): SupplierProcurementBranchInterventionActionHintMixEntryResponseDto[] {
    const hintCounts = new Map<string, number>();
    for (const entry of entries) {
      for (const actionHint of entry.actionHints) {
        hintCounts.set(actionHint, (hintCounts.get(actionHint) ?? 0) + 1);
      }
    }

    return this.buildInterventionActionHintMixFromCounts(
      hintCounts,
      entries.length,
    );
  }

  private buildInterventionIssueMixFromCounts(
    issueCounts: Map<string, number>,
    totalCount: number,
  ): SupplierProcurementBranchInterventionIssueMixEntryResponseDto[] {
    if (totalCount <= 0 || issueCounts.size === 0) {
      return [];
    }

    return Array.from(issueCounts.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }

        return left[0].localeCompare(right[0]);
      })
      .slice(0, 5)
      .map(([issue, count]) => ({
        issue,
        count,
        percent: this.toPercent(count / totalCount),
      }));
  }

  private buildInterventionActionHintMixFromCounts(
    hintCounts: Map<string, number>,
    totalCount: number,
  ): SupplierProcurementBranchInterventionActionHintMixEntryResponseDto[] {
    if (totalCount <= 0 || hintCounts.size === 0) {
      return [];
    }

    return Array.from(hintCounts.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }

        return left[0].localeCompare(right[0]);
      })
      .slice(0, 5)
      .map(([actionHint, count]) => ({
        actionHint,
        count,
        percent: this.toPercent(count / totalCount),
      }));
  }

  private buildEmptyInterventionAlertCounts(): SupplierProcurementBranchInterventionAlertCountsResponseDto {
    return {
      normal: 0,
      warning: 0,
      critical: 0,
    };
  }

  private incrementInterventionAlertCounts(
    alertCounts: SupplierProcurementBranchInterventionAlertCountsResponseDto,
    alertLevel: SupplierProcurementOverviewAlertLevel,
  ): void {
    if (alertLevel === SupplierProcurementOverviewAlertLevel.CRITICAL) {
      alertCounts.critical += 1;
      return;
    }

    if (alertLevel === SupplierProcurementOverviewAlertLevel.WARNING) {
      alertCounts.warning += 1;
      return;
    }

    alertCounts.normal += 1;
  }

  private buildInterventionAlertMix(
    alertCounts: SupplierProcurementBranchInterventionAlertCountsResponseDto,
    totalCount: number,
  ): SupplierProcurementBranchInterventionAlertMixResponseDto {
    if (totalCount <= 0) {
      return {
        normalPercent: 0,
        warningPercent: 0,
        criticalPercent: 0,
      };
    }

    return {
      normalPercent: this.toPercent(alertCounts.normal / totalCount),
      warningPercent: this.toPercent(alertCounts.warning / totalCount),
      criticalPercent: this.toPercent(alertCounts.critical / totalCount),
    };
  }

  private buildInterventionAlertMixDelta(
    current: SupplierProcurementBranchInterventionAlertMixResponseDto,
    previous:
      | SupplierProcurementBranchInterventionAlertMixResponseDto
      | null
      | undefined,
  ): SupplierProcurementBranchInterventionAlertMixDeltaResponseDto {
    return {
      normalPercentDelta: Number(
        (current.normalPercent - (previous?.normalPercent ?? 0)).toFixed(2),
      ),
      warningPercentDelta: Number(
        (current.warningPercent - (previous?.warningPercent ?? 0)).toFixed(2),
      ),
      criticalPercentDelta: Number(
        (current.criticalPercent - (previous?.criticalPercent ?? 0)).toFixed(2),
      ),
    };
  }

  private formatInterventionIssueMix(
    issueMix: SupplierProcurementBranchInterventionIssueMixEntryResponseDto[],
  ): string {
    return issueMix
      .map((entry) => `${entry.issue}:${entry.count}:${entry.percent}`)
      .join('|');
  }

  private formatInterventionActionHintMix(
    actionHintMix: SupplierProcurementBranchInterventionActionHintMixEntryResponseDto[],
  ): string {
    return actionHintMix
      .map((entry) => `${entry.actionHint}:${entry.count}:${entry.percent}`)
      .join('|');
  }

  private buildInterventionIssueMixDelta(
    current: SupplierProcurementBranchInterventionIssueMixEntryResponseDto[],
    previous:
      | SupplierProcurementBranchInterventionIssueMixEntryResponseDto[]
      | null
      | undefined,
  ): SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto[] {
    const previousByIssue = new Map(
      (previous ?? []).map((entry) => [entry.issue, entry]),
    );
    const currentByIssue = new Map(
      current.map((entry) => [entry.issue, entry]),
    );
    const issues = Array.from(
      new Set([...currentByIssue.keys(), ...previousByIssue.keys()]),
    );

    return issues
      .map((issue) => {
        const currentEntry = currentByIssue.get(issue);
        const previousEntry = previousByIssue.get(issue);

        return {
          issue,
          currentCount: currentEntry?.count ?? 0,
          previousCount: previousEntry?.count ?? 0,
          countDelta: (currentEntry?.count ?? 0) - (previousEntry?.count ?? 0),
          currentPercent: currentEntry?.percent ?? 0,
          previousPercent: previousEntry?.percent ?? 0,
          percentDelta: Number(
            (
              (currentEntry?.percent ?? 0) - (previousEntry?.percent ?? 0)
            ).toFixed(2),
          ),
        } satisfies SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto;
      })
      .sort((left, right) => {
        const leftMagnitude = Math.abs(left.countDelta);
        const rightMagnitude = Math.abs(right.countDelta);
        if (rightMagnitude !== leftMagnitude) {
          return rightMagnitude - leftMagnitude;
        }

        const leftPercentMagnitude = Math.abs(left.percentDelta);
        const rightPercentMagnitude = Math.abs(right.percentDelta);
        if (rightPercentMagnitude !== leftPercentMagnitude) {
          return rightPercentMagnitude - leftPercentMagnitude;
        }

        return left.issue.localeCompare(right.issue);
      })
      .slice(0, 5);
  }

  private buildInterventionActionHintMixDelta(
    current: SupplierProcurementBranchInterventionActionHintMixEntryResponseDto[],
    previous:
      | SupplierProcurementBranchInterventionActionHintMixEntryResponseDto[]
      | null
      | undefined,
  ): SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto[] {
    const previousByHint = new Map(
      (previous ?? []).map((entry) => [entry.actionHint, entry]),
    );
    const currentByHint = new Map(
      current.map((entry) => [entry.actionHint, entry]),
    );
    const actionHints = Array.from(
      new Set([...currentByHint.keys(), ...previousByHint.keys()]),
    );

    return actionHints
      .map((actionHint) => {
        const currentEntry = currentByHint.get(actionHint);
        const previousEntry = previousByHint.get(actionHint);

        return {
          actionHint,
          currentCount: currentEntry?.count ?? 0,
          previousCount: previousEntry?.count ?? 0,
          countDelta: (currentEntry?.count ?? 0) - (previousEntry?.count ?? 0),
          currentPercent: currentEntry?.percent ?? 0,
          previousPercent: previousEntry?.percent ?? 0,
          percentDelta: Number(
            (
              (currentEntry?.percent ?? 0) - (previousEntry?.percent ?? 0)
            ).toFixed(2),
          ),
        } satisfies SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto;
      })
      .sort((left, right) => {
        const leftMagnitude = Math.abs(left.countDelta);
        const rightMagnitude = Math.abs(right.countDelta);
        if (rightMagnitude !== leftMagnitude) {
          return rightMagnitude - leftMagnitude;
        }

        const leftPercentMagnitude = Math.abs(left.percentDelta);
        const rightPercentMagnitude = Math.abs(right.percentDelta);
        if (rightPercentMagnitude !== leftPercentMagnitude) {
          return rightPercentMagnitude - leftPercentMagnitude;
        }

        return left.actionHint.localeCompare(right.actionHint);
      })
      .slice(0, 5);
  }

  private formatInterventionIssueMixDelta(
    issueMixDelta: SupplierProcurementBranchInterventionIssueMixDeltaEntryResponseDto[],
  ): string {
    return issueMixDelta
      .map(
        (entry) =>
          `${entry.issue}:${entry.currentCount}:${entry.previousCount}:${entry.countDelta}:${entry.currentPercent}:${entry.previousPercent}:${entry.percentDelta}`,
      )
      .join('|');
  }

  private formatInterventionActionHintMixDelta(
    actionHintMixDelta: SupplierProcurementBranchInterventionActionHintMixDeltaEntryResponseDto[],
  ): string {
    return actionHintMixDelta
      .map(
        (entry) =>
          `${entry.actionHint}:${entry.currentCount}:${entry.previousCount}:${entry.countDelta}:${entry.currentPercent}:${entry.previousPercent}:${entry.percentDelta}`,
      )
      .join('|');
  }

  private buildInterventionAlertCountsDelta(
    current: SupplierProcurementBranchInterventionAlertCountsResponseDto,
    previous:
      | SupplierProcurementBranchInterventionAlertCountsResponseDto
      | null
      | undefined,
  ): SupplierProcurementBranchInterventionAlertCountsDeltaResponseDto {
    return {
      normalDelta: current.normal - (previous?.normal ?? 0),
      warningDelta: current.warning - (previous?.warning ?? 0),
      criticalDelta: current.critical - (previous?.critical ?? 0),
    };
  }

  private buildInterventionSummaryDelta(
    current: SupplierProcurementBranchInterventionSummaryResponseDto,
    previous: SupplierProcurementBranchInterventionSummaryResponseDto,
  ): SupplierProcurementBranchInterventionSummaryDeltaResponseDto {
    return {
      totalInterventionsDelta:
        current.totalInterventions - previous.totalInterventions,
      assignedCountDelta: current.assignedCount - previous.assignedCount,
      untriagedCountDelta: current.untriagedCount - previous.untriagedCount,
      over24hCountDelta: current.over24hCount - previous.over24hCount,
      over72hCountDelta: current.over72hCount - previous.over72hCount,
      alertMixDelta: this.buildInterventionAlertMixDelta(
        current.alertMix,
        previous.alertMix,
      ),
      alertCountsDelta: this.buildInterventionAlertCountsDelta(
        current.alertCounts,
        previous.alertCounts,
      ),
      issueMixDelta: this.buildInterventionIssueMixDelta(
        current.issueMix,
        previous.issueMix,
      ),
      actionHintMixDelta: this.buildInterventionActionHintMixDelta(
        current.actionHintMix,
        previous.actionHintMix,
      ),
    };
  }

  private buildSupplierHotspotDelta(
    current: SupplierProcurementBranchInterventionSupplierRollupResponseDto | null,
    previous: SupplierProcurementBranchInterventionSupplierRollupResponseDto | null,
  ): SupplierProcurementBranchInterventionSupplierHotspotDeltaResponseDto | null {
    if (!current) {
      return null;
    }

    return {
      branchCountDelta: current.branchCount - (previous?.branchCount ?? 0),
      assignedCountDelta:
        current.assignedCount - (previous?.assignedCount ?? 0),
      untriagedCountDelta:
        current.untriagedCount - (previous?.untriagedCount ?? 0),
      over24hCountDelta: current.over24hCount - (previous?.over24hCount ?? 0),
      over72hCountDelta: current.over72hCount - (previous?.over72hCount ?? 0),
      highestPriorityScoreDelta: Number(
        (
          current.highestPriorityScore - (previous?.highestPriorityScore ?? 0)
        ).toFixed(2),
      ),
      alertMixDelta: this.buildInterventionAlertMixDelta(
        current.alertMix,
        previous?.alertMix,
      ),
      alertCountsDelta: this.buildInterventionAlertCountsDelta(
        current.alertCounts,
        previous?.alertCounts,
      ),
      issueMixDelta: this.buildInterventionIssueMixDelta(
        current.issueMix,
        previous?.issueMix,
      ),
      actionHintMixDelta: this.buildInterventionActionHintMixDelta(
        current.actionHintMix,
        previous?.actionHintMix,
      ),
    };
  }

  private buildBranchHotspotDelta(
    current: SupplierProcurementBranchInterventionBranchRollupResponseDto | null,
    previous: SupplierProcurementBranchInterventionBranchRollupResponseDto | null,
  ): SupplierProcurementBranchInterventionBranchHotspotDeltaResponseDto | null {
    if (!current) {
      return null;
    }

    return {
      supplierCountDelta:
        current.supplierCount - (previous?.supplierCount ?? 0),
      interventionCountDelta:
        current.interventionCount - (previous?.interventionCount ?? 0),
      assignedCountDelta:
        current.assignedCount - (previous?.assignedCount ?? 0),
      untriagedCountDelta:
        current.untriagedCount - (previous?.untriagedCount ?? 0),
      over24hCountDelta: current.over24hCount - (previous?.over24hCount ?? 0),
      over72hCountDelta: current.over72hCount - (previous?.over72hCount ?? 0),
      highestPriorityScoreDelta: Number(
        (
          current.highestPriorityScore - (previous?.highestPriorityScore ?? 0)
        ).toFixed(2),
      ),
      alertMixDelta: this.buildInterventionAlertMixDelta(
        current.alertMix,
        previous?.alertMix,
      ),
      alertCountsDelta: this.buildInterventionAlertCountsDelta(
        current.alertCounts,
        previous?.alertCounts,
      ),
      issueMixDelta: this.buildInterventionIssueMixDelta(
        current.issueMix,
        previous?.issueMix,
      ),
      actionHintMixDelta: this.buildInterventionActionHintMixDelta(
        current.actionHintMix,
        previous?.actionHintMix,
      ),
    };
  }

  private buildInterventionOverviewAlertStatuses(
    summary: SupplierProcurementBranchInterventionSummaryResponseDto,
    supplierHotspot: SupplierProcurementBranchInterventionSupplierRollupResponseDto | null,
    branchHotspot: SupplierProcurementBranchInterventionBranchRollupResponseDto | null,
  ): SupplierProcurementBranchInterventionOverviewAlertStatusesResponseDto {
    return {
      summary: this.getInterventionSummaryAlertLevel(summary),
      topSupplierHotspot: supplierHotspot
        ? this.getInterventionSupplierHotspotAlertLevel(supplierHotspot)
        : null,
      topBranchHotspot: branchHotspot
        ? this.getInterventionBranchHotspotAlertLevel(branchHotspot)
        : null,
    };
  }

  private buildInterventionOverviewSeverityTrends(
    summaryAlertLevel: SupplierProcurementOverviewAlertLevel,
    previousSummaryAlertLevel: SupplierProcurementOverviewAlertLevel,
    summaryDelta: SupplierProcurementBranchInterventionSummaryDeltaResponseDto,
    supplierAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    previousSupplierAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    supplierDelta: SupplierProcurementBranchInterventionSupplierHotspotDeltaResponseDto | null,
    branchAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    previousBranchAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    branchDelta: SupplierProcurementBranchInterventionBranchHotspotDeltaResponseDto | null,
  ): SupplierProcurementBranchInterventionOverviewSeverityTrendsResponseDto {
    return {
      summary: this.getInterventionSeverityTrend(
        summaryAlertLevel,
        previousSummaryAlertLevel,
        summaryDelta.alertCountsDelta.warningDelta +
          summaryDelta.alertCountsDelta.criticalDelta * 2,
        summaryDelta.alertMixDelta.warningPercentDelta +
          summaryDelta.alertMixDelta.criticalPercentDelta * 2,
      ),
      topSupplierHotspot:
        supplierAlertLevel == null && previousSupplierAlertLevel == null
          ? null
          : this.getInterventionSeverityTrend(
              supplierAlertLevel,
              previousSupplierAlertLevel,
              supplierDelta
                ? supplierDelta.alertCountsDelta.warningDelta +
                    supplierDelta.alertCountsDelta.criticalDelta * 2
                : 0,
              supplierDelta
                ? supplierDelta.alertMixDelta.warningPercentDelta +
                    supplierDelta.alertMixDelta.criticalPercentDelta * 2
                : 0,
            ),
      topBranchHotspot:
        branchAlertLevel == null && previousBranchAlertLevel == null
          ? null
          : this.getInterventionSeverityTrend(
              branchAlertLevel,
              previousBranchAlertLevel,
              branchDelta
                ? branchDelta.alertCountsDelta.warningDelta +
                    branchDelta.alertCountsDelta.criticalDelta * 2
                : 0,
              branchDelta
                ? branchDelta.alertMixDelta.warningPercentDelta +
                    branchDelta.alertMixDelta.criticalPercentDelta * 2
                : 0,
            ),
    };
  }

  private buildInterventionOverviewAlertStatusTransitions(
    summaryAlertLevel: SupplierProcurementOverviewAlertLevel,
    previousSummaryAlertLevel: SupplierProcurementOverviewAlertLevel,
    supplierAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    previousSupplierAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    branchAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    previousBranchAlertLevel: SupplierProcurementOverviewAlertLevel | null,
  ): SupplierProcurementBranchInterventionOverviewAlertStatusTransitionsResponseDto {
    return {
      summary: this.buildInterventionAlertStatusTransitionEntry(
        previousSummaryAlertLevel,
        summaryAlertLevel,
      ),
      topSupplierHotspot: this.buildInterventionAlertStatusTransitionEntry(
        previousSupplierAlertLevel,
        supplierAlertLevel,
      ),
      topBranchHotspot: this.buildInterventionAlertStatusTransitionEntry(
        previousBranchAlertLevel,
        branchAlertLevel,
      ),
    };
  }

  private buildInterventionAlertStatusTransitionEntry(
    previousAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    currentAlertLevel: SupplierProcurementOverviewAlertLevel | null,
  ): SupplierProcurementBranchInterventionOverviewAlertStatusTransitionEntryResponseDto {
    return {
      previousAlertLevel,
      currentAlertLevel,
      transition: this.getInterventionAlertStatusTransition(
        previousAlertLevel,
        currentAlertLevel,
      ),
      changed: previousAlertLevel !== currentAlertLevel,
    };
  }

  private getInterventionAlertStatusTransition(
    previousAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    currentAlertLevel: SupplierProcurementOverviewAlertLevel | null,
  ): SupplierProcurementOverviewAlertStatusTransition {
    if (previousAlertLevel == null && currentAlertLevel != null) {
      return SupplierProcurementOverviewAlertStatusTransition.APPEARED;
    }

    if (previousAlertLevel != null && currentAlertLevel == null) {
      return SupplierProcurementOverviewAlertStatusTransition.CLEARED;
    }

    const previousRank = this.getInterventionAlertLevelRank(previousAlertLevel);
    const currentRank = this.getInterventionAlertLevelRank(currentAlertLevel);

    if (currentRank > previousRank) {
      return SupplierProcurementOverviewAlertStatusTransition.ESCALATED;
    }

    if (currentRank < previousRank) {
      return SupplierProcurementOverviewAlertStatusTransition.IMPROVED;
    }

    return SupplierProcurementOverviewAlertStatusTransition.UNCHANGED;
  }

  private getInterventionSeverityTrend(
    currentAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    previousAlertLevel: SupplierProcurementOverviewAlertLevel | null,
    weightedAlertCountDelta: number,
    weightedAlertMixDelta: number,
  ): SupplierProcurementOverviewSeverityTrend {
    const currentRank = this.getInterventionAlertLevelRank(currentAlertLevel);
    const previousRank = this.getInterventionAlertLevelRank(previousAlertLevel);

    if (currentRank > previousRank) {
      return SupplierProcurementOverviewSeverityTrend.ESCALATING;
    }

    if (currentRank < previousRank) {
      return SupplierProcurementOverviewSeverityTrend.IMPROVING;
    }

    if (weightedAlertCountDelta > 0 || weightedAlertMixDelta > 0) {
      return SupplierProcurementOverviewSeverityTrend.ESCALATING;
    }

    if (weightedAlertCountDelta < 0 || weightedAlertMixDelta < 0) {
      return SupplierProcurementOverviewSeverityTrend.IMPROVING;
    }

    return SupplierProcurementOverviewSeverityTrend.STABLE;
  }

  private getInterventionAlertLevelRank(
    alertLevel: SupplierProcurementOverviewAlertLevel | null,
  ): number {
    if (alertLevel === SupplierProcurementOverviewAlertLevel.CRITICAL) {
      return 2;
    }

    if (alertLevel === SupplierProcurementOverviewAlertLevel.WARNING) {
      return 1;
    }

    return 0;
  }

  private getInterventionSummaryAlertLevel(
    summary: SupplierProcurementBranchInterventionSummaryResponseDto,
  ): SupplierProcurementOverviewAlertLevel {
    if (
      summary.over72hCount >= 3 ||
      summary.totalInterventions >= 8 ||
      summary.untriagedCount >= 4
    ) {
      return SupplierProcurementOverviewAlertLevel.CRITICAL;
    }

    if (
      summary.over72hCount >= 1 ||
      summary.totalInterventions >= 4 ||
      summary.untriagedCount >= 2
    ) {
      return SupplierProcurementOverviewAlertLevel.WARNING;
    }

    return SupplierProcurementOverviewAlertLevel.NORMAL;
  }

  private getInterventionSupplierHotspotAlertLevel(
    hotspot: SupplierProcurementBranchInterventionSupplierRollupResponseDto,
  ): SupplierProcurementOverviewAlertLevel {
    if (
      hotspot.over72hCount >= 2 ||
      hotspot.branchCount >= 4 ||
      hotspot.highestPriorityScore >= 70
    ) {
      return SupplierProcurementOverviewAlertLevel.CRITICAL;
    }

    if (
      hotspot.over72hCount >= 1 ||
      hotspot.branchCount >= 2 ||
      hotspot.highestPriorityScore >= 40
    ) {
      return SupplierProcurementOverviewAlertLevel.WARNING;
    }

    return SupplierProcurementOverviewAlertLevel.NORMAL;
  }

  private getInterventionBranchHotspotAlertLevel(
    hotspot: SupplierProcurementBranchInterventionBranchRollupResponseDto,
  ): SupplierProcurementOverviewAlertLevel {
    if (
      hotspot.over72hCount >= 2 ||
      hotspot.interventionCount >= 4 ||
      hotspot.highestPriorityScore >= 70
    ) {
      return SupplierProcurementOverviewAlertLevel.CRITICAL;
    }

    if (
      hotspot.over72hCount >= 1 ||
      hotspot.interventionCount >= 2 ||
      hotspot.highestPriorityScore >= 40
    ) {
      return SupplierProcurementOverviewAlertLevel.WARNING;
    }

    return SupplierProcurementOverviewAlertLevel.NORMAL;
  }

  private getInterventionEntryAlertLevel(
    interventionPriorityScore: number,
    latestActionAt: string | null,
    latestAssigneeUserId: number | null,
  ): SupplierProcurementOverviewAlertLevel {
    const isOver72h = this.matchesInterventionAgeBucket(
      latestActionAt,
      SupplierProcurementBranchInterventionAgeBucket.OVER_72H,
      new Date(),
    );
    const isUntriaged = latestActionAt == null || latestAssigneeUserId == null;

    if (interventionPriorityScore >= 70 || isOver72h) {
      return SupplierProcurementOverviewAlertLevel.CRITICAL;
    }

    if (interventionPriorityScore >= 40 || isUntriaged) {
      return SupplierProcurementOverviewAlertLevel.WARNING;
    }

    return SupplierProcurementOverviewAlertLevel.NORMAL;
  }

  private buildPreviousInterventionOverviewWindow(
    currentFromIso: string,
    currentToIso: string,
  ): SupplierProcurementBranchInterventionOverviewComparisonWindowResponseDto {
    const currentFrom = new Date(currentFromIso);
    const currentTo = new Date(currentToIso);
    const windowDurationMs = Math.max(
      currentTo.getTime() - currentFrom.getTime(),
      0,
    );
    const previousTo = new Date(currentFrom.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - windowDurationMs);

    return {
      previousFrom: previousFrom.toISOString(),
      previousTo: previousTo.toISOString(),
    };
  }

  private buildInterventionSupplierRollups(
    entries: SupplierProcurementBranchInterventionEntryResponseDto[],
    referenceTime: Date,
  ): SupplierProcurementBranchInterventionSupplierRollupResponseDto[] {
    const rollups = new Map<
      number,
      SupplierProcurementBranchInterventionSupplierRollupResponseDto & {
        issueCounts: Map<string, number>;
        actionHintCounts: Map<string, number>;
      }
    >();

    for (const entry of entries) {
      const existing = rollups.get(entry.supplierProfileId);
      const over24h = this.matchesInterventionAgeBucket(
        entry.latestActionAt,
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
        referenceTime,
      );
      const over72h = this.matchesInterventionAgeBucket(
        entry.latestActionAt,
        SupplierProcurementBranchInterventionAgeBucket.OVER_72H,
        referenceTime,
      );

      if (existing) {
        existing.branchCount += 1;
        existing.assignedCount += entry.latestAssigneeUserId != null ? 1 : 0;
        existing.untriagedCount += entry.latestActionAt == null ? 1 : 0;
        existing.over24hCount += over24h ? 1 : 0;
        existing.over72hCount += over72h ? 1 : 0;
        existing.highestPriorityScore = Math.max(
          existing.highestPriorityScore,
          entry.interventionPriorityScore,
        );
        this.incrementInterventionAlertCounts(
          existing.alertCounts,
          entry.alertLevel,
        );
        for (const issue of entry.topIssues) {
          existing.issueCounts.set(
            issue,
            (existing.issueCounts.get(issue) ?? 0) + 1,
          );
        }
        for (const actionHint of entry.actionHints) {
          existing.actionHintCounts.set(
            actionHint,
            (existing.actionHintCounts.get(actionHint) ?? 0) + 1,
          );
        }
        continue;
      }

      const rollup = {
        supplierProfileId: entry.supplierProfileId,
        companyName: entry.companyName,
        branchCount: 1,
        assignedCount: entry.latestAssigneeUserId != null ? 1 : 0,
        untriagedCount: entry.latestActionAt == null ? 1 : 0,
        over24hCount: over24h ? 1 : 0,
        over72hCount: over72h ? 1 : 0,
        highestPriorityScore: entry.interventionPriorityScore,
        alertCounts: this.buildEmptyInterventionAlertCounts(),
        alertMix: this.buildInterventionAlertMix(
          this.buildEmptyInterventionAlertCounts(),
          0,
        ),
        issueMix: [],
        actionHintMix: [],
        alertLevel: SupplierProcurementOverviewAlertLevel.NORMAL,
        issueCounts: new Map<string, number>(),
        actionHintCounts: new Map<string, number>(),
      };

      this.incrementInterventionAlertCounts(
        rollup.alertCounts,
        entry.alertLevel,
      );
      for (const issue of entry.topIssues) {
        rollup.issueCounts.set(issue, (rollup.issueCounts.get(issue) ?? 0) + 1);
      }
      for (const actionHint of entry.actionHints) {
        rollup.actionHintCounts.set(
          actionHint,
          (rollup.actionHintCounts.get(actionHint) ?? 0) + 1,
        );
      }
      rollups.set(entry.supplierProfileId, rollup);
    }

    return Array.from(rollups.values())
      .map((rollup) => ({
        supplierProfileId: rollup.supplierProfileId,
        companyName: rollup.companyName,
        branchCount: rollup.branchCount,
        assignedCount: rollup.assignedCount,
        untriagedCount: rollup.untriagedCount,
        over24hCount: rollup.over24hCount,
        over72hCount: rollup.over72hCount,
        highestPriorityScore: rollup.highestPriorityScore,
        alertCounts: rollup.alertCounts,
        alertMix: this.buildInterventionAlertMix(
          rollup.alertCounts,
          rollup.branchCount,
        ),
        issueMix: this.buildInterventionIssueMixFromCounts(
          rollup.issueCounts,
          rollup.branchCount,
        ),
        actionHintMix: this.buildInterventionActionHintMixFromCounts(
          rollup.actionHintCounts,
          rollup.branchCount,
        ),
        alertLevel: rollup.alertLevel,
      }))
      .sort((left, right) => {
        if (right.over72hCount !== left.over72hCount) {
          return right.over72hCount - left.over72hCount;
        }
        if (right.over24hCount !== left.over24hCount) {
          return right.over24hCount - left.over24hCount;
        }
        if (right.untriagedCount !== left.untriagedCount) {
          return right.untriagedCount - left.untriagedCount;
        }
        if (right.highestPriorityScore !== left.highestPriorityScore) {
          return right.highestPriorityScore - left.highestPriorityScore;
        }
        return left.companyName.localeCompare(right.companyName);
      });
  }

  private buildInterventionBranchRollups(
    entries: SupplierProcurementBranchInterventionEntryResponseDto[],
    referenceTime: Date,
  ): SupplierProcurementBranchInterventionBranchRollupResponseDto[] {
    const rollups = new Map<
      number,
      SupplierProcurementBranchInterventionBranchRollupResponseDto & {
        supplierIds: Set<number>;
        issueCounts: Map<string, number>;
        actionHintCounts: Map<string, number>;
      }
    >();

    for (const entry of entries) {
      const over24h = this.matchesInterventionAgeBucket(
        entry.latestActionAt,
        SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
        referenceTime,
      );
      const over72h = this.matchesInterventionAgeBucket(
        entry.latestActionAt,
        SupplierProcurementBranchInterventionAgeBucket.OVER_72H,
        referenceTime,
      );
      const existing = rollups.get(entry.branchId);

      if (existing) {
        existing.supplierIds.add(entry.supplierProfileId);
        existing.supplierCount = existing.supplierIds.size;
        existing.interventionCount += 1;
        existing.assignedCount += entry.latestAssigneeUserId != null ? 1 : 0;
        existing.untriagedCount += entry.latestActionAt == null ? 1 : 0;
        existing.over24hCount += over24h ? 1 : 0;
        existing.over72hCount += over72h ? 1 : 0;
        existing.highestPriorityScore = Math.max(
          existing.highestPriorityScore,
          entry.interventionPriorityScore,
        );
        this.incrementInterventionAlertCounts(
          existing.alertCounts,
          entry.alertLevel,
        );
        for (const issue of entry.topIssues) {
          existing.issueCounts.set(
            issue,
            (existing.issueCounts.get(issue) ?? 0) + 1,
          );
        }
        for (const actionHint of entry.actionHints) {
          existing.actionHintCounts.set(
            actionHint,
            (existing.actionHintCounts.get(actionHint) ?? 0) + 1,
          );
        }
        continue;
      }

      const rollup = {
        branchId: entry.branchId,
        branchName: entry.branchName,
        branchCode: entry.branchCode,
        supplierIds: new Set([entry.supplierProfileId]),
        supplierCount: 1,
        interventionCount: 1,
        assignedCount: entry.latestAssigneeUserId != null ? 1 : 0,
        untriagedCount: entry.latestActionAt == null ? 1 : 0,
        over24hCount: over24h ? 1 : 0,
        over72hCount: over72h ? 1 : 0,
        highestPriorityScore: entry.interventionPriorityScore,
        alertCounts: this.buildEmptyInterventionAlertCounts(),
        alertMix: this.buildInterventionAlertMix(
          this.buildEmptyInterventionAlertCounts(),
          0,
        ),
        issueMix: [],
        actionHintMix: [],
        alertLevel: SupplierProcurementOverviewAlertLevel.NORMAL,
        issueCounts: new Map<string, number>(),
        actionHintCounts: new Map<string, number>(),
      };

      this.incrementInterventionAlertCounts(
        rollup.alertCounts,
        entry.alertLevel,
      );
      for (const issue of entry.topIssues) {
        rollup.issueCounts.set(issue, (rollup.issueCounts.get(issue) ?? 0) + 1);
      }
      for (const actionHint of entry.actionHints) {
        rollup.actionHintCounts.set(
          actionHint,
          (rollup.actionHintCounts.get(actionHint) ?? 0) + 1,
        );
      }
      rollups.set(entry.branchId, rollup);
    }

    return Array.from(rollups.values())
      .map((rollup) => ({
        branchId: rollup.branchId,
        branchName: rollup.branchName,
        branchCode: rollup.branchCode,
        supplierCount: rollup.supplierCount,
        interventionCount: rollup.interventionCount,
        assignedCount: rollup.assignedCount,
        untriagedCount: rollup.untriagedCount,
        over24hCount: rollup.over24hCount,
        over72hCount: rollup.over72hCount,
        highestPriorityScore: rollup.highestPriorityScore,
        alertCounts: rollup.alertCounts,
        alertMix: this.buildInterventionAlertMix(
          rollup.alertCounts,
          rollup.interventionCount,
        ),
        issueMix: this.buildInterventionIssueMixFromCounts(
          rollup.issueCounts,
          rollup.interventionCount,
        ),
        actionHintMix: this.buildInterventionActionHintMixFromCounts(
          rollup.actionHintCounts,
          rollup.interventionCount,
        ),
        alertLevel: rollup.alertLevel,
      }))
      .sort((left, right) => {
        if (right.over72hCount !== left.over72hCount) {
          return right.over72hCount - left.over72hCount;
        }
        if (right.over24hCount !== left.over24hCount) {
          return right.over24hCount - left.over24hCount;
        }
        if (right.untriagedCount !== left.untriagedCount) {
          return right.untriagedCount - left.untriagedCount;
        }
        if (right.highestPriorityScore !== left.highestPriorityScore) {
          return right.highestPriorityScore - left.highestPriorityScore;
        }
        return left.branchName.localeCompare(right.branchName);
      });
  }

  private compareDashboardSupplierRollups(
    left: SupplierProcurementBranchInterventionSupplierRollupResponseDto,
    right: SupplierProcurementBranchInterventionSupplierRollupResponseDto,
    sortBy: SupplierProcurementDashboardSupplierRollupSortBy,
  ): number {
    if (
      sortBy === SupplierProcurementDashboardSupplierRollupSortBy.PRIORITY_DESC
    ) {
      if (right.highestPriorityScore !== left.highestPriorityScore) {
        return right.highestPriorityScore - left.highestPriorityScore;
      }
    }

    if (
      sortBy === SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC
    ) {
      if (right.untriagedCount !== left.untriagedCount) {
        return right.untriagedCount - left.untriagedCount;
      }
    }

    if (right.over72hCount !== left.over72hCount) {
      return right.over72hCount - left.over72hCount;
    }
    if (right.over24hCount !== left.over24hCount) {
      return right.over24hCount - left.over24hCount;
    }
    if (right.untriagedCount !== left.untriagedCount) {
      return right.untriagedCount - left.untriagedCount;
    }
    if (right.highestPriorityScore !== left.highestPriorityScore) {
      return right.highestPriorityScore - left.highestPriorityScore;
    }
    return left.companyName.localeCompare(right.companyName);
  }

  private compareDashboardBranchRollups(
    left: SupplierProcurementBranchInterventionBranchRollupResponseDto,
    right: SupplierProcurementBranchInterventionBranchRollupResponseDto,
    sortBy: SupplierProcurementDashboardBranchRollupSortBy,
  ): number {
    if (
      sortBy ===
      SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC
    ) {
      if (right.interventionCount !== left.interventionCount) {
        return right.interventionCount - left.interventionCount;
      }
    }

    if (
      sortBy === SupplierProcurementDashboardBranchRollupSortBy.PRIORITY_DESC
    ) {
      if (right.highestPriorityScore !== left.highestPriorityScore) {
        return right.highestPriorityScore - left.highestPriorityScore;
      }
    }

    if (right.over72hCount !== left.over72hCount) {
      return right.over72hCount - left.over72hCount;
    }
    if (right.over24hCount !== left.over24hCount) {
      return right.over24hCount - left.over24hCount;
    }
    if (right.interventionCount !== left.interventionCount) {
      return right.interventionCount - left.interventionCount;
    }
    if (right.untriagedCount !== left.untriagedCount) {
      return right.untriagedCount - left.untriagedCount;
    }
    if (right.highestPriorityScore !== left.highestPriorityScore) {
      return right.highestPriorityScore - left.highestPriorityScore;
    }
    return left.branchName.localeCompare(right.branchName);
  }

  private determineTrendDirection(
    scoreDeltaFrom90d: number,
  ): 'IMPROVING' | 'STABLE' | 'WORSENING' {
    if (scoreDeltaFrom90d > 2) {
      return 'IMPROVING';
    }
    if (scoreDeltaFrom90d < -2) {
      return 'WORSENING';
    }
    return 'STABLE';
  }

  private diffHours(from: Date, to: Date): number {
    return Number(
      ((to.getTime() - from.getTime()) / (60 * 60 * 1000)).toFixed(2),
    );
  }

  private average(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    return Number(
      (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(
        2,
      ),
    );
  }

  private toPercent(value: number): number {
    return Number((value * 100).toFixed(2));
  }

  private escapeCsvValue(value: unknown): string {
    const normalized = String(value ?? '').replace(/"/g, '""');
    return `"${normalized}"`;
  }

  private hasAnyRole(roles: string[], allowedRoles: UserRole[]): boolean {
    return allowedRoles.some((role) => roles.includes(role));
  }
}
