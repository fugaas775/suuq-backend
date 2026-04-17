import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  Category,
  PosUserFitCategory,
} from '../categories/entities/category.entity';
import { User } from '../users/entities/user.entity';
import { CreateRetailTenantDto } from './dto/create-retail-tenant.dto';
import { ApplyRetailPlanPresetDto } from './dto/apply-retail-plan-preset.dto';
import { CreateTenantSubscriptionDto } from './dto/create-tenant-subscription.dto';
import { ListRetailTenantsQueryDto } from './dto/list-retail-tenants-query.dto';
import { UpdateRetailTenantOnboardingProfileDto } from './dto/update-retail-tenant-onboarding-profile.dto';
import {
  AppliedRetailPlanPresetResponseDto,
  RetailPlanPresetResponseDto,
} from './dto/retail-plan-preset-response.dto';
import { UpsertTenantModuleEntitlementDto } from './dto/upsert-tenant-module-entitlement.dto';
import {
  RetailTenantOnboardingProfile,
  RetailTenant,
  RetailTenantStatus,
} from './entities/retail-tenant.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from './entities/tenant-module-entitlement.entity';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';
import {
  findRetailPlanPreset,
  RETAIL_PLAN_PRESETS,
  RetailPlanPreset,
} from './retail-plan-presets';

type PosWorkspaceStatus =
  | 'ACTIVE'
  | 'TENANT_SETUP_REQUIRED'
  | 'TENANT_INACTIVE'
  | 'MODULE_SETUP_REQUIRED'
  | 'PAYMENT_REQUIRED'
  | 'TRIAL'
  | 'PAST_DUE'
  | 'EXPIRED'
  | 'CANCELLED';

const MILLISECONDS_PER_DAY = 86_400_000;

type RetailTenantWithPosWorkspaceAudit = RetailTenant & {
  posWorkspaceAudit: {
    provisioningSource: 'POS_SELF_SERVE' | 'ADMIN_OR_BACKOFFICE';
    onboardingStatus:
      | 'ACTIVE'
      | 'BILLING_ACTIVATION_REQUIRED'
      | 'BILLING_RESTRICTED'
      | 'MODULE_SETUP_REQUIRED'
      | 'TENANT_INACTIVE'
      | 'NO_BRANCH_WORKSPACE';
    activationStatus:
      | 'ACTIVATED'
      | 'TRIAL'
      | 'PENDING_MONTHLY_BILLING'
      | 'PAST_DUE'
      | 'EXPIRED'
      | 'CANCELLED'
      | 'MODULE_SETUP_REQUIRED'
      | 'TENANT_INACTIVE'
      | 'NO_BRANCH_WORKSPACE';
    nextBillingStep: string;
    ownerEmail: string | null;
    billingEmail: string | null;
    latestSubscriptionStatus: TenantSubscriptionStatus | null;
    latestPlanCode: string | null;
    workspaceCount: number;
    activeWorkspaceCount: number;
    activationRequiredCount: number;
    branchWorkspaces: Array<{
      branchId: number;
      branchName: string;
      branchCode: string | null;
      workspaceStatus: PosWorkspaceStatus;
      subscriptionStatus: TenantSubscriptionStatus | null;
      planCode: string | null;
      isSelfServeProvisioned: boolean;
      trialStartedAt: string | null;
      trialEndsAt: string | null;
      trialDaysRemaining: number | null;
    }>;
  };
};

