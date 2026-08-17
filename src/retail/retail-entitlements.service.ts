import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DeepPartial, In, IsNull, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
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
import {
  getPosSelfServeTrialEndsAt,
  isLapsedPosSelfServeTrial,
  isLivePosSelfServeTrial,
  isPosSelfServeTrialPlan,
  isPosSelfServeTrialSubscription,
  POS_SELF_SERVE_TRIAL_MONTHS,
  POS_SELF_SERVE_TRIAL_PLAN_CODE,
} from './pos-self-serve-trial.policy';

type PosWorkspaceStatus =
  | 'ACTIVE'
  | 'TENANT_SETUP_REQUIRED'
  | 'TENANT_INACTIVE'
  | 'MODULE_SETUP_REQUIRED'
  | 'PAYMENT_REQUIRED'
  | 'PAST_DUE'
  | 'EXPIRED'
  | 'CANCELLED';

type BranchWorkspaceStatus = {
  branch: Branch;
  tenant: RetailTenant | null;
  subscription: TenantSubscription | null;
  entitlements: TenantModuleEntitlement[];
  hasPosModule: boolean;
  workspaceStatus: PosWorkspaceStatus;
};

const MILLISECONDS_PER_DAY = 86_400_000;

/** How many numbered variants of a taken tenant name to try before giving up. */
const MAX_TENANT_NAME_ATTEMPTS = 20;

/** The unique index behind `retail_tenants.name` (@Index(['name'], {unique:true})). */
const TENANT_NAME_UNIQUE_INDEX = 'IDX_a554b4063de337d98a28c992e0';

/**
 * A Postgres unique violation on the tenant NAME specifically.
 *
 * `retail_tenants` also has UQ_retail_tenants_code, and a caller passing a
 * duplicate code has a real error to hear about — retrying under a different
 * name would silently paper over it. So match the constraint, not just 23505.
 */
function isTenantNameConflict(error: unknown): boolean {
  const driverError = (error as { driverError?: Record<string, unknown> })
    ?.driverError;
  const detail = (driverError ?? error) as Record<string, unknown> | undefined;

  if (String(detail?.code || '') !== '23505') {
    return false;
  }

  const constraint = String(detail?.constraint || '');
  return (
    constraint === TENANT_NAME_UNIQUE_INDEX ||
    // Defensive: a renamed index still reports the column in its detail text.
    /\bname\b/i.test(String(detail?.detail || ''))
  );
}

