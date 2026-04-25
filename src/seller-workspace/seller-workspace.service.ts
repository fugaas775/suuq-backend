import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User, SubscriptionTier } from '../users/entities/user.entity';
import { VendorStaffService } from '../vendor/vendor-staff.service';
import { BranchStaffService } from '../branch-staff/branch-staff.service';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Order, PaymentStatus } from '../orders/entities/order.entity';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import {
  PosCheckout,
  PosCheckoutStatus,
} from '../pos-sync/entities/pos-checkout.entity';
import {
  PosSyncJob,
  PosSyncStatus,
} from '../pos-sync/entities/pos-sync-job.entity';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from '../retail/entities/tenant-module-entitlement.entity';
import {
  assertAllowedSelfServeServiceFormat,
  getPosCoreEntitlement,
  resolveAllowedSelfServeServiceFormats,
} from '../retail/self-serve-service-format.policy';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { Product } from '../products/entities/product.entity';
import { PosRegisterSession } from '../pos-sync/entities/pos-register-session.entity';
import { UserRole } from '../auth/roles.enum';
import { BootstrapSellerWorkspaceDto } from './dto/bootstrap-seller-workspace.dto';
import { CreateSellerBranchWorkspaceDto } from './dto/create-seller-branch-workspace.dto';
import {
  SellerPlanCode,
  SellerWorkspaceBranchWorkspaceDto,
  SellerWorkspaceBranchSummaryDto,
  SellerWorkspaceBillingStatusDto,
  SellerWorkspaceChannelStatusDto,
  SellerWorkspaceOnboardingStepDto,
  SellerWorkspaceOverviewResponseDto,
  SellerWorkspacePlanDefinitionDto,
  SellerWorkspacePlansResponseDto,
  SellerWorkspaceProfileResponseDto,
  SellerWorkspacePricingDto,
  SellerWorkspaceRetailContextDto,
  SellerWorkspaceStoreSummaryDto,
  SellerWorkspaceBranchWorkspacesResponseDto,
  SellerWorkspaceSubscriptionSummaryDto,
  SellerWorkspaceStateResponseDto,
  SellerWorkspaceStatusDto,
  SellerWorkspaceUserSummaryDto,
} from './dto/seller-workspace-response.dto';
import { UpdateSellerWorkspaceChannelDto } from './dto/update-seller-workspace-channel.dto';
import { UpdateBranchServiceFormatDto } from './dto/update-branch-service-format.dto';
import { UpdateBranchWorkspaceDto } from './dto/update-branch-workspace.dto';
import { UpdateSellerWorkspaceOnboardingDto } from './dto/update-seller-workspace-onboarding.dto';
import { UpdateSellerWorkspacePlanDto } from './dto/update-seller-workspace-plan.dto';
import {
  SellerWorkspace,
  SellerWorkspaceBillingStatus,
  SellerWorkspaceProgressState,
  SellerWorkspaceStatus,
} from './entities/seller-workspace.entity';

const SELLER_PLAN_DEFINITIONS: Record<
  SellerPlanCode,
  Omit<SellerWorkspacePlanDefinitionDto, 'recommended' | 'current'>
> = {
  [SellerPlanCode.STARTER]: {
    code: SellerPlanCode.STARTER,
    label: 'Starter',
    fit: 'Small seller',
    summary:
      'One store or branch, fast onboarding, local checkout, and simple supplier coordination.',
    capabilities: [
      'Single branch POS lane',
      'Local-first checkout and sync outbox',
      'Catalog and stock visibility',
      'Supplier ordering entry point',
    ],
  },
  [SellerPlanCode.GROWTH]: {
    code: SellerPlanCode.GROWTH,
    label: 'Growth',
    fit: 'Medium seller',
    summary:
      'Multi-branch visibility, stronger replenishment control, and tighter consumer and supplier coordination.',
    capabilities: [
      'Multi-branch workspace switching',
      'Branch staff and attendance control',
      'Replenishment review and exception handling',
      'Consumer demand plus supplier coordination',
    ],
  },
  [SellerPlanCode.SCALE]: {
    code: SellerPlanCode.SCALE,
    label: 'Scale',
    fit: 'Large seller',
    summary:
      'Network-level execution for larger operators that depend on backend truth and cross-channel orchestration.',
    capabilities: [
      'Network-level operational visibility',
      'Cross-channel reconciliation against backend truth',
      'High-volume sync and checkout oversight',
      'Stronger operating model for multi-team retail',
    ],
  },
};

type SellerWorkspaceSnapshot = {
  user: User;
  workspace: SellerWorkspace;
  stores: SellerWorkspaceStoreSummaryDto[];
  branches: SellerWorkspaceBranchSummaryDto[];
  subscriptions: SellerWorkspaceSubscriptionSummaryDto[];
  primaryRetailContext: SellerWorkspaceRetailContextDto | null;
  channels: SellerWorkspaceChannelStatusDto[];
  onboarding: SellerWorkspaceOnboardingStepDto[];
  currentPlanCode: SellerPlanCode;
  recommendedPlanCode: SellerPlanCode;
  metrics: {
    windowHours: number;
    storeCount: number;
    branchCount: number;
    orderCount: number;
    grossSales: number;
    purchaseOrderCount: number;
    openPurchaseOrderCount: number;
    checkoutCount: number;
    failedCheckoutCount: number;
    syncJobCount: number;
    failedSyncJobCount: number;
    catalogProductCount: number;
    registerSessionCount: number;
  };
};

