import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PosUserFitCategory } from '../categories/entities/category.entity';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import {
  assertAllowedSelfServeServiceFormat,
  getDefaultAllowedSelfServeServiceFormats,
} from '../retail/self-serve-service-format.policy';
import { POS_SELF_SERVE_TRIAL_SERVICE_FORMAT } from '../retail/pos-self-serve-trial.policy';

/**
 * Stamped on the POS_CORE entitlement so admin reporting can tell a self-served
 * tenant from an admin-provisioned one without sniffing the free-text reason.
 */
export const POS_SELF_SERVE_PROVISIONING_SOURCE = 'POS_SELF_SERVE_AUTO_TRIAL';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../auth/roles.enum';
import { BranchStaffService } from './branch-staff.service';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from './entities/branch-staff-assignment.entity';
import {
  CreatePosWorkspaceDto,
  CreatePosWorkspaceResponseDto,
} from './dto/create-pos-workspace.dto';
import { SellerWorkspace } from '../seller-workspace/entities/seller-workspace.entity';

@Injectable()
export class PosPortalOnboardingService {
  private readonly logger = new Logger(PosPortalOnboardingService.name);

  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignmentsRepository: Repository<BranchStaffAssignment>,
    @InjectRepository(SellerWorkspace)
    private readonly sellerWorkspacesRepository: Repository<SellerWorkspace>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly retailEntitlementsService: RetailEntitlementsService,
    private readonly branchStaffService: BranchStaffService,
  ) {}

  async createWorkspaceForUser(
    user: User,
    dto: CreatePosWorkspaceDto,
  ): Promise<CreatePosWorkspaceResponseDto> {
    const [existingBranches, activationCandidates] = await Promise.all([
      this.branchStaffService.getPosBranchSummariesForUser({
        id: user.id,
        roles: user.roles,
      }),
      this.branchStaffService.getPosWorkspaceActivationCandidatesForUser({
        id: user.id,
        roles: user.roles,
      }),
    ]);

    if (existingBranches.length || activationCandidates.length) {
      throw new BadRequestException(
        'This account already has a POS workspace or a pending workspace activation.',
      );
    }

    const serviceFormat = assertAllowedSelfServeServiceFormat(
      dto.serviceFormat,
      'POS self-serve onboarding',
      getDefaultAllowedSelfServeServiceFormats(),
    );
    const categoryId = Number.isFinite(Number(dto.categoryId))
      ? Number(dto.categoryId)
      : null;

    const tenant = await this.retailEntitlementsService.createTenant({
      name: dto.businessName.trim(),
      billingEmail: user.email,
      defaultCurrency: dto.defaultCurrency?.trim() || 'ETB',
      ownerUserId: user.id,
    });

    const branch = await this.branchesRepository.save(
      this.branchesRepository.create({
        name: dto.branchName.trim(),
        ownerId: user.id,
        retailTenantId: tenant.id,
        serviceFormat,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        country: dto.country?.trim() || null,
        phone: dto.phone?.trim() || null,
        isActive: true,
      }),
    );

    await this.assignmentsRepository.save(
      this.assignmentsRepository.create({
        branchId: branch.id,
        userId: user.id,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isActive: true,
      }),
    );

    // Ensure user.roles includes POS_MANAGER so admin dashboards can detect
    // their POS trial/subscription status via sellerWorkspaceSummary.
    if (!user.roles.includes(UserRole.POS_MANAGER)) {
      await this.usersRepository.update(user.id, {
        roles: [...user.roles, UserRole.POS_MANAGER],
      });
    }

    await Promise.all([
      this.retailEntitlementsService.upsertModuleEntitlement(
        tenant.id,
        RetailModule.POS_CORE,
        {
          enabled: true,
          reason: 'Enabled during POS-S self-serve onboarding',
          // Deliberately NOT buildSelfServeServiceFormatMetadata(): pinning the
          // allow-list as it stood at signup froze tenants provisioned before a
          // rollout flag flipped (resolveAllowedSelfServeServiceFormats prefers
          // stored metadata over the live defaults), so they could never pick a
          // newly-enabled format — including the one they were provisioned with.
          metadata: { provisioningSource: POS_SELF_SERVE_PROVISIONING_SOURCE },
        },
      ),
      this.retailEntitlementsService.upsertModuleEntitlement(
        tenant.id,
        RetailModule.INVENTORY_CORE,
        {
          enabled: true,
          reason: 'Enabled during POS-S self-serve onboarding',
        },
      ),
    ]);

    const userFit = dto.userFit ?? null;
    const updatedTenant =
      categoryId || userFit
        ? await this.retailEntitlementsService.updateOnboardingProfile(
            tenant.id,
            {
              categoryId,
              userFit,
              notes: null,
            },
            {
              id: user.id,
              email: user.email,
            },
          )
        : null;

    const createdCandidates =
      await this.branchStaffService.getPosWorkspaceActivationCandidatesForUser({
        id: user.id,
        roles: user.roles,
      });
    const createdWorkspace = createdCandidates.find(
      (candidate) => candidate.branchId === branch.id,
    );

    // Link SellerWorkspace.primaryRetailTenantId so the vendor and POS tenant
    // are unified from the moment the workspace is created.
    void this.linkSellerWorkspaceTenant(user.id, tenant.id);

    return {
      onboardingState: 'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
      message:
        'Your POS-S workspace was created. Complete billing activation to open it.',
      workspace: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code ?? null,
        workspaceStatus:
          createdWorkspace?.workspaceStatus ?? 'PAYMENT_REQUIRED',
      },
      pricing: this.branchStaffService.getPosWorkspacePricing(),
      activationCandidates: createdCandidates,
      onboardingProfile: updatedTenant?.onboardingProfile ?? null,
    };
  }

  /**
   * Auto-provisions the workspace a brand-new signup lands in: a QSR branch on
   * a free trial, openable immediately (see pos-self-serve-trial.policy.ts).
   * Called from the portal sign-in path for a first-time signup that has no
   * branch, no supplier and no pending activation — so the owner reaches a
   * working POS instead of a setup wall. Paying converts the same branch.
   *
   * Returns null when the account already has (or is mid-) a workspace, so the
   * caller falls back to the normal onboarding / activation gates.
   */
  async createTrialWorkspaceForNewUser(
    user: User,
  ): Promise<{ tenantId: number; branchId: number } | null> {
    const [existingBranches, activationCandidates] = await Promise.all([
      this.branchStaffService.getPosBranchSummariesForUser({
        id: user.id,
        roles: user.roles,
      }),
      this.branchStaffService.getPosWorkspaceActivationCandidatesForUser({
        id: user.id,
        roles: user.roles,
      }),
    ]);

    if (existingBranches.length || activationCandidates.length) {
      return null;
    }

    const workspaceName = this.resolveDefaultWorkspaceName(user);

    const tenant = await this.retailEntitlementsService.createTenant({
      name: workspaceName,
      billingEmail: user.email,
      defaultCurrency: 'ETB',
      ownerUserId: user.id,
    });

    const branch = await this.branchesRepository.save(
      this.branchesRepository.create({
        name: workspaceName,
        ownerId: user.id,
        retailTenantId: tenant.id,
        serviceFormat: POS_SELF_SERVE_TRIAL_SERVICE_FORMAT,
        isActive: true,
      }),
    );

    await this.assignmentsRepository.save(
      this.assignmentsRepository.create({
        branchId: branch.id,
        userId: user.id,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isActive: true,
      }),
    );

    if (!user.roles.includes(UserRole.POS_MANAGER)) {
      const roles = [...user.roles, UserRole.POS_MANAGER];
      await this.usersRepository.update(user.id, { roles });
      // Keep the in-memory user in step: the caller resolves branch access from
      // it immediately after this returns.
      user.roles = roles;
    }

    await Promise.all([
      this.retailEntitlementsService.upsertModuleEntitlement(
        tenant.id,
        RetailModule.POS_CORE,
        {
          enabled: true,
          reason: 'Enabled during POS-S self-serve onboarding',
          // Deliberately NOT buildSelfServeServiceFormatMetadata(): pinning the
          // allow-list as it stood at signup froze tenants provisioned before a
          // rollout flag flipped (resolveAllowedSelfServeServiceFormats prefers
          // stored metadata over the live defaults), so they could never pick a
          // newly-enabled format — including the one they were provisioned with.
          metadata: { provisioningSource: POS_SELF_SERVE_PROVISIONING_SOURCE },
        },
      ),
      this.retailEntitlementsService.upsertModuleEntitlement(
        tenant.id,
        RetailModule.INVENTORY_CORE,
        {
          enabled: true,
          reason: 'Enabled during POS-S self-serve onboarding',
        },
      ),
    ]);

    // The trial is what makes the branch openable — without it the workspace
    // resolves to PAYMENT_REQUIRED and drops straight back out of the session.
    await this.retailEntitlementsService.startPosSelfServeTrial(
      tenant.id,
      branch.id,
    );

    void this.linkSellerWorkspaceTenant(user.id, tenant.id);

    this.logger.log(
      `Auto-provisioned trial ${POS_SELF_SERVE_TRIAL_SERVICE_FORMAT} workspace ` +
        `(tenant #${tenant.id}, branch #${branch.id}) for new user #${user.id}`,
    );

    return { tenantId: tenant.id, branchId: branch.id };
  }

  /**
   * Names the auto-provisioned workspace after the account, and nothing else.
   *
   * This deliberately carries NO business-type flavour. The branch is created as
   * QSR only because the provisioner has to pick something before the owner has
   * told us anything (they re-lane it from the first-run checklist), so baking
   * the guess into the name misdescribes every non-food signup. A printing press
   * owner once landed in "Asal Printing's Kitchen" and reasonably read it as
   * being in the wrong account — the name was the only thing that looked wrong,
   * which sent the diagnosis down the wrong path entirely.
   */
  private resolveDefaultWorkspaceName(user: User): string {
    const candidates = [
      (user as { displayName?: string | null }).displayName,
      (user as { fullName?: string | null }).fullName,
      user.email ? user.email.split('@')[0] : null,
    ];
    const base = candidates
      .map((value) => String(value || '').trim())
      .find((value) => value.length > 0);

    return base ? base.slice(0, 120) : 'My Business';
  }

  private async linkSellerWorkspaceTenant(
    ownerUserId: number,
    retailTenantId: number,
  ): Promise<void> {
    try {
      let workspace = await this.sellerWorkspacesRepository.findOne({
        where: { ownerUserId },
      });
      if (!workspace) {
        workspace = this.sellerWorkspacesRepository.create({ ownerUserId });
      }
      if (workspace.primaryRetailTenantId == null) {
        workspace.primaryRetailTenantId = retailTenantId;
        await this.sellerWorkspacesRepository.save(workspace);
        this.logger.log(
          `Linked SellerWorkspace for user #${ownerUserId} to tenant #${retailTenantId}`,
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to link SellerWorkspace for user #${ownerUserId}: ${err?.message}`,
      );
    }
  }
}