type RetailTenantWithPosWorkspaceAudit = RetailTenant & {
  posWorkspaceAudit: {
    provisioningSource:
      | 'POS_SELF_SERVE'
      | 'POS_SELF_SERVE_AUTO_TRIAL'
      | 'ADMIN_OR_BACKOFFICE';
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
      | 'TRIAL_EXPIRED'
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
    /** Earliest live free-trial end across this tenant's branches. */
    trialEndsAt: Date | null;
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
      subscriptionEndsAt: Date | null;
      isTrialWorkspace: boolean;
      isTrialExpired: boolean;
      isSelfServeProvisioned: boolean;
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
    @InjectRepository(BranchStaffAssignment)
    private readonly branchStaffAssignmentRepository: Repository<BranchStaffAssignment>,
  ) {}

  /**
   * Returns true when the given user is authorised to operate on a branch:
   * either they own the branch or they have an active staff assignment for it.
   */
  async isUserActiveBranchMember(
    userId: number,
    branchId: number,
  ): Promise<boolean> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId },
      select: ['id', 'ownerId'],
    });
    if (!branch) return false;
    if (branch.ownerId === userId) return true;

    const assignment = await this.branchStaffAssignmentRepository.findOne({
      where: { branchId, userId, isActive: true },
      select: ['id'],
    });
    return assignment != null;
  }

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

    const tenant = await this.saveTenantWithUniqueName({
      name: dto.name,
      code: dto.code?.trim() || null,
      billingEmail: dto.billingEmail?.trim() || null,
      defaultCurrency: dto.defaultCurrency?.trim() || null,
      ownerUserId: dto.ownerUserId ?? null,
      status: RetailTenantStatus.ACTIVE,
    });

    return this.findTenantOrThrow(tenant.id);
  }

  /**
   * Insert the tenant, disambiguating its name if that name is taken.
   *
   * `retail_tenants.name` is UNIQUE, and self-serve signup derives the name from
   * the owner's account (display name → email local-part → 'My Business'). Two
   * owners called Ahmed, or two who fall through to the generic default,
   * therefore collide — and the sign-in path swallows the throw, so the second
   * one is dropped at the onboarding gate with nothing but a log line to explain
   * it. As signups grow, so does the chance of hitting it.
   *
   * Insert-and-retry rather than "does this name exist?" first: a pre-flight
   * SELECT races two simultaneous signups, which is the exact case that fails.
   *
   * Only the TENANT name is suffixed. The tenant is an internal billing
   * container; the branch name is what the owner sees on receipts, and callers
   * name the branch separately.
   */
  private async saveTenantWithUniqueName(
    attributes: DeepPartial<RetailTenant>,
  ): Promise<RetailTenant> {
    // Leave room for the suffix inside the column's 255 chars.
    const base = String(attributes.name || '').slice(0, 240);

    for (let attempt = 1; attempt <= MAX_TENANT_NAME_ATTEMPTS; attempt += 1) {
      const name = attempt === 1 ? base : `${base} (${attempt})`;

      try {
        return await this.retailTenantsRepository.save(
          this.retailTenantsRepository.create({ ...attributes, name }),
        );
      } catch (error) {
        if (!isTenantNameConflict(error)) {
          throw error;
        }
      }
    }

    // Every numbered name was taken too. Fall back to something that cannot
    // collide rather than failing a signup outright.
    return this.retailTenantsRepository.save(
      this.retailTenantsRepository.create({
        ...attributes,
        name: `${base} (${randomUUID().slice(0, 8)})`,
      }),
    );
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

  /**
   * The subscription that governs ONE branch.
   *
   * Subscriptions are per-branch, but rows created before that change carry
   * `branchId = null` and govern the whole tenant. So: the branch's own latest
   * row wins, else the latest legacy tenant-wide row. The fallback is
   * deliberately `branchId: IsNull()` and NOT "any row on this tenant" — a
   * plain `{ tenantId }` lookup lets a sibling branch's newer row govern this
   * one, which silently extends (or ends) a branch's subscription for reasons
   * that have nothing to do with it.
   */
  private async findSubscriptionForBranch(
    tenantId: number,
    branchId: number,
  ): Promise<TenantSubscription | null> {
    const branchScoped = await this.tenantSubscriptionsRepository.findOne({
      where: { tenantId, branchId },
      order: { createdAt: 'DESC' },
    });

    if (branchScoped) {
      return branchScoped;
    }

    return this.tenantSubscriptionsRepository.findOne({
      where: { tenantId, branchId: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * In-memory twin of findSubscriptionForBranch, for callers that already
   * eager-loaded `tenant.subscriptions` (the admin audit path) and must not
   * issue a query per branch. Same precedence rule.
   */
  private pickSubscriptionForBranch(
    subscriptions: TenantSubscription[] = [],
    branchId: number | null,
  ): TenantSubscription | null {
    const byRecency = [...subscriptions].sort((left, right) => {
      const leftTime = new Date(left.startsAt ?? left.createdAt ?? 0).getTime();
      const rightTime = new Date(
        right.startsAt ?? right.createdAt ?? 0,
      ).getTime();
      return rightTime - leftTime;
    });

    return (
      (branchId != null
        ? byRecency.find((entry) => entry.branchId === branchId)
        : null) ??
      byRecency.find((entry) => entry.branchId == null) ??
      null
    );
  }

  /**
   * Starts the free trial that lets an auto-provisioned branch open before it
   * is paid for. Branch-scoped, so a later paid subscription supersedes it, and
   * idempotent per branch — a second call returns the existing trial rather
   * than extending it.
   */
  async startPosSelfServeTrial(
    tenantId: number,
    branchId: number,
  ): Promise<TenantSubscription> {
    const existing = await this.tenantSubscriptionsRepository.findOne({
      where: { tenantId, branchId },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      return existing;
    }

    const startsAt = new Date();

    return this.tenantSubscriptionsRepository.save(
      this.tenantSubscriptionsRepository.create({
        tenantId,
        branchId,
        planCode: POS_SELF_SERVE_TRIAL_PLAN_CODE,
        status: TenantSubscriptionStatus.TRIAL,
        billingInterval: TenantBillingInterval.MONTHLY,
        amount: 0,
        amountTotal: 0,
        currency: 'ETB',
        startsAt,
        endsAt: getPosSelfServeTrialEndsAt(startsAt),
        autoRenew: false,
        metadata: {
          source: 'POS_SELF_SERVE_AUTO_TRIAL',
          trialMonths: POS_SELF_SERVE_TRIAL_MONTHS,
          branchId,
        },
      }),
    );
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

    if (workspace.workspaceStatus !== 'ACTIVE') {
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

    if (workspace.workspaceStatus !== 'ACTIVE') {
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

  async getBranchWorkspaceStatus(
    branchId: number,
  ): Promise<BranchWorkspaceStatus> {
    const branch = await this.findBranchOrThrow(branchId);

    if (!branch.retailTenantId) {
      return {
        branch,
        tenant: null,
        subscription: null,
        entitlements: [],
        hasPosModule: false,
        workspaceStatus: 'TENANT_SETUP_REQUIRED',
      };
    }

    const tenant = await this.findTenantOrThrow(branch.retailTenantId);
    const subscription = await this.findSubscriptionForBranch(
      tenant.id,
      branchId,
    );
    const entitlements = await this.tenantModuleEntitlementsRepository.find({
      where: { tenantId: tenant.id },
    });

    return this.resolveBranchWorkspaceStatus({
      branch,
      tenant,
      subscription,
      entitlements,
      now: Date.now(),
    });
  }

  /**
   * Batched twin of getBranchWorkspaceStatus, for callers that need a status
   * for EVERY branch a user can reach.
   *
   * The per-branch version costs four sequential queries, and the seller
   * workspace endpoints used to run it inside an unbounded `Promise.all` over
   * the caller's whole branch list — twice per request, since the active-branch
   * and activation-candidate passes each did their own fan-out. At 57 live
   * branches that is ~450 connection acquisitions for one page load, against a
   * pg pool of ten per worker. The pool starved and every other request on that
   * worker died on `timeout exceeded when trying to connect` — seller saves,
   * portal sessions and till checkout ingests alike. This resolves the same
   * four tables in four queries regardless of how many branches are asked for.
   *
   * Two contract differences from the per-branch version, both deliberate:
   *
   * - `tenant` is loaded SHALLOW. The per-branch version eager-loads
   *   owner/branches/subscriptions/entitlements via findTenantOrThrow; joining
   *   those four for every tenant at once is exactly the cost this method
   *   exists to avoid, and no caller reads them off the result. Read only
   *   scalar tenant columns from here.
   * - A branch the per-branch version would have thrown NotFoundException for
   *   (no branch row, or a retailTenantId pointing at a deleted tenant) is
   *   absent from the map rather than throwing, so one broken row cannot fail
   *   the whole list.
   */
  async getBranchWorkspaceStatusMany(
    branchIds: number[],
  ): Promise<Map<number, BranchWorkspaceStatus>> {
    const byBranchId = new Map<number, BranchWorkspaceStatus>();
    const uniqueBranchIds = Array.from(
      new Set(branchIds.filter((branchId) => Number.isInteger(branchId))),
    );

    if (!uniqueBranchIds.length) {
      return byBranchId;
    }

    const branches = await this.branchesRepository.find({
      where: { id: In(uniqueBranchIds) },
      relations: { retailTenant: true },
    });

    const tenantIds = Array.from(
      new Set(
        branches
          .map((branch) => branch.retailTenantId)
          .filter((tenantId): tenantId is number => Number.isInteger(tenantId)),
      ),
    );

    const [tenants, subscriptions, entitlements] = tenantIds.length
      ? await Promise.all([
          this.retailTenantsRepository.find({ where: { id: In(tenantIds) } }),
          // Same ordering as findSubscriptionForBranch, so the per-branch pick
          // below can mirror its precedence rule exactly.
          this.tenantSubscriptionsRepository.find({
            where: { tenantId: In(tenantIds) },
            order: { createdAt: 'DESC' },
          }),
          this.tenantModuleEntitlementsRepository.find({
            where: { tenantId: In(tenantIds) },
          }),
        ])
      : [[], [], []];

    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const subscriptionsByTenantId = new Map<number, TenantSubscription[]>();
    for (const subscription of subscriptions) {
      const bucket = subscriptionsByTenantId.get(subscription.tenantId) ?? [];
      bucket.push(subscription);
      subscriptionsByTenantId.set(subscription.tenantId, bucket);
    }
    const entitlementsByTenantId = new Map<number, TenantModuleEntitlement[]>();
    for (const entitlement of entitlements) {
      const bucket = entitlementsByTenantId.get(entitlement.tenantId) ?? [];
      bucket.push(entitlement);
      entitlementsByTenantId.set(entitlement.tenantId, bucket);
    }

    const now = Date.now();
    for (const branch of branches) {
      if (!branch.retailTenantId) {
        byBranchId.set(branch.id, {
          branch,
          tenant: null,
          subscription: null,
          entitlements: [],
          hasPosModule: false,
          workspaceStatus: 'TENANT_SETUP_REQUIRED',
        });
        continue;
      }

      const tenant = tenantById.get(branch.retailTenantId);
      if (!tenant) {
        // findTenantOrThrow would have thrown NotFoundException here; every
        // caller of the per-branch version catches that and skips the branch.
        continue;
      }

      byBranchId.set(
        branch.id,
        this.resolveBranchWorkspaceStatus({
          branch,
          tenant,
          subscription: this.pickBranchScopedSubscription(
            subscriptionsByTenantId.get(tenant.id) ?? [],
            branch.id,
          ),
          entitlements: entitlementsByTenantId.get(tenant.id) ?? [],
          now,
        }),
      );
    }

    return byBranchId;
  }

  /**
   * In-memory twin of findSubscriptionForBranch for a pre-loaded, createdAt
   * DESC ordered list. Branch-scoped rows win; the legacy tenant-wide row
   * (branchId null) is the fallback.
   */
  private pickBranchScopedSubscription(
    orderedByCreatedAtDesc: TenantSubscription[],
    branchId: number,
  ): TenantSubscription | null {
    return (
      orderedByCreatedAtDesc.find((entry) => entry.branchId === branchId) ??
      orderedByCreatedAtDesc.find((entry) => entry.branchId == null) ??
      null
    );
  }

  /**
   * The status rules themselves, over already-loaded rows. Both the per-branch
   * and batched loaders funnel through here so they cannot drift apart.
   */
  private resolveBranchWorkspaceStatus(input: {
    branch: Branch;
    tenant: RetailTenant;
    subscription: TenantSubscription | null;
    entitlements: TenantModuleEntitlement[];
    now: number;
  }): BranchWorkspaceStatus {
    const { branch, tenant, subscription, now } = input;
    const effectiveSubscriptionStatus = this.resolveEffectiveSubscriptionStatus(
      subscription,
      now,
    );
    const entitlements = input.entitlements.filter((entitlement) => {
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
      };
    }

    const subscriptionStatusMap: Record<
      TenantSubscriptionStatus,
      PosWorkspaceStatus
    > = {
      [TenantSubscriptionStatus.ACTIVE]: 'ACTIVE',
      [TenantSubscriptionStatus.TRIAL]: 'PAYMENT_REQUIRED',
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
      // A live self-serve trial opens the branch; a lapsed one was already
      // rewritten to EXPIRED above, so it falls through to the paywall.
      workspaceStatus: isLivePosSelfServeTrial(subscription, now)
        ? 'ACTIVE'
        : subscriptionStatusMap[effectiveSubscriptionStatus],
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

    const endsAt = subscription.endsAt
      ? new Date(subscription.endsAt).getTime()
      : null;

    if (
      endsAt != null &&
      endsAt < now &&
      (subscription.status === TenantSubscriptionStatus.ACTIVE ||
        // A lapsed self-serve trial expires the same way a paid period does, so
        // the owner is routed to the Ebirr paywall instead of staying open.
        isPosSelfServeTrialSubscription(subscription))
    ) {
      return TenantSubscriptionStatus.EXPIRED;
    }

    return subscription.status;
  }

  private decorateTenantWithPosWorkspaceAudit(
    tenant: RetailTenant,
  ): RetailTenantWithPosWorkspaceAudit {
    const latestSubscription = this.getLatestTenantSubscription(tenant);
    const provisioningSource = this.resolveProvisioningSource(tenant);
    const branchWorkspaces = (tenant.branches ?? []).map((branch) => {
      // Each branch is governed by ITS OWN subscription (legacy tenant-wide rows
      // still cover branches that have none) — stamping the tenant's newest row
      // onto every branch reported a paid branch's status for a trialing one.
      const branchSubscription = this.pickSubscriptionForBranch(
        tenant.subscriptions ?? [],
        branch.id,
      );
      const workspaceStatus = this.resolveTenantWorkspaceStatus(
        tenant,
        branchSubscription,
      );
      return {
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code ?? null,
        workspaceStatus,
        subscriptionStatus: branchSubscription?.status ?? null,
        planCode: branchSubscription?.planCode ?? null,
        subscriptionEndsAt: branchSubscription?.endsAt ?? null,
        isTrialWorkspace: isLivePosSelfServeTrial(branchSubscription),
        isTrialExpired: isLapsedPosSelfServeTrial(branchSubscription),
        isSelfServeProvisioned: provisioningSource !== 'ADMIN_OR_BACKOFFICE',
        subscription: branchSubscription,
      };
    });
    const activationRequiredCount = branchWorkspaces.filter(
      (workspace) => workspace.workspaceStatus === 'PAYMENT_REQUIRED',
    ).length;
    const activeWorkspaceCount = branchWorkspaces.filter(
      (workspace) => workspace.workspaceStatus === 'ACTIVE',
    ).length;
    const primaryWorkspace = branchWorkspaces[0] ?? null;
    const primaryWorkspaceStatus =
      primaryWorkspace?.workspaceStatus ?? 'TENANT_SETUP_REQUIRED';
    const auditStatus = this.mapAuditStatus(
      primaryWorkspaceStatus,
      primaryWorkspace?.subscription ?? null,
    );
    // Earliest live trial across the tenant's branches — what an operator wants
    // to sort a trial cohort by.
    const trialEndsAt =
      branchWorkspaces
        .filter((workspace) => workspace.isTrialWorkspace)
        .map((workspace) => workspace.subscriptionEndsAt)
        .filter((value): value is Date => value != null)
        .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;

    return Object.assign(tenant, {
      posWorkspaceAudit: {
        provisioningSource,
        onboardingStatus: auditStatus.onboardingStatus,
        activationStatus: auditStatus.activationStatus,
        nextBillingStep: this.describeNextBillingStep(
          primaryWorkspaceStatus,
          primaryWorkspace?.subscription ?? latestSubscription,
        ),
        ownerEmail: tenant.owner?.email ?? tenant.billingEmail ?? null,
        billingEmail: tenant.billingEmail ?? null,
        latestSubscriptionStatus: latestSubscription?.status ?? null,
        latestPlanCode: latestSubscription?.planCode ?? null,
        trialEndsAt,
        workspaceCount: branchWorkspaces.length,
        activeWorkspaceCount,
        activationRequiredCount,
        branchWorkspaces: branchWorkspaces.map(
          ({ subscription, ...workspace }) => workspace,
        ),
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

  /**
   * How this tenant came to exist. Resolved from explicit markers first — the
   * entitlement's provisioningSource, then the auto-trial subscription's — and
   * only then from the legacy free-text reason sniff, which cannot tell an
   * auto-trial signup apart from a manually self-served one.
   */
  private resolveProvisioningSource(
    tenant: RetailTenant,
  ): RetailTenantWithPosWorkspaceAudit['posWorkspaceAudit']['provisioningSource'] {
    const marked = (tenant.entitlements ?? []).find((entitlement) =>
      Boolean(entitlement.metadata?.provisioningSource),
    );
    if (marked?.metadata?.provisioningSource === 'POS_SELF_SERVE_AUTO_TRIAL') {
      return 'POS_SELF_SERVE_AUTO_TRIAL';
    }
    if (marked) {
      return 'POS_SELF_SERVE';
    }

    const hasAutoTrial = (tenant.subscriptions ?? []).some(
      (subscription) =>
        subscription.metadata?.source === 'POS_SELF_SERVE_AUTO_TRIAL' ||
        isPosSelfServeTrialPlan(subscription),
    );
    if (hasAutoTrial) {
      return 'POS_SELF_SERVE_AUTO_TRIAL';
    }

    const legacySelfServe = (tenant.entitlements ?? []).some((entitlement) =>
      String(entitlement.reason ?? '')
        .toLowerCase()
        .includes('self-serve onboarding'),
    );

    return legacySelfServe ? 'POS_SELF_SERVE' : 'ADMIN_OR_BACKOFFICE';
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
        // Only the auto-provisioned trial opens a workspace, and only until it
        // lapses; every other TRIAL row keeps its pay-first meaning.
        return isLivePosSelfServeTrial(latestSubscription)
          ? 'ACTIVE'
          : 'PAYMENT_REQUIRED';
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

  private mapAuditStatus(
    workspaceStatus: PosWorkspaceStatus,
    subscription?: TenantSubscription | null,
  ): {
    onboardingStatus: RetailTenantWithPosWorkspaceAudit['posWorkspaceAudit']['onboardingStatus'];
    activationStatus: RetailTenantWithPosWorkspaceAudit['posWorkspaceAudit']['activationStatus'];
  } {
    // Checked before the status switch: a tenant on the free trial reports
    // ACTIVE / EXPIRED like everyone else, which made a trialing tenant
    // indistinguishable from a paying one in every admin filter.
    if (isLivePosSelfServeTrial(subscription)) {
      return { onboardingStatus: 'ACTIVE', activationStatus: 'TRIAL' };
    }
    if (isLapsedPosSelfServeTrial(subscription)) {
      return {
        onboardingStatus: 'BILLING_ACTIVATION_REQUIRED',
        activationStatus: 'TRIAL_EXPIRED',
      };
    }

    switch (workspaceStatus) {
      case 'ACTIVE':
        return {
          onboardingStatus: 'ACTIVE',
          activationStatus: 'ACTIVATED',
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
    if (isLivePosSelfServeTrial(latestSubscription)) {
      const endsAt = latestSubscription?.endsAt;
      return endsAt
        ? `Free trial ends ${this.formatAuditDate(new Date(endsAt))}; collect the first Ebirr payment before then.`
        : 'Collect the first Ebirr payment before the free trial ends.';
    }
    if (isLapsedPosSelfServeTrial(latestSubscription)) {
      return 'The free trial has ended — collect the first Ebirr payment to reopen this workspace.';
    }

    switch (workspaceStatus) {
      case 'ACTIVE':
        return 'No immediate billing action is required.';
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

  async updateTenantOwner(
    tenantId: number,
    dto: import('./dto/update-retail-tenant-owner.dto').UpdateRetailTenantOwnerDto,
    auditUser?: { id: number | null; email: string | null },
  ): Promise<any> {
    const tenant = await this.findTenantOrThrow(tenantId);
    return this.decorateTenantWithPosWorkspaceAudit(tenant);
  }
}