@Injectable()
export class RetailEntitlementsService {
  constructor(
    @InjectRepository(RetailTenant)
    private readonly retailTenantsRepository: Repository<RetailTenant>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(TenantSubscription)
    private readonly tenantSubscriptionsRepository: Repository<TenantSubscription>,
    @InjectRepository(TenantModuleEntitlement)
    private readonly tenantModuleEntitlementsRepository: Repository<TenantModuleEntitlement>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async createTenant(dto: CreateRetailTenantDto): Promise<RetailTenant> {
    if (dto.ownerUserId != null) {
      const owner = await this.usersRepository.findOne({
        where: { id: dto.ownerUserId },
      });
      if (!owner) {
        throw new NotFoundException(
          `User with ID ${dto.ownerUserId} not found`,
        );
      }
    }

    const tenant = this.retailTenantsRepository.create({
      name: dto.name,
      code: dto.code?.trim() || null,
      billingEmail: dto.billingEmail?.trim() || null,
      defaultCurrency: dto.defaultCurrency?.trim() || null,
      ownerUserId: dto.ownerUserId ?? null,
      status: RetailTenantStatus.ACTIVE,
    });

    await this.retailTenantsRepository.save(tenant);
    return this.findTenantOrThrow(tenant.id);
  }

  async listTenants(
    query: ListRetailTenantsQueryDto = {},
  ): Promise<RetailTenantWithPosWorkspaceAudit[]> {
    const tenants = await this.retailTenantsRepository.find({
      order: { createdAt: 'DESC' },
      relations: {
        owner: true,
        branches: true,
        subscriptions: true,
        entitlements: true,
      },
    });

    return tenants
      .map((tenant) => this.decorateTenantWithPosWorkspaceAudit(tenant))
      .filter((tenant) => {
        if (
          query.provisioningSource &&
          tenant.posWorkspaceAudit.provisioningSource !==
            query.provisioningSource
        ) {
          return false;
        }

        if (
          query.activationStatus &&
          tenant.posWorkspaceAudit.activationStatus !== query.activationStatus
        ) {
          return false;
        }

        return true;
      });
  }

  async getTenant(id: number): Promise<RetailTenantWithPosWorkspaceAudit> {
    const tenant = await this.findTenantOrThrow(id);
    return this.decorateTenantWithPosWorkspaceAudit(tenant);
  }

  listPlanPresets(): RetailPlanPresetResponseDto[] {
    return RETAIL_PLAN_PRESETS.map((preset) => this.mapPlanPreset(preset));
  }

  async assignBranchToTenant(
    branchId: number,
    retailTenantId: number,
  ): Promise<Branch> {
    const [branch, tenant] = await Promise.all([
      this.branchesRepository.findOne({ where: { id: branchId } }),
      this.retailTenantsRepository.findOne({ where: { id: retailTenantId } }),
    ]);

    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found`);
    }

    if (!tenant) {
      throw new NotFoundException(
        `Retail tenant with ID ${retailTenantId} not found`,
      );
    }

    branch.retailTenantId = retailTenantId;
    await this.branchesRepository.save(branch);
    return this.findBranchOrThrow(branchId);
  }

  async createSubscription(
    tenantId: number,
    dto: CreateTenantSubscriptionDto,
  ): Promise<TenantSubscription> {
    await this.findTenantOrThrow(tenantId);

    const subscription = this.tenantSubscriptionsRepository.create({
      tenantId,
      planCode: dto.planCode.trim(),
      status: dto.status,
      billingInterval: dto.billingInterval ?? TenantBillingInterval.MONTHLY,
      amount: dto.amount ?? null,
      currency: dto.currency?.trim() || null,
      startsAt: new Date(dto.startsAt),
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      autoRenew: dto.autoRenew ?? false,
    });

    return this.tenantSubscriptionsRepository.save(subscription);
  }

  async updateOnboardingProfile(
    tenantId: number,
    dto: UpdateRetailTenantOnboardingProfileDto,
    auditUser?: { id: number | null; email: string | null },
  ): Promise<RetailTenantWithPosWorkspaceAudit> {
    const tenant = await this.findTenantOrThrow(tenantId);

    tenant.onboardingProfile = await this.normalizeOnboardingProfile(dto);
    await this.retailTenantsRepository.save(tenant);

    const refreshedTenant = await this.findTenantOrThrow(tenantId);
    return this.decorateTenantWithPosWorkspaceAudit(refreshedTenant);
  }

  async applyPlanPreset(
    tenantId: number,
    dto: ApplyRetailPlanPresetDto,
  ): Promise<AppliedRetailPlanPresetResponseDto> {
    const preset = this.findPlanPresetOrThrow(dto.presetCode);
    await this.findTenantOrThrow(tenantId);

    const subscription = await this.createSubscription(tenantId, {
      planCode: preset.code,
      status: dto.status ?? preset.defaultStatus,
      billingInterval: dto.billingInterval ?? preset.billingInterval,
      amount: dto.amount ?? preset.amount,
      currency: dto.currency ?? preset.currency,
      startsAt: dto.startsAt ?? new Date().toISOString(),
      endsAt: dto.endsAt,
      autoRenew: dto.autoRenew ?? true,
    });

    const entitlements = await Promise.all(
      preset.modules.map((moduleConfig) =>
        this.upsertModuleEntitlement(tenantId, moduleConfig.module, {
          enabled: moduleConfig.enabled,
          reason: moduleConfig.reason,
          metadata: moduleConfig.metadata ?? undefined,
        }),
      ),
    );

    return {
      preset: this.mapPlanPreset(preset),
      subscription,
      entitlements,
    };
  }

  async upsertModuleEntitlement(
    tenantId: number,
    module: RetailModule,
    dto: UpsertTenantModuleEntitlementDto,
  ): Promise<TenantModuleEntitlement> {
    await this.findTenantOrThrow(tenantId);

    const existing = await this.tenantModuleEntitlementsRepository.findOne({
      where: { tenantId, module },
    });

    const entitlement =
      existing ??
      this.tenantModuleEntitlementsRepository.create({
        tenantId,
        module,
      });

    entitlement.enabled = dto.enabled;
    entitlement.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    entitlement.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    entitlement.reason = dto.reason ?? null;
    entitlement.metadata = this.normalizeModuleMetadata(module, dto.metadata);

    return this.tenantModuleEntitlementsRepository.save(entitlement);
  }

  async assertBranchHasModules(
    branchId: number,
    modules: RetailModule[],
  ): Promise<{
    branch: Branch;
    tenant: RetailTenant;
    entitlements: TenantModuleEntitlement[];
  }> {
    if (modules.length === 0) {
      throw new BadRequestException('At least one retail module is required');
    }

    const workspace = await this.getBranchWorkspaceStatus(branchId);

    if (!workspace.tenant) {
      throw new ForbiddenException(
        `Branch ${branchId} is not assigned to a Retail OS tenant`,
      );
    }

    if (
      workspace.workspaceStatus !== 'ACTIVE' &&
      workspace.workspaceStatus !== 'TRIAL'
    ) {
      throw new ForbiddenException(
        `Retail tenant ${workspace.tenant.id} does not have an active POS workspace for branch ${branchId}`,
      );
    }

    const entitlements = workspace.entitlements;

    for (const module of modules) {
      const entitlement = entitlements.find((entry) => entry.module === module);
      if (!entitlement || !entitlement.enabled) {
        throw new ForbiddenException(
          `Retail tenant ${workspace.tenant.id} is not entitled to module ${module}`,
        );
      }
    }

    return {
      branch: workspace.branch,
      tenant: workspace.tenant,
      entitlements,
    };
  }

  async hasActiveBranchModules(
    branchId: number,
    modules: RetailModule[],
  ): Promise<boolean> {
    try {
      await this.assertBranchHasModules(branchId, modules);
      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        return false;
      }

      throw error;
    }
  }

  async getActiveBranchRetailAccess(branchId: number): Promise<{
    branch: Branch;
    tenant: RetailTenant;
    entitlements: TenantModuleEntitlement[];
  }> {
    const workspace = await this.getBranchWorkspaceStatus(branchId);

    if (!workspace.tenant) {
      throw new ForbiddenException(
        `Branch ${branchId} is not assigned to a Retail OS tenant`,
      );
    }

    if (
      workspace.workspaceStatus !== 'ACTIVE' &&
      workspace.workspaceStatus !== 'TRIAL'
    ) {
      throw new ForbiddenException(
        `Retail tenant ${workspace.tenant.id} does not have an active subscription for branch ${branchId}`,
      );
    }

    return {
      branch: workspace.branch,
      tenant: workspace.tenant,
      entitlements: workspace.entitlements,
    };
  }

  async getBranchWorkspaceStatus(branchId: number): Promise<{
    branch: Branch;
    tenant: RetailTenant | null;
    subscription: TenantSubscription | null;
    entitlements: TenantModuleEntitlement[];
    hasPosModule: boolean;
    workspaceStatus: PosWorkspaceStatus;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    trialDaysRemaining: number | null;
  }> {
    const branch = await this.findBranchOrThrow(branchId);

    if (!branch.retailTenantId) {
      return {
        branch,
        tenant: null,
        subscription: null,
        entitlements: [],
        hasPosModule: false,
        workspaceStatus: 'TENANT_SETUP_REQUIRED',
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
      };
    }

    const tenant = await this.findTenantOrThrow(branch.retailTenantId);
    const subscription = await this.tenantSubscriptionsRepository.findOne({
      where: { tenantId: tenant.id },
      order: { createdAt: 'DESC' },
    });
    const now = Date.now();
    const effectiveSubscriptionStatus = this.resolveEffectiveSubscriptionStatus(
      subscription,
      now,
    );
    const trialMetadata = this.getTrialMetadata(subscription, now);
    const entitlements = (
      await this.tenantModuleEntitlementsRepository.find({
        where: { tenantId: tenant.id },
      })
    ).filter((entitlement) => {
      if (!entitlement.enabled) {
        return false;
      }

      if (entitlement.startsAt && entitlement.startsAt.getTime() > now) {
        return false;
      }

      if (entitlement.expiresAt && entitlement.expiresAt.getTime() < now) {
        return false;
      }

      return true;
    });
    const hasPosModule = entitlements.some(
      (entitlement) => entitlement.module === RetailModule.POS_CORE,
    );

    if (tenant.status !== RetailTenantStatus.ACTIVE) {
      return {
        branch,
        tenant,
        subscription,
        entitlements,
        hasPosModule,
        workspaceStatus: 'TENANT_INACTIVE',
        ...trialMetadata,
      };
    }

    if (!hasPosModule) {
      return {
        branch,
        tenant,
        subscription,
        entitlements,
        hasPosModule,
        workspaceStatus: 'MODULE_SETUP_REQUIRED',
        ...trialMetadata,
      };
    }

    if (!subscription) {
      return {
        branch,
        tenant,
        subscription: null,
        entitlements,
        hasPosModule,
        workspaceStatus: 'PAYMENT_REQUIRED',
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
      };
    }

    const subscriptionStatusMap: Record<
      TenantSubscriptionStatus,
      'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED'
    > = {
      [TenantSubscriptionStatus.ACTIVE]: 'ACTIVE',
      [TenantSubscriptionStatus.TRIAL]: 'TRIAL',
      [TenantSubscriptionStatus.PAST_DUE]: 'PAST_DUE',
      [TenantSubscriptionStatus.EXPIRED]: 'EXPIRED',
      [TenantSubscriptionStatus.CANCELLED]: 'CANCELLED',
    };

    const nextSubscription =
      effectiveSubscriptionStatus &&
      effectiveSubscriptionStatus !== subscription.status
        ? { ...subscription, status: effectiveSubscriptionStatus }
        : subscription;

    return {
      branch,
      tenant,
      subscription: nextSubscription,
      entitlements,
      hasPosModule,
      workspaceStatus: subscriptionStatusMap[effectiveSubscriptionStatus],
      ...trialMetadata,
    };
  }

  async getActiveBranchModuleEntitlement(
    branchId: number,
    module: RetailModule,
  ): Promise<TenantModuleEntitlement | null> {
    try {
      const access = await this.assertBranchHasModules(branchId, [module]);
      return (
        access.entitlements.find((entry) => entry.module === module) ?? null
      );
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        return null;
      }

      throw error;
    }
  }

  private async findTenantOrThrow(id: number): Promise<RetailTenant> {
    const tenant = await this.retailTenantsRepository.findOne({
      where: { id },
      relations: {
        owner: true,
        branches: true,
        subscriptions: true,
        entitlements: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Retail tenant with ID ${id} not found`);
    }