@Injectable()
export class SellerWorkspaceService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
    @InjectRepository(PosCheckout)
    private readonly posCheckoutsRepository: Repository<PosCheckout>,
    @InjectRepository(PosSyncJob)
    private readonly posSyncJobsRepository: Repository<PosSyncJob>,
    @InjectRepository(RetailTenant)
    private readonly retailTenantsRepository: Repository<RetailTenant>,
    @InjectRepository(TenantModuleEntitlement)
    private readonly tenantModuleEntitlementsRepository: Repository<TenantModuleEntitlement>,
    @InjectRepository(TenantSubscription)
    private readonly tenantSubscriptionsRepository: Repository<TenantSubscription>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(PosRegisterSession)
    private readonly posRegisterSessionsRepository: Repository<PosRegisterSession>,
    @InjectRepository(SellerWorkspace)
    private readonly sellerWorkspacesRepository: Repository<SellerWorkspace>,
    private readonly vendorStaffService: VendorStaffService,
    private readonly branchStaffService: BranchStaffService,
  ) {}

  async bootstrapWorkspace(
    userId: number,
    dto: BootstrapSellerWorkspaceDto,
  ): Promise<SellerWorkspaceStateResponseDto> {
    const access = await this.resolveAccess(userId);
    const workspace = await this.ensureWorkspaceForAccess(
      access.user,
      access,
      dto,
    );
    return this.serializeWorkspace(workspace);
  }

  async getProfile(
    userId: number,
    windowHours = 24,
  ): Promise<SellerWorkspaceProfileResponseDto> {
    const snapshot = await this.buildSnapshot(userId, windowHours);

    return {
      workspace: this.serializeWorkspace(snapshot.workspace),
      user: this.serializeUser(snapshot.user),
      stores: snapshot.stores,
      branches: snapshot.branches,
      subscriptions: snapshot.subscriptions,
      currentPlanCode: snapshot.currentPlanCode,
      recommendedPlanCode: snapshot.recommendedPlanCode,
      channels: snapshot.channels,
      onboarding: snapshot.onboarding,
      primaryRetailContext: snapshot.primaryRetailContext,
    };
  }

  async getOverview(
    userId: number,
    windowHours = 24,
  ): Promise<SellerWorkspaceOverviewResponseDto> {
    const snapshot = await this.buildSnapshot(userId, windowHours);

    return {
      workspace: this.serializeWorkspace(snapshot.workspace),
      ...snapshot.metrics,
      currentPlanCode: snapshot.currentPlanCode,
      recommendedPlanCode: snapshot.recommendedPlanCode,
      channels: snapshot.channels,
    };
  }

  async getPlans(
    userId: number,
    windowHours = 24,
  ): Promise<SellerWorkspacePlansResponseDto> {
    const snapshot = await this.buildSnapshot(userId, windowHours);

    return {
      workspace: this.serializeWorkspace(snapshot.workspace),
      currentPlanCode: snapshot.currentPlanCode,
      recommendedPlanCode: snapshot.recommendedPlanCode,
      plans: this.buildPlans(
        snapshot.currentPlanCode,
        snapshot.recommendedPlanCode,
      ),
      subscriptions: snapshot.subscriptions,
      onboarding: snapshot.onboarding,
      primaryRetailContext: snapshot.primaryRetailContext,
    };
  }

  async getBranchWorkspaces(
    userId: number,
  ): Promise<SellerWorkspaceBranchWorkspacesResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const [activeBranches, activationCandidates] = await Promise.all([
      this.branchStaffService.getPosBranchSummariesForUser({
        id: user.id,
        roles: user.roles,
      }),
      this.branchStaffService.getPosWorkspaceActivationCandidatesForUser({
        id: user.id,
        roles: user.roles,
      }),
    ]);

    if (!activeBranches.length && !activationCandidates.length) {
      throw new ForbiddenException({
        code: 'SELLER_WORKSPACE_ACCESS_DENIED',
        message:
          'This account is not linked to any seller store or POS workspace.',
      });
    }

    const pricing =
      this.branchStaffService.getPosWorkspacePricing() as SellerWorkspacePricingDto;
    const tenantIds = Array.from(
      new Set(
        [...activeBranches, ...activationCandidates]
          .map((branch) => branch.retailTenantId)
          .filter((tenantId): tenantId is number => Number.isInteger(tenantId)),
      ),
    );
    const [subscriptions, tenants, rosterSummaries] = await Promise.all([
      this.findRelevantSubscriptions(tenantIds),
      this.findTenantsByIds(tenantIds),
      this.branchStaffService.getBranchRosterSummaries(
        [...activeBranches, ...activationCandidates].map(
          (branch) => branch.branchId,
        ),
      ),
    ]);
    const latestSubscriptionByTenantId = new Map<number, TenantSubscription>();
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const rosterByBranchId = new Map(
      rosterSummaries.map((summary) => [summary.branchId, summary]),
    );
    for (const subscription of subscriptions) {
      if (!latestSubscriptionByTenantId.has(subscription.tenantId)) {
        latestSubscriptionByTenantId.set(subscription.tenantId, subscription);
      }
    }

    const items: SellerWorkspaceBranchWorkspaceDto[] = [
      ...activeBranches.map((branch) => {
        const subscription = branch.retailTenantId
          ? latestSubscriptionByTenantId.get(branch.retailTenantId) || null
          : null;
        const roster = rosterByBranchId.get(branch.branchId);
        const tenant = branch.retailTenantId
          ? tenantById.get(branch.retailTenantId) || null
          : null;

        return {
          branchId: branch.branchId,
          branchName: branch.branchName,
          branchCode: branch.branchCode,
          serviceFormat: branch.serviceFormat ?? null,
          address: branch.address ?? null,
          city: branch.city ?? null,
          country: branch.country ?? null,
          timezone: branch.timezone ?? null,
          role: branch.role,
          isOwner: branch.isOwner,
          isTenantOwner: branch.isTenantOwner,
          retailTenantId: branch.retailTenantId,
          retailTenantName: branch.retailTenantName,
          workspaceStatus: branch.workspaceStatus,
          subscriptionStatus:
            branch.subscriptionStatus ??
            subscription?.status ??
            TenantSubscriptionStatus.ACTIVE,
          planCode: branch.planCode ?? subscription?.planCode ?? null,
          managerCount: roster?.managerCount ?? 0,
          operatorCount: roster?.operatorCount ?? 0,
          assignedManagers: (roster?.assignedManagers ?? []).map((manager) => ({
            userId: manager.userId,
            email: manager.email,
            displayName: manager.displayName,
            phone: null,
            status: manager.isOwner ? 'ACTIVE' : null,
            lastLoginAt: null,
          })),
          assignedOperators: (roster?.assignedOperators ?? []).map(
            (operator) => ({
              userId: operator.userId,
              email: operator.email,
              displayName: operator.displayName,
              phone: null,
              status: null,
              lastLoginAt: null,
            }),
          ),
          tenantDefaultUserFit: tenant?.onboardingProfile?.userFit ?? null,
          categoryOverrideUserFit: null,
          modules: branch.modules,
          pricing,
          canStartActivation: false,
          canStartTrial: false,
          canOpenNow: branch.canOpenNow,
          trialStartedAt: branch.trialStartedAt,
          trialEndsAt: branch.trialEndsAt,
          trialDaysRemaining: branch.trialDaysRemaining,
          joinedAt: branch.joinedAt,
        };
      }),
      ...activationCandidates.map((candidate) => {
        const roster = rosterByBranchId.get(candidate.branchId);
        const tenant = candidate.retailTenantId
          ? tenantById.get(candidate.retailTenantId) || null
          : null;

        return {
          branchId: candidate.branchId,
          branchName: candidate.branchName,
          branchCode: candidate.branchCode,
          serviceFormat: candidate.serviceFormat ?? null,
          address: candidate.address ?? null,
          city: candidate.city ?? null,
          country: candidate.country ?? null,
          timezone: candidate.timezone ?? null,
          role: candidate.role,
          isOwner: candidate.isOwner,
          isTenantOwner: candidate.isTenantOwner,
          retailTenantId: candidate.retailTenantId,
          retailTenantName: candidate.retailTenantName,
          workspaceStatus: candidate.workspaceStatus,
          subscriptionStatus: candidate.subscriptionStatus,
          planCode: candidate.planCode,
          managerCount: roster?.managerCount ?? 0,
          operatorCount: roster?.operatorCount ?? 0,
          assignedManagers: (roster?.assignedManagers ?? []).map((manager) => ({
            userId: manager.userId,
            email: manager.email,
            displayName: manager.displayName,
            phone: null,
            status: manager.isOwner ? 'ACTIVE' : null,
            lastLoginAt: null,
          })),
          assignedOperators: (roster?.assignedOperators ?? []).map(
            (operator) => ({
              userId: operator.userId,
              email: operator.email,
              displayName: operator.displayName,
              phone: null,
              status: null,
              lastLoginAt: null,
            }),
          ),
          tenantDefaultUserFit: tenant?.onboardingProfile?.userFit ?? null,
          categoryOverrideUserFit: null,
          modules: [],
          pricing: candidate.pricing as SellerWorkspacePricingDto,
          canStartActivation: candidate.canStartActivation,
          canStartTrial: candidate.canStartTrial,
          canOpenNow: candidate.canOpenNow,
          trialStartedAt: candidate.trialStartedAt,
          trialEndsAt: candidate.trialEndsAt,
          trialDaysRemaining: candidate.trialDaysRemaining,
          joinedAt: new Date(0),
        };
      }),
    ].sort((left, right) => {
      if (left.canOpenNow !== right.canOpenNow) {
        return left.canOpenNow ? -1 : 1;
      }

      if (left.workspaceStatus !== right.workspaceStatus) {
        return left.workspaceStatus.localeCompare(right.workspaceStatus);
      }

      return left.branchName.localeCompare(right.branchName);
    });

    return { items };
  }

  async createBranchWorkspace(
    userId: number,
    dto: CreateSellerBranchWorkspaceDto,
  ): Promise<SellerWorkspaceBranchWorkspaceDto> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const [activeBranches, activationCandidates, workspace] = await Promise.all(
      [
        this.branchStaffService.getPosBranchSummariesForUser({
          id: user.id,
          roles: user.roles,
        }),
        this.branchStaffService.getPosWorkspaceActivationCandidatesForUser({
          id: user.id,
          roles: user.roles,
        }),
        this.sellerWorkspacesRepository.findOne({
          where: { ownerUserId: user.id },
        }),
      ],
    );

    const accessItems = [...activeBranches, ...activationCandidates];
    if (!accessItems.length) {
      throw new ForbiddenException({
        code: 'SELLER_WORKSPACE_ACCESS_DENIED',
        message:
          'This account is not linked to any seller store or POS workspace.',
      });
    }

    const targetTenantId = this.resolveTargetTenantIdForBranchCreation(
      accessItems,
      workspace?.primaryRetailTenantId ?? null,
    );

    if (
      !this.canCreateBranchWorkspaceForTenant(user, accessItems, targetTenantId)
    ) {
      throw new ForbiddenException(
        'Only a tenant owner, branch owner, or approved admin can create another branch.',
      );
    }

    const normalizedBranchName = this.normalizeRequiredString(
      dto.branchName,
      'branchName is required',
    );
    const normalizedCurrency = this.normalizeRequiredString(
      dto.defaultCurrency,
      'defaultCurrency is required',
    ).toUpperCase();
    const posCoreEntitlement =
      await this.tenantModuleEntitlementsRepository.findOne({
        where: {
          tenantId: targetTenantId,
          module: RetailModule.POS_CORE,
        },
      });
    if (
      posCoreEntitlement?.metadata &&
      typeof posCoreEntitlement.metadata === 'object' &&
      typeof (posCoreEntitlement.metadata as any).includedBranches === 'number'
    ) {
      const includedBranches = (posCoreEntitlement.metadata as any)
        .includedBranches as number;
      const tenantBranches = await this.retailTenantsRepository.manager.query(
        `SELECT COUNT(id) FROM branches WHERE "retailTenantId" = $1`,
        [targetTenantId],
      );
      const currentCount = parseInt(tenantBranches[0].count, 10);
      if (currentCount >= includedBranches) {
        const additionalFee =
          (posCoreEntitlement.metadata as any).additionalBranchFee || '1,300';
        const additionalCurrency =
          (posCoreEntitlement.metadata as any).additionalBranchCurrency ||
          'ETB';
        throw new ForbiddenException(
          `Branch limit reached. Please upgrade your plan or pay the additional branch fee of ${additionalFee} ${additionalCurrency}/month to add more branches.`,
        );
      }
    }
    const normalizedServiceFormat = assertAllowedSelfServeServiceFormat(
      dto.serviceFormat,
      'Seller HQ branch creation',
      resolveAllowedSelfServeServiceFormats(
        getPosCoreEntitlement([posCoreEntitlement].filter(Boolean)),
      ),
    );
    const normalizedAddress = this.normalizeOptionalString(dto.address);
    const normalizedCity = this.normalizeOptionalString(dto.city);
    const normalizedCountry = this.normalizeOptionalString(dto.country);

    let createdBranchId: number | null = null;

    await this.sellerWorkspacesRepository.manager.transaction(
      async (manager) => {
        const branchesRepository = manager.getRepository(Branch);
        const assignmentsRepository = manager.getRepository(
          BranchStaffAssignment,
        );
        const tenantsRepository = manager.getRepository(RetailTenant);

        const tenant = await tenantsRepository.findOne({
          where: { id: targetTenantId },
        });
        if (!tenant) {
          throw new NotFoundException(
            `Retail tenant with ID ${targetTenantId} not found`,
          );
        }

        const existingBranches = await branchesRepository.find({
          where: { retailTenantId: targetTenantId },
        });

        if (
          existingBranches.some(
            (branch) =>
              String(branch.name || '')
                .trim()
                .toLowerCase() === normalizedBranchName.toLowerCase(),
          )
        ) {
          throw new ConflictException(
            'A branch with this name or generated code already exists in the tenant.',
          );
        }

        const branch = branchesRepository.create({
          name: normalizedBranchName,
          code: await this.generateUniqueBranchCode(
            branchesRepository,
            normalizedBranchName,
          ),
          serviceFormat: normalizedServiceFormat,
          ownerId: user.id,
          retailTenantId: tenant.id,
          address: normalizedAddress,
          city: normalizedCity,
          country: normalizedCountry,
          isActive: true,
        });
        const savedBranch = await branchesRepository.save(branch);

        await assignmentsRepository.save(
          assignmentsRepository.create({
            branchId: savedBranch.id,
            userId: user.id,
            role: BranchStaffRole.MANAGER,
            permissions: [],
            isActive: true,
          }),
        );

        if (!tenant.defaultCurrency && normalizedCurrency) {
          tenant.defaultCurrency = normalizedCurrency;
          await tenantsRepository.save(tenant);
        }

        createdBranchId = savedBranch.id;
      },
    );

    const refreshed = await this.getBranchWorkspaces(userId);
    const createdWorkspace = refreshed.items.find(
      (item) => item.branchId === createdBranchId,
    );

    if (!createdWorkspace) {
      throw new NotFoundException(
        'Created branch workspace could not be resolved after creation.',
      );
    }

    return createdWorkspace;
  }

  async updatePlanSelection(
    userId: number,
    dto: UpdateSellerWorkspacePlanDto,
  ): Promise<SellerWorkspaceStateResponseDto> {
    const access = await this.resolveAccess(userId);
    const workspace = await this.ensureWorkspaceForAccess(access.user, access);
    const normalizedPlanCode = this.normalizePlanCode(dto.planCode);

    if (dto.primaryRetailTenantId != null) {
      this.assertTenantAccess(access.branches, dto.primaryRetailTenantId);
      workspace.primaryRetailTenantId = dto.primaryRetailTenantId;
    }

    workspace.selectedPlanCode = normalizedPlanCode;
    workspace.planSelectedAt = new Date();
    workspace.billingStatus = this.resolvePersistedBillingStatus(
      access.subscriptions,
      true,
    );
    workspace.metadata = dto.metadata
      ? { ...(workspace.metadata || {}), ...dto.metadata }
      : workspace.metadata || null;

    return this.serializeWorkspace(
      await this.sellerWorkspacesRepository.save(workspace),
    );
  }

  async updateOnboardingStep(
    userId: number,
    dto: UpdateSellerWorkspaceOnboardingDto,
  ): Promise<SellerWorkspaceStateResponseDto> {
    const access = await this.resolveAccess(userId);
    const workspace = await this.ensureWorkspaceForAccess(access.user, access);
    workspace.onboardingState = this.upsertProgressStateEntry(
      workspace.onboardingState,
      dto.stepKey,
      {
        completed: dto.completed,
        detail: dto.detail?.trim() || null,
      },
    );

    return this.serializeWorkspace(
      await this.sellerWorkspacesRepository.save(workspace),
    );
  }

  async updateChannelState(
    userId: number,
    channelKey: string,
    dto: UpdateSellerWorkspaceChannelDto,
  ): Promise<SellerWorkspaceStateResponseDto> {
    const normalizedChannelKey = String(channelKey || '')
      .trim()
      .toUpperCase();
    if (!normalizedChannelKey) {
      throw new BadRequestException('A channel key is required');
    }

    const access = await this.resolveAccess(userId);
    const workspace = await this.ensureWorkspaceForAccess(access.user, access);
    workspace.channelState = this.upsertProgressStateEntry(
      workspace.channelState,
      normalizedChannelKey,
      {
        connected: dto.connected,
        requested: dto.requested,
        detail: dto.detail?.trim() || null,
      },
    );

    return this.serializeWorkspace(
      await this.sellerWorkspacesRepository.save(workspace),
    );
  }

  private async buildSnapshot(
    userId: number,
    windowHours: number,
  ): Promise<SellerWorkspaceSnapshot> {
    const access = await this.resolveAccess(userId);
    const { user, stores, branches } = access;
    const vendorIds = access.vendorIds;
    const branchIds = access.branchIds;
    const tenantIds = access.tenantIds;
    const since = new Date(
      Date.now() - Math.max(windowHours, 1) * 60 * 60 * 1000,
    );

    const [
      workspace,
      orders,
      purchaseOrders,
      checkouts,
      syncJobs,
      subscriptions,
      catalogProductCount,
      registerSessionCount,
      tenants,
    ] = await Promise.all([
      this.ensureWorkspaceForAccess(user, access),
      this.findRelevantOrders(since, vendorIds, branchIds),
      this.findRelevantPurchaseOrders(since, branchIds),
      this.findRelevantCheckouts(since, branchIds),
      this.findRelevantSyncJobs(since, branchIds),
      this.findRelevantSubscriptions(tenantIds),
      this.countCatalogProducts(vendorIds),
      this.countRegisterSessions(branchIds),
      this.findTenantsByIds(tenantIds),
    ]);

    const grossSales = orders.reduce(
      (sum, order) => sum + Number(order.total || 0),
      0,
    );
    const openPurchaseOrderCount = purchaseOrders.filter((order) => {
      return ![
        PurchaseOrderStatus.RECEIVED,
        PurchaseOrderStatus.RECONCILED,
        PurchaseOrderStatus.CANCELLED,
      ].includes(order.status);
    }).length;
    const failedCheckoutCount = checkouts.filter(
      (checkout) => checkout.status === PosCheckoutStatus.FAILED,
    ).length;
    const failedSyncJobCount = syncJobs.filter(
      (job) => job.status === PosSyncStatus.FAILED,
    ).length;

    const metrics = {
      windowHours,
      storeCount: stores.length,
      branchCount: branches.length,
      orderCount: orders.length,
      grossSales,
      purchaseOrderCount: purchaseOrders.length,
      openPurchaseOrderCount,
      checkoutCount: checkouts.length,
      failedCheckoutCount,
      syncJobCount: syncJobs.length,
      failedSyncJobCount,
      catalogProductCount,
      registerSessionCount,
    };

    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const governanceByTenantId = await this.buildTenantGovernanceMap(
      tenants,
      subscriptions,
    );
    const currentPlanCode = this.resolveCurrentPlanCode(
      user,
      subscriptions,
      workspace,
    );
    const recommendedPlanCode = this.recommendPlanCode(metrics);
    const channels = this.buildChannels(metrics, workspace.channelState);
    const sellerSubscriptions = subscriptions.map((subscription) => ({
      tenantId: subscription.tenantId,
      tenantName:
        tenantById.get(subscription.tenantId)?.name ??
        `Tenant #${subscription.tenantId}`,
      status: subscription.status,
      planCode: subscription.planCode,
      billingInterval: subscription.billingInterval,
      amount: subscription.amount == null ? null : Number(subscription.amount),
      currency: subscription.currency ?? null,
      startsAt: subscription.startsAt,
      endsAt: subscription.endsAt ?? null,
      autoRenew: subscription.autoRenew,
    }));
    const onboarding = this.buildOnboarding(
      metrics,
      stores,
      branches,
      subscriptions,
      workspace.onboardingState,
    );
    const primaryRetailContext = this.buildPrimaryRetailContext(
      workspace,
      branches,
      tenantById,
      governanceByTenantId,
    );

    return {
      user,
      workspace: this.applyDerivedWorkspaceState(workspace, subscriptions),
      stores: stores.map((store) => ({
        vendorId: store.vendorId,
        storeName: store.storeName,
        permissions: [...store.permissions],
        title: store.title ?? null,
        joinedAt: store.joinedAt,
      })),
      branches: branches.map((branch) => ({
        branchId: branch.branchId,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        serviceFormat: branch.serviceFormat ?? null,
        role: branch.role,
        permissions: [...branch.permissions],
        isOwner: branch.isOwner,
        isTenantOwner: branch.isTenantOwner,
        retailTenantId: branch.retailTenantId,
        retailTenantName: branch.retailTenantName,
        modules: [...branch.modules],
        joinedAt: branch.joinedAt,
      })),
      subscriptions: sellerSubscriptions,
      primaryRetailContext,
      channels,
      onboarding,
      currentPlanCode,
      recommendedPlanCode,
      metrics,
    };
  }

  private serializeUser(user: User): SellerWorkspaceUserSummaryDto {
    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      storeName: user.storeName ?? null,
    };
  }

  private async findRelevantOrders(
    since: Date,
    vendorIds: number[],
    branchIds: number[],
  ): Promise<Order[]> {
    if (!vendorIds.length && !branchIds.length) {
      return [];
    }

    const qb = this.ordersRepository
      .createQueryBuilder('order')
      .distinct(true)
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .where('order.createdAt >= :since', { since });

    if (vendorIds.length && branchIds.length) {
      qb.andWhere(
        '(vendor.id IN (:...vendorIds) OR order.fulfillmentBranchId IN (:...branchIds))',
        { vendorIds, branchIds },
      );
    } else if (vendorIds.length) {
      qb.andWhere('vendor.id IN (:...vendorIds)', { vendorIds });
    } else {
      qb.andWhere('order.fulfillmentBranchId IN (:...branchIds)', {
        branchIds,
      });
    }

    return qb.getMany();
  }

  private async findRelevantPurchaseOrders(
    since: Date,
    branchIds: number[],
  ): Promise<PurchaseOrder[]> {
    if (!branchIds.length) {
      return [];
    }

    return this.purchaseOrdersRepository
      .find({
        where: {
          branchId: In(branchIds),
        },
        relations: { items: true },
      })
      .then((orders) => orders.filter((order) => order.createdAt >= since));
  }

  private async findRelevantCheckouts(
    since: Date,
    branchIds: number[],
  ): Promise<PosCheckout[]> {
    if (!branchIds.length) {
      return [];
    }

    return this.posCheckoutsRepository
      .createQueryBuilder('checkout')
      .where('checkout.branchId IN (:...branchIds)', { branchIds })
      .andWhere('checkout.occurredAt >= :since', { since })
      .getMany();
  }

  private async findRelevantSyncJobs(
    since: Date,
    branchIds: number[],
  ): Promise<PosSyncJob[]> {
    if (!branchIds.length) {
      return [];
    }

    return this.posSyncJobsRepository
      .createQueryBuilder('job')
      .where('job.branchId IN (:...branchIds)', { branchIds })
      .andWhere('job.createdAt >= :since', { since })
      .getMany();
  }

  private async findRelevantSubscriptions(
    tenantIds: number[],
  ): Promise<TenantSubscription[]> {
    if (!tenantIds.length) {
      return [];
    }

    return this.tenantSubscriptionsRepository.find({
      where: { tenantId: In(tenantIds) },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  private async countCatalogProducts(vendorIds: number[]): Promise<number> {
    if (!vendorIds.length) {
      return 0;
    }

    const row = await this.productsRepository
      .createQueryBuilder('product')
      .select('COUNT(DISTINCT product.id)', 'count')
      .where('product.vendorId IN (:...vendorIds)', { vendorIds })
      .andWhere("COALESCE(product.status, 'publish') != 'rejected'")
      .getRawOne<{ count?: string }>();

    return Number(row?.count || 0);
  }

  private async countRegisterSessions(branchIds: number[]): Promise<number> {
    if (!branchIds.length) {
      return 0;
    }

    return this.posRegisterSessionsRepository.count({
      where: { branchId: In(branchIds) },
    });
  }

  private async findTenantsByIds(tenantIds: number[]): Promise<RetailTenant[]> {
    if (!tenantIds.length) {
      return [];
    }

    return this.retailTenantsRepository.find({
      where: { id: In(tenantIds) },
      relations: { owner: true, branches: true, entitlements: true },
    });
  }

  private buildPrimaryRetailContext(
    workspace: SellerWorkspace,
    branches: SellerWorkspaceBranchSummaryDto[],
    tenantById: Map<number, RetailTenant>,
    governanceByTenantId: Map<
      number,
      {
        owner: {
          userId: number | null;
          email: string | null;
          displayName: string | null;
          phone: string | null;
          status: string | null;
          lastLoginAt: string | null;
        };
        activationReadiness: {
          canActivate: boolean;
          status: 'READY' | 'BLOCKED';
          blockers: string[];
          branchCount: number;
          managersAssignedCount: number;
          operatorsAssignedCount: number;
          subscriptionState: string;
        };
      }
    >,
  ): SellerWorkspaceRetailContextDto | null {
    const primaryTenantId =
      workspace.primaryRetailTenantId ??
      branches.find((branch) => Number.isInteger(branch.retailTenantId))
        ?.retailTenantId ??
      null;

    if (!primaryTenantId) {
      return null;
    }

    const tenant = tenantById.get(primaryTenantId);
    const governance = governanceByTenantId.get(primaryTenantId) || null;
    if (!tenant) {
      return {
        tenantId: primaryTenantId,
        tenantName: null,
        onboardingProfile: null,
        owner: governance?.owner ?? null,
        activationReadiness: governance?.activationReadiness ?? null,
      };
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      onboardingProfile: tenant.onboardingProfile
        ? {
            categoryId: tenant.onboardingProfile.categoryId ?? null,
            categorySlug: tenant.onboardingProfile.categorySlug ?? null,
            categoryName: tenant.onboardingProfile.categoryName ?? null,
            userFit: tenant.onboardingProfile.userFit ?? null,
            suggestedUserFit: tenant.onboardingProfile.suggestedUserFit ?? null,
            notes: tenant.onboardingProfile.notes ?? null,
          }
        : null,
      owner: governance?.owner ?? this.buildOwnerSummary(tenant.owner ?? null),
      activationReadiness: governance?.activationReadiness ?? null,
    };
  }

  private buildOwnerSummary(owner: User | null) {
    if (!owner) {
      return null;
    }

    return {
      userId: owner.id,
      email: owner.email ?? null,
      displayName: owner.displayName ?? owner.contactName ?? null,
      phone:
        [owner.phoneCountryCode, owner.phoneNumber]
          .filter((value) => typeof value === 'string' && value.trim())
          .join(' ')
          .trim() ||
        owner.vendorPhoneNumber ||
        null,
      status: owner.isActive ? 'ACTIVE' : 'SUSPENDED',
      lastLoginAt: owner.lastLoginAt?.toISOString() ?? null,
    };
  }

  private async buildTenantGovernanceMap(
    tenants: RetailTenant[],
    subscriptions: TenantSubscription[],
  ) {
    const latestSubscriptionByTenantId = new Map<number, TenantSubscription>();

    for (const subscription of subscriptions) {
      if (!latestSubscriptionByTenantId.has(subscription.tenantId)) {
        latestSubscriptionByTenantId.set(subscription.tenantId, subscription);
      }
    }

    const rosterSummaries =
      await this.branchStaffService.getBranchRosterSummaries(
        tenants.flatMap(
          (tenant) => tenant.branches?.map((branch) => branch.id) || [],
        ),
      );
    const rosterByBranchId = new Map(
      rosterSummaries.map((summary) => [summary.branchId, summary]),
    );

    return new Map(
      tenants.map((tenant) => {
        const owner = this.buildOwnerSummary(tenant.owner ?? null);
        const activeBranches = (tenant.branches ?? []).filter(
          (branch) => branch.isActive !== false,
        );
        const hasPosCore = (tenant.entitlements ?? []).some((entitlement) => {
          if (entitlement.module !== 'POS_CORE' || !entitlement.enabled) {
            return false;
          }

          const now = Date.now();
          if (entitlement.startsAt && entitlement.startsAt.getTime() > now) {
            return false;
          }

          if (entitlement.expiresAt && entitlement.expiresAt.getTime() < now) {
            return false;
          }

          return true;
        });
        const managersAssignedCount = activeBranches.reduce((total, branch) => {
          return total + (rosterByBranchId.get(branch.id)?.managerCount ?? 0);
        }, 0);
        const operatorsAssignedCount = activeBranches.reduce(
          (total, branch) => {
            return (
              total + (rosterByBranchId.get(branch.id)?.operatorCount ?? 0)
            );
          },
          0,
        );
        const blockers: string[] = [];

        if (tenant.status !== 'ACTIVE') {
          blockers.push('Activate the retail tenant before POS activation.');
        }

        if (!owner?.userId) {
          blockers.push('Assign a tenant owner account.');
        }

        if (!hasPosCore) {
          blockers.push('Enable POS_CORE entitlement.');
        }

        if (!activeBranches.length) {
          blockers.push('Assign at least one active branch to this tenant.');
        }

        if (
          activeBranches.length &&
          activeBranches.some(
            (branch) =>
              (rosterByBranchId.get(branch.id)?.managerCount ?? 0) === 0,
          )
        ) {
          blockers.push(
            'Assign a branch manager or owner for every active branch.',
          );
        }

        const readinessStatus: 'READY' | 'BLOCKED' =
          blockers.length === 0 ? 'READY' : 'BLOCKED';

        return [
          tenant.id,
          {
            owner,
            activationReadiness: {
              canActivate: blockers.length === 0,
              status: readinessStatus,
              blockers,
              branchCount: activeBranches.length,
              managersAssignedCount,
              operatorsAssignedCount,
              subscriptionState:
                latestSubscriptionByTenantId.get(tenant.id)?.status ||
                'NOT_STARTED',
            },
          },
        ];
      }),
    );
  }

  private resolveCurrentPlanCode(
    user: User,
    subscriptions: TenantSubscription[],
    workspace?: SellerWorkspace | null,
  ): SellerPlanCode {
    const rankedSubscriptions = [...subscriptions].sort((left, right) => {
      return (
        this.subscriptionPriority(right.status) -
        this.subscriptionPriority(left.status)
      );
    });
    const current = rankedSubscriptions[0];
    const currentSource = [
      workspace?.selectedPlanCode,
      current?.metadata?.sellerPlanCode,
      current?.planCode,
      user.subscriptionTier,
    ]
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      )
      .map((value) => value.trim().toUpperCase());

    if (currentSource.some((value) => value.includes('SCALE'))) {
      return SellerPlanCode.SCALE;
    }
    if (
      currentSource.some(
        (value) =>
          value.includes('GROWTH') ||
          value === SubscriptionTier.PRO.toUpperCase(),
      )
    ) {
      return SellerPlanCode.GROWTH;
    }

    return SellerPlanCode.STARTER;
  }

  private recommendPlanCode(
    metrics: SellerWorkspaceSnapshot['metrics'],
  ): SellerPlanCode {
    if (
      metrics.branchCount >= 6 ||
      metrics.orderCount >= 1200 ||
      metrics.grossSales >= 1_500_000 ||
      metrics.purchaseOrderCount >= 40
    ) {
      return SellerPlanCode.SCALE;
    }

    if (
      metrics.branchCount >= 2 ||
      metrics.orderCount >= 250 ||
      metrics.grossSales >= 250_000 ||
      metrics.purchaseOrderCount >= 10
    ) {
      return SellerPlanCode.GROWTH;
    }

    return SellerPlanCode.STARTER;
  }

  private buildChannels(
    metrics: SellerWorkspaceSnapshot['metrics'],
    persistedState?: SellerWorkspaceProgressState | null,
  ): SellerWorkspaceChannelStatusDto[] {
    return [
      {
        key: 'POS_S',
        label: 'POS-S',
        connected: persistedState?.POS_S?.connected ?? metrics.branchCount > 0,
        detail:
          persistedState?.POS_S?.detail ??
          (metrics.branchCount > 0
            ? `${metrics.branchCount} branch workspace(s) connected`
            : 'No retail branch workspace is linked yet'),
      },
      {
        key: 'SUUQ_S',
        label: 'Suuq S',
        connected:
          persistedState?.SUUQ_S?.connected ??
          (metrics.storeCount > 0 || metrics.orderCount > 0),
        detail:
          persistedState?.SUUQ_S?.detail ??
          (metrics.orderCount > 0
            ? `${metrics.orderCount} consumer-facing order(s) in the current window`
            : 'No consumer demand signal is visible yet'),
      },
      {
        key: 'B2B',
        label: 'B2B',
        connected:
          persistedState?.B2B?.connected ?? metrics.purchaseOrderCount > 0,
        detail:
          persistedState?.B2B?.detail ??
          (metrics.purchaseOrderCount > 0
            ? `${metrics.purchaseOrderCount} supplier order(s) linked`
            : 'Supplier ordering has not started yet'),
      },
      {
        key: 'BACKEND',
        label: 'Backend',
        connected: persistedState?.BACKEND?.connected ?? true,
        detail:
          persistedState?.BACKEND?.detail ??
          'Shared backend remains the source of truth across every surface.',
      },
    ];
  }

  private buildOnboarding(
    metrics: SellerWorkspaceSnapshot['metrics'],
    stores: SellerWorkspaceStoreSummaryDto[],
    branches: SellerWorkspaceBranchSummaryDto[],
    subscriptions: TenantSubscription[],
    persistedState?: SellerWorkspaceProgressState | null,
  ): SellerWorkspaceOnboardingStepDto[] {
    const hasActiveSubscription = subscriptions.some((subscription) =>
      [
        TenantSubscriptionStatus.ACTIVE,
        TenantSubscriptionStatus.TRIAL,
      ].includes(subscription.status),
    );

    return [
      {
        key: 'seller-store',
        label: 'Create or link a seller store',
        completed:
          persistedState?.['seller-store']?.completed ?? stores.length > 0,
        detail:
          persistedState?.['seller-store']?.detail ??
          (stores.length > 0
            ? `${stores.length} seller store workspace(s) linked`
            : 'No seller store workspace is linked yet'),
      },
      {
        key: 'plan',
        label: 'Choose an active seller plan',
        completed: persistedState?.plan?.completed ?? hasActiveSubscription,
        detail:
          persistedState?.plan?.detail ??
          (hasActiveSubscription
            ? 'At least one active or trial retail subscription is present'
            : 'No active retail subscription is attached to the linked POS tenant yet'),
      },
      {
        key: 'branch',
        label: 'Connect a POS branch workspace',
        completed: persistedState?.branch?.completed ?? branches.length > 0,
        detail:
          persistedState?.branch?.detail ??
          (branches.length > 0
            ? `${branches.length} POS branch workspace(s) connected`
            : 'No POS branch workspace is connected yet'),
      },
      {
        key: 'catalog',
        label: 'Publish catalog to the seller workspace',
        completed:
          persistedState?.catalog?.completed ?? metrics.catalogProductCount > 0,
        detail:
          persistedState?.catalog?.detail ??
          (metrics.catalogProductCount > 0
            ? `${metrics.catalogProductCount} product(s) are visible`
            : 'No catalog products are currently visible'),
      },
      {
        key: 'register',
        label: 'Open the first register session',
        completed:
          persistedState?.register?.completed ??
          metrics.registerSessionCount > 0,
        detail:
          persistedState?.register?.detail ??
          (metrics.registerSessionCount > 0
            ? `${metrics.registerSessionCount} register session(s) recorded`
            : 'No register session has been recorded yet'),
      },
      {
        key: 'supplier',
        label: 'Link supplier purchasing flow',
        completed:
          persistedState?.supplier?.completed ?? metrics.purchaseOrderCount > 0,
        detail:
          persistedState?.supplier?.detail ??
          (metrics.purchaseOrderCount > 0
            ? `${metrics.purchaseOrderCount} purchase order(s) already linked`
            : 'No supplier purchase orders are linked yet'),
      },
    ];
  }

  private buildPlans(
    currentPlanCode: SellerPlanCode,
    recommendedPlanCode: SellerPlanCode,
  ): SellerWorkspacePlanDefinitionDto[] {
    return Object.values(SellerPlanCode).map((planCode) => ({
      ...SELLER_PLAN_DEFINITIONS[planCode],
      recommended: recommendedPlanCode === planCode,
      current: currentPlanCode === planCode,
    }));
  }

  private subscriptionPriority(status: TenantSubscriptionStatus): number {
    switch (status) {
      case TenantSubscriptionStatus.ACTIVE:
        return 5;
      case TenantSubscriptionStatus.TRIAL:
        return 4;
      case TenantSubscriptionStatus.PAST_DUE:
        return 3;
      case TenantSubscriptionStatus.EXPIRED:
        return 2;
      case TenantSubscriptionStatus.CANCELLED:
        return 1;
      default:
        return 0;
    }
  }

  private async resolveAccess(userId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const [stores, branches] = await Promise.all([
      this.vendorStaffService.getStoreSummariesForUser({
        id: user.id,
        roles: user.roles,
      }),
      this.branchStaffService.getPosBranchSummariesForUser({
        id: user.id,
        roles: user.roles,
      }),
    ]);

    if (!stores.length && !branches.length) {
      throw new ForbiddenException({
        code: 'SELLER_WORKSPACE_ACCESS_DENIED',
        message:
          'This account is not linked to any seller store or POS workspace.',
      });
    }

    const vendorIds = Array.from(
      new Set(stores.map((store) => store.vendorId)),
    );
    const branchIds = Array.from(
      new Set(branches.map((branch) => branch.branchId)),
    );
    const tenantIds = Array.from(
      new Set(
        branches
          .map((branch) => branch.retailTenantId)
          .filter((tenantId): tenantId is number => Number.isInteger(tenantId)),
      ),
    );
    const subscriptions = await this.findRelevantSubscriptions(tenantIds);

    return {
      user,
      stores,
      branches,
      vendorIds,
      branchIds,
      tenantIds,
      subscriptions,
    };
  }

  private async ensureWorkspaceForAccess(
    user: User,
    access: Awaited<ReturnType<SellerWorkspaceService['resolveAccess']>>,
    bootstrap?: BootstrapSellerWorkspaceDto,
  ): Promise<SellerWorkspace> {
    const existing = await this.sellerWorkspacesRepository.findOne({
      where: { ownerUserId: user.id },
    });

    const primaryVendorId = this.resolvePrimaryVendorId(
      access.stores,
      bootstrap?.primaryVendorId ?? existing?.primaryVendorId,
    );
    const primaryRetailTenantId = this.resolvePrimaryRetailTenantId(
      access.branches,
      bootstrap?.primaryRetailTenantId ?? existing?.primaryRetailTenantId,
    );

    const workspace = this.sellerWorkspacesRepository.create({
      ...(existing ?? {}),
      ownerUserId: user.id,
      primaryVendorId,
      primaryRetailTenantId,
      selectedPlanCode:
        this.normalizeOptionalPlanCode(
          bootstrap?.selectedPlanCode ?? existing?.selectedPlanCode,
        ) ?? null,
      billingStatus: this.resolvePersistedBillingStatus(
        access.subscriptions,
        Boolean(
          bootstrap?.selectedPlanCode ||
            existing?.selectedPlanCode ||
            existing?.planSelectedAt,
        ),
      ),
      status: existing?.status ?? SellerWorkspaceStatus.ACTIVE,
      planSelectedAt:
        bootstrap?.selectedPlanCode &&
        bootstrap.selectedPlanCode !== existing?.selectedPlanCode
          ? new Date()
          : (existing?.planSelectedAt ?? null),
      onboardingState: existing?.onboardingState ?? null,
      channelState: existing?.channelState ?? null,
      metadata: bootstrap?.metadata
        ? { ...(existing?.metadata || {}), ...bootstrap.metadata }
        : (existing?.metadata ?? null),
    });

    return this.sellerWorkspacesRepository.save(workspace);
  }

  private resolvePrimaryVendorId(
    stores: SellerWorkspaceStoreSummaryDto[],
    requestedVendorId?: number | null,
  ): number | null {
    if (requestedVendorId == null) {
      return stores[0]?.vendorId ?? null;
    }

    const match = stores.find((store) => store.vendorId === requestedVendorId);
    if (!match) {
      throw new ForbiddenException(
        `Seller workspace cannot select vendor ${requestedVendorId} without access`,
      );
    }

    return match.vendorId;
  }

  private resolvePrimaryRetailTenantId(
    branches: SellerWorkspaceBranchSummaryDto[],
    requestedTenantId?: number | null,
  ): number | null {
    const availableTenantIds = Array.from(
      new Set(
        branches
          .map((branch) => branch.retailTenantId)
          .filter((tenantId): tenantId is number => Number.isInteger(tenantId)),
      ),
    );

    if (requestedTenantId == null) {
      return availableTenantIds[0] ?? null;
    }

    if (!availableTenantIds.includes(requestedTenantId)) {
      throw new ForbiddenException(
        `Seller workspace cannot select tenant ${requestedTenantId} without access`,
      );
    }

    return requestedTenantId;
  }

  private assertTenantAccess(
    branches: SellerWorkspaceBranchSummaryDto[],
    tenantId: number,
  ): void {
    const tenantIds = new Set(
      branches
        .map((branch) => branch.retailTenantId)
        .filter((value): value is number => Number.isInteger(value)),
    );

    if (!tenantIds.has(tenantId)) {
      throw new ForbiddenException(
        `Seller workspace cannot target tenant ${tenantId} without access`,
      );
    }
  }

  private resolveTargetTenantIdForBranchCreation(
    branches: Array<{
      retailTenantId: number | null;
      isOwner: boolean;
      isTenantOwner: boolean;
    }>,
    requestedTenantId?: number | null,
  ): number {
    const tenantIds = Array.from(
      new Set(
        branches
          .map((branch) => branch.retailTenantId)
          .filter((tenantId): tenantId is number => Number.isInteger(tenantId)),
      ),
    );

    if (!tenantIds.length) {
      throw new ForbiddenException(
        'This account is not linked to a retail tenant that can host another branch.',
      );
    }

    if (requestedTenantId != null) {
      if (tenantIds.includes(requestedTenantId)) {
        return requestedTenantId;
      }

      throw new ForbiddenException(
        `Seller workspace cannot target tenant ${requestedTenantId} without access`,
      );
    }

    if (tenantIds.length === 1) {
      return tenantIds[0];
    }

    const ownedTenantIds = Array.from(
      new Set(
        branches
          .filter((branch) => branch.isOwner || branch.isTenantOwner)
          .map((branch) => branch.retailTenantId)
          .filter((tenantId): tenantId is number => Number.isInteger(tenantId)),
      ),
    );

    if (ownedTenantIds.length === 1) {
      return ownedTenantIds[0];
    }

    throw new BadRequestException(
      'Branch creation is ambiguous across multiple retail tenants. Set a primary retail tenant in Seller HQ first.',
    );
  }

  private canCreateBranchWorkspaceForTenant(
    user: Pick<User, 'roles'>,
    branches: Array<{
      retailTenantId: number | null;
      isOwner: boolean;
      isTenantOwner: boolean;
    }>,
    tenantId: number,
  ): boolean {
    const normalizedRoles = new Set(
      (user.roles ?? []).map((role) =>
        String(role || '')
          .trim()
          .toUpperCase(),
      ),
    );

    if (
      normalizedRoles.has(UserRole.ADMIN) ||
      normalizedRoles.has(UserRole.SUPER_ADMIN)
    ) {
      return true;
    }

    return branches.some(
      (branch) =>
        branch.retailTenantId === tenantId &&
        (branch.isOwner || branch.isTenantOwner),
    );
  }

  private normalizeRequiredString(
    value: string | null | undefined,
    message: string,
  ) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private normalizeOptionalString(value?: string | null): string | null {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private async generateUniqueBranchCode(
    branchesRepository: Repository<Branch>,
    branchName: string,
  ): Promise<string> {
    const base =
      branchName
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((token) => token.slice(0, 3))
        .join('')
        .slice(0, 9) || 'BRANCH';

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const suffix = `${Date.now()}`.slice(-6);
      const code = `${base}-${suffix}${attempt ? `-${attempt}` : ''}`.slice(
        0,
        64,
      );
      const existing = await branchesRepository.findOne({ where: { code } });
      if (!existing) {
        return code;
      }
    }

    throw new ConflictException(
      'A branch with this name or generated code already exists in the tenant.',
    );
  }
  private resolvePersistedBillingStatus(
    subscriptions: TenantSubscription[],
    hasSelectedPlan: boolean,
  ): SellerWorkspaceBillingStatus {
    const rankedSubscriptions = [...subscriptions].sort((left, right) => {
      return (
        this.subscriptionPriority(right.status) -
        this.subscriptionPriority(left.status)
      );
    });
    const current = rankedSubscriptions[0];

    switch (current?.status) {
      case TenantSubscriptionStatus.ACTIVE:
        return SellerWorkspaceBillingStatus.ACTIVE;
      case TenantSubscriptionStatus.TRIAL:
        return SellerWorkspaceBillingStatus.TRIAL;
      case TenantSubscriptionStatus.PAST_DUE:
        return SellerWorkspaceBillingStatus.PAST_DUE;
      case TenantSubscriptionStatus.CANCELLED:
        return SellerWorkspaceBillingStatus.CANCELLED;
      default:
        return hasSelectedPlan
          ? SellerWorkspaceBillingStatus.PLAN_SELECTED
          : SellerWorkspaceBillingStatus.NOT_STARTED;
    }
  }

  private upsertProgressStateEntry(
    state: SellerWorkspaceProgressState | null | undefined,
    key: string,
    value: {
      completed?: boolean;
      connected?: boolean;
      requested?: boolean;
      detail?: string | null;
    },
  ): SellerWorkspaceProgressState {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      throw new BadRequestException('A valid state key is required');
    }

    return {
      ...(state || {}),
      [normalizedKey]: {
        ...((state || {})[normalizedKey] || {}),
        ...value,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  private applyDerivedWorkspaceState(
    workspace: SellerWorkspace,
    subscriptions: TenantSubscription[],
  ): SellerWorkspace {
    return {
      ...workspace,
      billingStatus: this.resolvePersistedBillingStatus(
        subscriptions,
        Boolean(workspace.selectedPlanCode || workspace.planSelectedAt),
      ),
    };
  }

  private normalizePlanCode(planCode: string): SellerPlanCode {
    const normalized = String(planCode || '')
      .trim()
      .toUpperCase();
    if (!Object.values(SellerPlanCode).includes(normalized as SellerPlanCode)) {
      throw new BadRequestException(
        `Unsupported seller plan code: ${planCode}`,
      );
    }

    return normalized as SellerPlanCode;
  }

  private normalizeOptionalPlanCode(
    planCode?: string | null,
  ): SellerPlanCode | null {
    if (planCode == null || String(planCode).trim() === '') {
      return null;
    }
    return this.normalizePlanCode(planCode);
  }

  private serializeWorkspace(
    workspace: SellerWorkspace | null | undefined,
  ): SellerWorkspaceStateResponseDto {
    if (!workspace) {
      throw new NotFoundException('Seller workspace was not initialized');
    }

    return {
      id: workspace.id,
      ownerUserId: workspace.ownerUserId,
      primaryVendorId: workspace.primaryVendorId ?? null,
      primaryRetailTenantId: workspace.primaryRetailTenantId ?? null,
      selectedPlanCode:
        this.normalizeOptionalPlanCode(workspace.selectedPlanCode) ?? null,
      billingStatus:
        workspace.billingStatus as unknown as SellerWorkspaceBillingStatusDto,
      status: workspace.status as unknown as SellerWorkspaceStatusDto,
      planSelectedAt: workspace.planSelectedAt ?? null,
      onboardingState: workspace.onboardingState ?? null,
      channelState: workspace.channelState ?? null,
      metadata: workspace.metadata ?? null,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }
  async updateBranchWorkspace(
    userId: number,
    branchId: number,
    dto: UpdateBranchWorkspaceDto,
  ): Promise<SellerWorkspaceBranchWorkspaceDto> {
    const branchRepo =
      this.sellerWorkspacesRepository.manager.getRepository(Branch);
    const branch = await branchRepo.findOne({
      where: { id: branchId },
      relations: ['retailTenant', 'retailTenant.owner'],
    });
    if (!branch) {
      throw new NotFoundException(
        `Branch workspace with ID ${branchId} not found.`,
      );
    }
    const isOwner =
      branch.ownerId === userId || branch.retailTenant?.owner?.id === userId;
    if (!isOwner) {
      throw new ForbiddenException(
        'Only the branch or tenant owner can update branch details.',
      );
    }
    const updates: Partial<Branch> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.address !== undefined) updates.address = dto.address;
    if (dto.city !== undefined) updates.city = dto.city;
    if (dto.country !== undefined) updates.country = dto.country;
    if (dto.timezone !== undefined) updates.timezone = dto.timezone;
    if (Object.keys(updates).length > 0) {
      await branchRepo.update(branchId, updates);
    }
    const refreshed = await this.getBranchWorkspaces(userId);
    const updatedWorkspace = refreshed.items.find(
      (item) => item.branchId === branchId,
    );
    if (!updatedWorkspace) {
      throw new NotFoundException(
        'Updated branch workspace could not be resolved.',
      );
    }
    return updatedWorkspace;
  }

  async updateBranchWorkspaceServiceFormat(
    userId: number,
    branchId: number,
    dto: UpdateBranchServiceFormatDto,
  ): Promise<SellerWorkspaceBranchWorkspaceDto> {
    const branch = await this.sellerWorkspacesRepository.manager
      .getRepository(Branch)
      .findOne({
        where: { id: branchId },
        relations: ['retailTenant', 'retailTenant.owner'],
      });
    if (!branch) {
      throw new NotFoundException(
        `Branch workspace with ID ${branchId} not found.`,
      );
    }
    const tenantId = branch.retailTenantId;
    const posCoreEntitlement =
      await this.tenantModuleEntitlementsRepository.findOne({
        where: {
          tenantId,
          module: RetailModule.POS_CORE,
        },
      });
    const normalizedServiceFormat = assertAllowedSelfServeServiceFormat(
      dto.serviceFormat,
      'Branch service format update',
      resolveAllowedSelfServeServiceFormats(
        getPosCoreEntitlement([posCoreEntitlement].filter(Boolean)),
      ),
    );
    await this.sellerWorkspacesRepository.manager
      .getRepository(Branch)
      .update(branchId, { serviceFormat: normalizedServiceFormat });
    branch.serviceFormat = normalizedServiceFormat;
    const refreshed = await this.getBranchWorkspaces(userId);
    const updatedWorkspace = refreshed.items.find(
      (item) => item.branchId === branchId,
    );
    if (!updatedWorkspace) {
      throw new NotFoundException(
        'Updated branch workspace could not be resolved.',
      );
    }
    return updatedWorkspace;
  }
}
