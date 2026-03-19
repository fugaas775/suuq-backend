import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { User } from '../users/entities/user.entity';
import { CreateRetailTenantDto } from './dto/create-retail-tenant.dto';
import { ApplyRetailPlanPresetDto } from './dto/apply-retail-plan-preset.dto';
import { CreateTenantSubscriptionDto } from './dto/create-tenant-subscription.dto';
import {
  AppliedRetailPlanPresetResponseDto,
  RetailPlanPresetResponseDto,
} from './dto/retail-plan-preset-response.dto';
import { UpsertTenantModuleEntitlementDto } from './dto/upsert-tenant-module-entitlement.dto';
import {
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

@Injectable()
export class RetailEntitlementsService {
  constructor(
    @InjectRepository(RetailTenant)
    private readonly retailTenantsRepository: Repository<RetailTenant>,
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

  async listTenants(): Promise<RetailTenant[]> {
    return this.retailTenantsRepository.find({
      order: { createdAt: 'DESC' },
      relations: { branches: true, subscriptions: true, entitlements: true },
    });
  }

  async getTenant(id: number): Promise<RetailTenant> {
    return this.findTenantOrThrow(id);
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

    const branch = await this.findBranchOrThrow(branchId);
    if (!branch.retailTenantId) {
      throw new ForbiddenException(
        `Branch ${branchId} is not assigned to a Retail OS tenant`,
      );
    }

    const tenant = await this.findTenantOrThrow(branch.retailTenantId);
    if (tenant.status !== RetailTenantStatus.ACTIVE) {
      throw new ForbiddenException(
        `Retail tenant ${tenant.id} is not active for branch ${branchId}`,
      );
    }

    const activeSubscription = await this.tenantSubscriptionsRepository.findOne(
      {
        where: { tenantId: tenant.id, status: TenantSubscriptionStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      },
    );

    if (!activeSubscription) {
      throw new ForbiddenException(
        `Retail tenant ${tenant.id} does not have an active subscription`,
      );
    }

    const entitlements = await this.tenantModuleEntitlementsRepository.find({
      where: { tenantId: tenant.id },
    });
    const now = Date.now();

    for (const module of modules) {
      const entitlement = entitlements.find((entry) => entry.module === module);
      if (!entitlement || !entitlement.enabled) {
        throw new ForbiddenException(
          `Retail tenant ${tenant.id} is not entitled to module ${module}`,
        );
      }

      if (entitlement.startsAt && entitlement.startsAt.getTime() > now) {
        throw new ForbiddenException(
          `Retail module ${module} is not yet active for tenant ${tenant.id}`,
        );
      }

      if (entitlement.expiresAt && entitlement.expiresAt.getTime() < now) {
        throw new ForbiddenException(
          `Retail module ${module} has expired for tenant ${tenant.id}`,
        );
      }
    }

    return { branch, tenant, entitlements };
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
    const branch = await this.findBranchOrThrow(branchId);
    if (!branch.retailTenantId) {
      throw new ForbiddenException(
        `Branch ${branchId} is not assigned to a Retail OS tenant`,
      );
    }

    const tenant = await this.findTenantOrThrow(branch.retailTenantId);
    if (tenant.status !== RetailTenantStatus.ACTIVE) {
      throw new ForbiddenException(
        `Retail tenant ${tenant.id} is not active for branch ${branchId}`,
      );
    }

    const activeSubscription = await this.tenantSubscriptionsRepository.findOne(
      {
        where: { tenantId: tenant.id, status: TenantSubscriptionStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      },
    );

    if (!activeSubscription) {
      throw new ForbiddenException(
        `Retail tenant ${tenant.id} does not have an active subscription`,
      );
    }

    const now = Date.now();
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

    return { branch, tenant, entitlements };
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
      relations: { branches: true, subscriptions: true, entitlements: true },
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
}