    return tenant;
  }

  private async findBranchOrThrow(id: number): Promise<Branch> {
    const branch = await this.branchesRepository.findOne({
      where: { id },
      relations: { retailTenant: true },
    });

    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }

    return branch;
  }

  private findPlanPresetOrThrow(code: string): RetailPlanPreset {
    const preset = findRetailPlanPreset(code.trim());
    if (!preset) {
      throw new NotFoundException(`Retail plan preset ${code} not found`);
    }

    return preset;
  }

  private mapPlanPreset(preset: RetailPlanPreset): RetailPlanPresetResponseDto {
    return {
      code: preset.code,
      name: preset.name,
      description: preset.description,
      billingInterval: preset.billingInterval,
      amount: preset.amount,
      currency: preset.currency,
      defaultStatus: preset.defaultStatus,
      modules: preset.modules.map((module) => ({
        module: module.module,
        enabled: module.enabled,
        reason: module.reason,
        metadata: module.metadata ?? null,
      })),
    };
  }

  private async normalizeOnboardingProfile(
    dto: UpdateRetailTenantOnboardingProfileDto,
  ): Promise<RetailTenantOnboardingProfile> {
    const normalizeValue = (value?: string | null) => {
      const trimmedValue = String(value ?? '').trim();
      return trimmedValue ? trimmedValue : null;
    };
    const normalizeUserFit = (
      value?: PosUserFitCategory | null,
    ): PosUserFitCategory | null => {
      const normalizedValue = normalizeValue(value);
      return normalizedValue &&
        Object.values(PosUserFitCategory).includes(
          normalizedValue as PosUserFitCategory,
        )
        ? (normalizedValue as PosUserFitCategory)
        : null;
    };

    const categoryId = Number.isFinite(Number(dto.categoryId))
      ? Number(dto.categoryId)
      : null;
    let category: Category | null = null;

    if (categoryId) {
      category = await this.categoriesRepository.findOne({
        where: { id: categoryId },
        relations: { parent: true },
      });

      if (!category) {
        throw new NotFoundException(`Category with ID ${categoryId} not found`);
      }
    }

    const suggestedUserFit = category?.posSuggestedUserFit ?? null;

    return {
      categoryId: category?.id ?? null,
      categorySlug: category?.slug ?? null,
      categoryName: category?.name ?? null,
      userFit: normalizeUserFit(dto.userFit),
      suggestedUserFit,
      notes: normalizeValue(dto.notes),
    };
  }

  private resolveEffectiveSubscriptionStatus(
    subscription: TenantSubscription | null,
    now: number,
  ): TenantSubscriptionStatus | null {
    if (!subscription) {
      return null;
    }

    const endsAt = subscription.endsAt?.getTime() ?? null;

    if (
      endsAt != null &&
      endsAt < now &&
      (subscription.status === TenantSubscriptionStatus.ACTIVE ||
        subscription.status === TenantSubscriptionStatus.TRIAL)
    ) {
      return TenantSubscriptionStatus.EXPIRED;
    }

    return subscription.status;
  }

  private getTrialMetadata(
    subscription: TenantSubscription | null,
    now: number,
  ): {
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    trialDaysRemaining: number | null;
  } {
    if (!subscription) {
      return {
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
      };
    }

    const trialStartedAt = subscription.startsAt
      ? subscription.startsAt.toISOString()
      : null;
    const trialEndsAt = subscription.endsAt
      ? subscription.endsAt.toISOString()
      : null;
    const isTrialSubscription =
      subscription.status === TenantSubscriptionStatus.TRIAL ||
      String(
        subscription.metadata?.lastActivationPaymentMethod || '',
      ).toUpperCase() === 'TRIAL';

    if (!isTrialSubscription) {
      return {
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
      };
    }

    const trialDaysRemaining = trialEndsAt
      ? Math.max(
          0,
          Math.ceil((Date.parse(trialEndsAt) - now) / MILLISECONDS_PER_DAY),
        )
      : null;

    return {
      trialStartedAt,
      trialEndsAt,
      trialDaysRemaining,
    };
  }

  private decorateTenantWithPosWorkspaceAudit(
    tenant: RetailTenant,
  ): RetailTenantWithPosWorkspaceAudit {
    const latestSubscription = this.getLatestTenantSubscription(tenant);
    const trialMetadata = this.getTrialMetadata(latestSubscription, Date.now());
    const provisioningSource: 'POS_SELF_SERVE' | 'ADMIN_OR_BACKOFFICE' =
      this.isSelfServeProvisioned(tenant)
        ? 'POS_SELF_SERVE'
        : 'ADMIN_OR_BACKOFFICE';
    const branchWorkspaces = (tenant.branches ?? []).map((branch) => {
      const workspaceStatus = this.resolveTenantWorkspaceStatus(
        tenant,
        latestSubscription,
      );
      return {
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code ?? null,
        workspaceStatus,
        subscriptionStatus: latestSubscription?.status ?? null,
        planCode: latestSubscription?.planCode ?? null,
        isSelfServeProvisioned: provisioningSource === 'POS_SELF_SERVE',
        trialStartedAt: trialMetadata.trialStartedAt,
        trialEndsAt: trialMetadata.trialEndsAt,
        trialDaysRemaining: trialMetadata.trialDaysRemaining,
      };
    });
    const activationRequiredCount = branchWorkspaces.filter(
      (workspace) => workspace.workspaceStatus === 'PAYMENT_REQUIRED',
    ).length;
    const activeWorkspaceCount = branchWorkspaces.filter((workspace) =>
      ['ACTIVE', 'TRIAL'].includes(workspace.workspaceStatus),
    ).length;
    const primaryWorkspaceStatus =
      branchWorkspaces[0]?.workspaceStatus ?? 'TENANT_SETUP_REQUIRED';
    const auditStatus = this.mapAuditStatus(primaryWorkspaceStatus);

    return Object.assign(tenant, {
      posWorkspaceAudit: {
        provisioningSource,
        onboardingStatus: auditStatus.onboardingStatus,
        activationStatus: auditStatus.activationStatus,
        nextBillingStep: this.describeNextBillingStep(
          primaryWorkspaceStatus,
          latestSubscription,
        ),
        ownerEmail: tenant.owner?.email ?? tenant.billingEmail ?? null,
        billingEmail: tenant.billingEmail ?? null,
        latestSubscriptionStatus: latestSubscription?.status ?? null,
        latestPlanCode: latestSubscription?.planCode ?? null,
        workspaceCount: branchWorkspaces.length,
        activeWorkspaceCount,
        activationRequiredCount,
        branchWorkspaces,
      },
    });
  }

  private getLatestTenantSubscription(
    tenant: RetailTenant,
  ): TenantSubscription | null {
    const subscriptions = Array.isArray(tenant.subscriptions)
      ? [...tenant.subscriptions]
      : [];

    if (subscriptions.length === 0) {
      return null;
    }

    return subscriptions.sort((left, right) => {
      const leftTime = new Date(left.startsAt ?? left.createdAt ?? 0).getTime();
      const rightTime = new Date(
        right.startsAt ?? right.createdAt ?? 0,
      ).getTime();
      return rightTime - leftTime;
    })[0];
  }

  private isSelfServeProvisioned(tenant: RetailTenant): boolean {
    return (tenant.entitlements ?? []).some((entitlement) =>
      String(entitlement.reason ?? '')
        .toLowerCase()
        .includes('self-serve onboarding'),
    );
  }

  private resolveTenantWorkspaceStatus(
    tenant: RetailTenant,
    latestSubscription: TenantSubscription | null,
  ): PosWorkspaceStatus {
    const now = Date.now();
    const hasPosModule = (tenant.entitlements ?? []).some((entitlement) => {
      if (
        entitlement.module !== RetailModule.POS_CORE ||
        !entitlement.enabled
      ) {
        return false;
      }

      if (entitlement.startsAt && entitlement.startsAt.getTime() > now) {
        return false;
      }

      if (entitlement.expiresAt && entitlement.expiresAt.getTime() < now) {
        return false;
      }

      return true;
    });

    if ((tenant.branches ?? []).length === 0) {
      return 'TENANT_SETUP_REQUIRED';
    }

    if (tenant.status !== RetailTenantStatus.ACTIVE) {
      return 'TENANT_INACTIVE';
    }

    if (!hasPosModule) {
      return 'MODULE_SETUP_REQUIRED';
    }

    if (!latestSubscription) {
      return 'PAYMENT_REQUIRED';
    }

    switch (latestSubscription.status) {
      case TenantSubscriptionStatus.ACTIVE:
        return 'ACTIVE';
      case TenantSubscriptionStatus.TRIAL:
        return 'TRIAL';
      case TenantSubscriptionStatus.PAST_DUE:
        return 'PAST_DUE';
      case TenantSubscriptionStatus.EXPIRED:
        return 'EXPIRED';
      case TenantSubscriptionStatus.CANCELLED:
        return 'CANCELLED';
      default:
        return 'PAYMENT_REQUIRED';
    }
  }

  private mapAuditStatus(workspaceStatus: PosWorkspaceStatus): {
    onboardingStatus: RetailTenantWithPosWorkspaceAudit['posWorkspaceAudit']['onboardingStatus'];
    activationStatus: RetailTenantWithPosWorkspaceAudit['posWorkspaceAudit']['activationStatus'];
  } {
    switch (workspaceStatus) {
      case 'ACTIVE':
        return {
          onboardingStatus: 'ACTIVE',
          activationStatus: 'ACTIVATED',
        };
      case 'TRIAL':
        return {
          onboardingStatus: 'ACTIVE',
          activationStatus: 'TRIAL',
        };
      case 'PAYMENT_REQUIRED':
        return {
          onboardingStatus: 'BILLING_ACTIVATION_REQUIRED',
          activationStatus: 'PENDING_MONTHLY_BILLING',
        };
      case 'PAST_DUE':
        return {
          onboardingStatus: 'BILLING_RESTRICTED',
          activationStatus: 'PAST_DUE',
        };
      case 'EXPIRED':
        return {
          onboardingStatus: 'BILLING_RESTRICTED',
          activationStatus: 'EXPIRED',
        };
      case 'CANCELLED':
        return {
          onboardingStatus: 'BILLING_RESTRICTED',
          activationStatus: 'CANCELLED',
        };
      case 'MODULE_SETUP_REQUIRED':
        return {
          onboardingStatus: 'MODULE_SETUP_REQUIRED',
          activationStatus: 'MODULE_SETUP_REQUIRED',
        };
      case 'TENANT_INACTIVE':
        return {
          onboardingStatus: 'TENANT_INACTIVE',
          activationStatus: 'TENANT_INACTIVE',
        };
      default:
        return {
          onboardingStatus: 'NO_BRANCH_WORKSPACE',
          activationStatus: 'NO_BRANCH_WORKSPACE',
        };
    }
  }

  private describeNextBillingStep(
    workspaceStatus: PosWorkspaceStatus,
    latestSubscription: TenantSubscription | null,
  ): string {
    switch (workspaceStatus) {
      case 'ACTIVE':
        return 'No immediate billing action is required.';
      case 'TRIAL':
        return latestSubscription?.endsAt
          ? `Trial access is open now. Collect the first monthly POS payment before ${this.formatAuditDate(latestSubscription.endsAt)}.`
          : 'Trial access is open now. Collect the first monthly POS payment before the trial ends.';
      case 'PAYMENT_REQUIRED':
        return 'Collect the first monthly POS workspace activation payment before branch access can open in POS-S.';
      case 'PAST_DUE':
        return 'Collect the overdue monthly POS payment, then reactivate the branch workspace.';
      case 'EXPIRED':
        return 'Create a new monthly subscription or reactivation payment before reopening the branch workspace.';
      case 'CANCELLED':
        return 'Restore billing with a new monthly subscription before reopening the branch workspace.';
      case 'MODULE_SETUP_REQUIRED':
        return 'Enable POS_CORE entitlement before requesting billing activation.';
      case 'TENANT_INACTIVE':
        return 'Reactivate the retail tenant before attempting monthly billing activation.';
      default:
        return latestSubscription
          ? 'Review the latest monthly subscription and branch workspace status.'
          : 'Create the tenant branch workspace before billing activation can begin.';
    }
  }

  private formatAuditDate(value: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(value);
  }

  private normalizeModuleMetadata(
    module: RetailModule,
    metadata?: Record<string, any> | null,
  ): Record<string, any> | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return metadata ?? null;
    }

    if (module === RetailModule.INVENTORY_AUTOMATION) {
      const replenishmentPolicy = metadata.replenishmentPolicy;
      if (replenishmentPolicy == null) {
        return metadata;
      }

      if (
        typeof replenishmentPolicy !== 'object' ||
        Array.isArray(replenishmentPolicy)
      ) {
        throw new BadRequestException(
          'metadata.replenishmentPolicy must be an object',
        );
      }

      const normalizedPolicy = {
        ...replenishmentPolicy,
        submissionMode: this.normalizeSubmissionMode(
          replenishmentPolicy.submissionMode,
        ),
        preferredSupplierProfileId: this.normalizePreferredSupplierProfileId(
          replenishmentPolicy.preferredSupplierProfileId,
        ),
        minimumOrderTotal: this.normalizeMinimumOrderTotal(
          replenishmentPolicy.minimumOrderTotal,
        ),
        orderWindow: this.normalizeOrderWindow(replenishmentPolicy.orderWindow),
      };

      return {
        ...metadata,
        replenishmentPolicy: Object.fromEntries(
          Object.entries(normalizedPolicy).filter(([, value]) => value != null),
        ),
      };
    }

    if (module === RetailModule.HR_ATTENDANCE) {
      const hrAttendancePolicy = metadata.hrAttendancePolicy;
      if (hrAttendancePolicy == null) {
        return metadata;
      }

      if (
        typeof hrAttendancePolicy !== 'object' ||
        Array.isArray(hrAttendancePolicy)
      ) {
        throw new BadRequestException(
          'metadata.hrAttendancePolicy must be an object',
        );
      }

      const normalizedPolicy = {
        ...hrAttendancePolicy,
        shiftStartHour: this.normalizeHrAttendanceHour(
          hrAttendancePolicy.shiftStartHour,
          'shiftStartHour',
        ),
        shiftEndHour: this.normalizeHrAttendanceHour(
          hrAttendancePolicy.shiftEndHour,
          'shiftEndHour',
        ),
        gracePeriodMinutes: this.normalizeHrAttendanceGraceMinutes(
          hrAttendancePolicy.gracePeriodMinutes,
        ),
        overtimeThresholdHours: this.normalizeHrAttendanceOvertimeHours(
          hrAttendancePolicy.overtimeThresholdHours,
        ),
        timeZone:
          hrAttendancePolicy.timeZone == null
            ? undefined
            : this.normalizeTimeZone(hrAttendancePolicy.timeZone),
      };

      return {
        ...metadata,
        hrAttendancePolicy: Object.fromEntries(
          Object.entries(normalizedPolicy).filter(([, value]) => value != null),
        ),
      };
    }

    if (module !== RetailModule.AI_ANALYTICS) {
      return metadata;
    }

    const aiAnalyticsPolicy = metadata.aiAnalyticsPolicy;
    if (aiAnalyticsPolicy == null) {
      return metadata;
    }

    if (
      typeof aiAnalyticsPolicy !== 'object' ||
      Array.isArray(aiAnalyticsPolicy)
    ) {
      throw new BadRequestException(
        'metadata.aiAnalyticsPolicy must be an object',
      );
    }

    const normalizedPolicy = {
      ...aiAnalyticsPolicy,
      stalePurchaseOrderHours: this.normalizeAiAnalyticsHours(
        aiAnalyticsPolicy.stalePurchaseOrderHours,
      ),
      targetHealthScore: this.normalizeAiAnalyticsTargetScore(
        aiAnalyticsPolicy.targetHealthScore,
      ),
    };

    return {
      ...metadata,
      aiAnalyticsPolicy: Object.fromEntries(
        Object.entries(normalizedPolicy).filter(([, value]) => value != null),
      ),
    };
  }

  private normalizeSubmissionMode(
    rawSubmissionMode: unknown,
  ): string | undefined {
    if (rawSubmissionMode == null) {
      return undefined;
    }

    if (
      rawSubmissionMode !== 'DRAFT_ONLY' &&
      rawSubmissionMode !== 'AUTO_SUBMIT'
    ) {
      throw new BadRequestException(
        'metadata.replenishmentPolicy.submissionMode must be DRAFT_ONLY or AUTO_SUBMIT',
      );
    }

    return rawSubmissionMode;
  }

  private normalizePreferredSupplierProfileId(
    rawPreferredSupplierProfileId: unknown,
  ): number | undefined {
    if (rawPreferredSupplierProfileId == null) {
      return undefined;
    }

    if (
      !Number.isInteger(rawPreferredSupplierProfileId) ||
      Number(rawPreferredSupplierProfileId) < 1
    ) {
      throw new BadRequestException(
        'metadata.replenishmentPolicy.preferredSupplierProfileId must be a positive integer',
      );
    }

    return Number(rawPreferredSupplierProfileId);
  }

  private normalizeMinimumOrderTotal(
    rawMinimumOrderTotal: unknown,
  ): number | undefined {
    if (rawMinimumOrderTotal == null) {
      return undefined;
    }

    const normalizedValue = Number(rawMinimumOrderTotal);
    if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
      throw new BadRequestException(
        'metadata.replenishmentPolicy.minimumOrderTotal must be greater than zero',
      );
    }

    return Number(normalizedValue.toFixed(2));
  }

  private normalizeOrderWindow(
    rawOrderWindow: unknown,
  ): Record<string, any> | undefined {
    if (rawOrderWindow == null) {
      return undefined;
    }

    if (typeof rawOrderWindow !== 'object' || Array.isArray(rawOrderWindow)) {
      throw new BadRequestException(
        'metadata.replenishmentPolicy.orderWindow must be an object',
      );
    }

    const orderWindow = rawOrderWindow as Record<string, any>;

    const daysOfWeek =
      orderWindow.daysOfWeek == null
        ? undefined
        : this.normalizeDaysOfWeek(orderWindow.daysOfWeek);
    const startHour =
      orderWindow.startHour == null
        ? undefined
        : this.normalizeHour(orderWindow.startHour, 'startHour');
    const endHour =
      orderWindow.endHour == null
        ? undefined
        : this.normalizeHour(orderWindow.endHour, 'endHour');
    const timeZone =
      orderWindow.timeZone == null
        ? undefined
        : this.normalizeTimeZone(orderWindow.timeZone);

    return Object.keys({
      daysOfWeek,
      startHour,
      endHour,
      timeZone,
    }).reduce<Record<string, any>>((accumulator, key) => {
      const value = {
        daysOfWeek,
        startHour,
        endHour,
        timeZone,
      }[key];
      if (value != null) {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});
  }

  private normalizeDaysOfWeek(rawDaysOfWeek: unknown): number[] {
    if (!Array.isArray(rawDaysOfWeek)) {
      throw new BadRequestException(
        'metadata.replenishmentPolicy.orderWindow.daysOfWeek must be an array of weekday numbers',
      );
    }

    const normalizedDaysOfWeek = Array.from(
      new Set(
        rawDaysOfWeek.map((value) => {
          if (!Number.isInteger(value) || value < 0 || value > 6) {
            throw new BadRequestException(
              'metadata.replenishmentPolicy.orderWindow.daysOfWeek entries must be integers between 0 and 6',
            );
          }

          return Number(value);
        }),
      ),
    );

    return normalizedDaysOfWeek;
  }

  private normalizeHour(rawHour: unknown, label: string): number {
    if (
      !Number.isInteger(rawHour) ||
      Number(rawHour) < 0 ||
      Number(rawHour) > 23
    ) {
      throw new BadRequestException(
        `metadata.replenishmentPolicy.orderWindow.${label} must be an integer between 0 and 23`,
      );
    }

    return Number(rawHour);
  }

  private normalizeTimeZone(rawTimeZone: unknown): string {
    if (typeof rawTimeZone !== 'string' || rawTimeZone.trim().length === 0) {
      throw new BadRequestException(
        'metadata.replenishmentPolicy.orderWindow.timeZone must be a non-empty IANA timezone string',
      );
    }

    try {
      Intl.DateTimeFormat('en-US', { timeZone: rawTimeZone.trim() });
      return rawTimeZone.trim();
    } catch {
      throw new BadRequestException(
        'metadata.replenishmentPolicy.orderWindow.timeZone must be a valid IANA timezone string',
      );
    }
  }

  private normalizeAiAnalyticsHours(rawHours: unknown): number | undefined {
    if (rawHours == null) {
      return undefined;
    }

    const normalizedHours = Number(rawHours);
    if (
      !Number.isInteger(normalizedHours) ||
      normalizedHours < 1 ||
      normalizedHours > 720
    ) {
      throw new BadRequestException(
        'metadata.aiAnalyticsPolicy.stalePurchaseOrderHours must be an integer between 1 and 720',
      );
    }

    return normalizedHours;
  }

  private normalizeAiAnalyticsTargetScore(
    rawTargetScore: unknown,
  ): number | undefined {
    if (rawTargetScore == null) {
      return undefined;
    }

    const normalizedTargetScore = Number(rawTargetScore);
    if (
      !Number.isInteger(normalizedTargetScore) ||
      normalizedTargetScore < 1 ||
      normalizedTargetScore > 100
    ) {
      throw new BadRequestException(
        'metadata.aiAnalyticsPolicy.targetHealthScore must be an integer between 1 and 100',
      );
    }

    return normalizedTargetScore;
  }

  private normalizeHrAttendanceHour(
    rawHour: unknown,
    label: string,
  ): number | undefined {
    if (rawHour == null) {
      return undefined;
    }

    const normalizedHour = Number(rawHour);
    if (
      !Number.isInteger(normalizedHour) ||
      normalizedHour < 0 ||
      normalizedHour > 23
    ) {
      throw new BadRequestException(
        `metadata.hrAttendancePolicy.${label} must be an integer between 0 and 23`,
      );
    }

    return normalizedHour;
  }

  private normalizeHrAttendanceGraceMinutes(
    rawGraceMinutes: unknown,
  ): number | undefined {
    if (rawGraceMinutes == null) {
      return undefined;
    }

    const normalizedGraceMinutes = Number(rawGraceMinutes);
    if (
      !Number.isInteger(normalizedGraceMinutes) ||
      normalizedGraceMinutes < 0 ||
      normalizedGraceMinutes > 180
    ) {
      throw new BadRequestException(
        'metadata.hrAttendancePolicy.gracePeriodMinutes must be an integer between 0 and 180',
      );
    }

    return normalizedGraceMinutes;
  }

  private normalizeHrAttendanceOvertimeHours(
    rawOvertimeHours: unknown,
  ): number | undefined {
    if (rawOvertimeHours == null) {
      return undefined;
    }

    const normalizedOvertimeHours = Number(rawOvertimeHours);
    if (
      !Number.isInteger(normalizedOvertimeHours) ||
      normalizedOvertimeHours < 1 ||
      normalizedOvertimeHours > 24
    ) {
      throw new BadRequestException(
        'metadata.hrAttendancePolicy.overtimeThresholdHours must be an integer between 1 and 24',
      );
    }

    return normalizedOvertimeHours;
  }

  async updateTenantOwner(
    tenantId: number,
    dto: import('./dto/update-retail-tenant-owner.dto').UpdateRetailTenantOwnerDto,
    auditUser?: { id: number | null; email: string | null },
  ): Promise<any> {
    const tenant = await this.findTenantOrThrow(tenantId);
    return this.decorateTenantWithPosWorkspaceAudit(tenant);
  }
}
