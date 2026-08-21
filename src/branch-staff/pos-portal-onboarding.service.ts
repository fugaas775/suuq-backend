import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PosUserFitCategory } from '../categories/entities/category.entity';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { EquityPartnerService } from '../retail/equity-partner.service';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import {
  assertAllowedSelfServeServiceFormat,
  getDefaultAllowedSelfServeServiceFormats,
} from '../retail/self-serve-service-format.policy';
import {
  formatPosFreePeriodEndsAt,
  getPosFreePeriodEndsAt,
  isPosFreePeriodOpen,
  POS_SELF_SERVE_TRIAL_SERVICE_FORMAT,
} from '../retail/pos-self-serve-trial.policy';
import { FreeWorkspaceGrantService } from '../free-workspace/free-workspace-grant.service';

/**
 * Stamped on the POS_CORE entitlement so admin reporting can tell a self-served
 * tenant from an admin-provisioned one without sniffing the free-text reason.
 */
export const POS_SELF_SERVE_PROVISIONING_SOURCE = 'POS_SELF_SERVE_AUTO_TRIAL';

/**
 * Whether creating a first branch by hand also opens it free.
 *
 * The free period used to be reachable only by a first-ever Google sign-in (the
 * silent auto-provision). Everyone else — Apple, username/password, or any
 * account that already existed — was sent to the gate's create form, which
 * demanded an Ebirr number and 3,900 ETB before the branch existed. That is the
 * paywall this flag removes.
 *
 * It was introduced switched OFF because an older cached frontend, seeing a
 * workspace it believed unpaid, would follow the create call with an activation
 * charge — billing the owner for what they were just promised free. Every
 * shipped client now checks the returned status (isOpenWorkspaceResponse in
 * pos-s/src/app/session/portalSession.js), so the default is ON and the env var
 * is the way OFF, not the way on. "The first branch is free until the deadline"
 * cannot depend on which sign-in button the owner happened to press.
 */
function isFirstBranchTrialEnabled(): boolean {
  const configured = String(process.env.POS_FIRST_BRANCH_TRIAL_ENABLED || '')
    .trim()
    .toLowerCase();

  if (!configured) {
    return true;
  }

  return !['0', 'false', 'no', 'off'].includes(configured);
}
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
    private readonly equityPartnerService: EquityPartnerService,
    private readonly freeWorkspaceGrantService: FreeWorkspaceGrantService,
  ) {}

  /**
   * Link the new branch to the equity partner who referred it, if any.
   *
   * Best-effort and fire-and-forget: a bad or retired referral code must never
   * cost someone their workspace. The assignment generates no payout on its own
   * — payouts are still created when the subscription is actually paid — so
   * recording it now simply means the partner is still on record six months
   * later, when the trial converts.
   */
  private async linkEquityReferral(
    referralCode: string | null | undefined,
    branchId: number,
    tenantId: number,
  ): Promise<void> {
    const code = String(referralCode || '')
      .trim()
      .toUpperCase();
    if (!code) {
      return;
    }

    try {
      const partner =
        await this.equityPartnerService.findActivePartnerByReferralCode(code);
      if (partner) {
        await this.equityPartnerService.recordReferralFromActivation(
          partner.id,
          branchId,
          tenantId,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Equity referral "${code}" for branch #${branchId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

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
        // The branch name is what appears on receipts, so it falls back to the
        // business name rather than making the owner type the same thing twice.
        name: dto.branchName?.trim() || dto.businessName.trim(),
        ownerId: user.id,
        retailTenantId: tenant.id,
        serviceFormat,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        country: dto.country?.trim() || null,
        phone: dto.phone?.trim() || null,
        // Self-serve signup collects no tax id, so a new branch starts
        // untaxed. Seller HQ prompts for the TIN and the toggle together.
        taxEnabled: false,
        isActive: true,
        // Picking the format on the way in IS the business-type confirmation —
        // the owner was asked and answered. Without this the Seller HQ first-run
        // checklist would open by asking the same question again.
        //
        // `firstRun` with no `widgets` key means "never chose a Home layout",
        // which is the correct state for a branch this new. Do not add one.
        homeConfig: {
          firstRun: { businessTypeConfirmedAt: new Date().toISOString() },
        },
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
    // their POS trial/subscription status via sellerWorkspaceSummary. Mirror it
    // onto the in-memory user too — the branch lookups below read from it.
    if (!user.roles.includes(UserRole.POS_MANAGER)) {
      const nextRoles = [...user.roles, UserRole.POS_MANAGER];
      await this.usersRepository.update(user.id, { roles: nextRoles });
      user.roles = nextRoles;
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

    // The guard at the top of this method already rejected anyone who has a
    // branch or a pending activation, so reaching here means this is the
    // account's first branch TODAY. Whether it is their first ever — the thing
    // the free workspace is actually owed on — is settled inside
    // startPosSelfServeTrial, which returns null when the account has already
    // spent its slot or the promotion has closed.
    const trial = isFirstBranchTrialEnabled()
      ? await this.retailEntitlementsService.startPosSelfServeTrial(
          tenant.id,
          branch.id,
          user.id,
        )
      : null;

    const createdCandidates =
      await this.branchStaffService.getPosWorkspaceActivationCandidatesForUser({
        id: user.id,
        roles: user.roles,
      });
    // A branch on a live trial reports ACTIVE, and the activation-candidate
    // query only returns branches that still owe money — so once the trial is
    // granted this list is empty by design, and reading the status out of it
    // would report PAYMENT_REQUIRED for a workspace that is already open. Take
    // the status from the branch summaries, which describe every open branch.
    const createdSummary = trial
      ? (
          await this.branchStaffService.getPosBranchSummariesForUser({
            id: user.id,
            roles: user.roles,
          })
        ).find((summary) => summary.branchId === branch.id)
      : null;
    const createdWorkspace = createdCandidates.find(
      (candidate) => candidate.branchId === branch.id,
    );

    // Link SellerWorkspace.primaryRetailTenantId so the vendor and POS tenant
    // are unified from the moment the workspace is created.
    void this.linkSellerWorkspaceTenant(user.id, tenant.id);
    void this.linkEquityReferral(dto.referralCode, branch.id, tenant.id);

    return {
      onboardingState: trial
        ? 'BRANCH_WORKSPACE_TRIAL_ACTIVE'
        : 'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
      message: trial
        ? `Your POS-S workspace is open and free until ${formatPosFreePeriodEndsAt()}.`
        : 'Your POS-S workspace was created. Complete billing activation to open it.',
      workspace: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code ?? null,
        workspaceStatus:
          createdSummary?.workspaceStatus ??
          createdWorkspace?.workspaceStatus ??
          (trial ? 'ACTIVE' : 'PAYMENT_REQUIRED'),
      },
      // A date the owner can plan around beats a duration they have to compute —
      // and since the deadline is now the same for everyone, the date IS the
      // offer. `months` is gone: there is no fixed number of them any more.
      trial: trial
        ? {
            planCode: trial.planCode,
            endsAt: trial.endsAt ? new Date(trial.endsAt).toISOString() : null,
          }
        : null,
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

    // Auto-provisioning only makes sense while the branch would be free. Once
    // the promotion closes — or if this account already spent its one free
    // workspace on a branch it deleted, or on a supplier account — the silent
    // provision would drop the owner into a QSR branch that immediately reports
    // PAYMENT_REQUIRED, in a service format nobody asked them about. Returning
    // null hands them to the gate's create form instead, where they choose the
    // format and pay for it: exactly what this path did before the promotion.
    const freePeriodAvailable =
      isPosFreePeriodOpen() &&
      !(await this.freeWorkspaceGrantService.hasClaimedFreeWorkspace(user.id));

    if (!freePeriodAvailable) {
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
        // Trial workspace, no tax id collected — starts untaxed.
        taxEnabled: false,
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

    // The free period is what makes the branch openable — without it the
    // workspace resolves to PAYMENT_REQUIRED and drops straight back out of the
    // session. Checked again rather than assumed: the eligibility read above is
    // not in the same transaction as the grant, so two simultaneous first
    // sign-ins can both pass it and only one can win the slot.
    const trial = await this.retailEntitlementsService.startPosSelfServeTrial(
      tenant.id,
      branch.id,
      user.id,
    );

    if (!trial) {
      this.logger.warn(
        `Auto-provisioned branch #${branch.id} for user #${user.id} did not ` +
          `receive the free period — it opens only once paid. The caller falls ` +
          `back to the activation gate.`,
      );
    }

    void this.linkSellerWorkspaceTenant(user.id, tenant.id);

    this.logger.log(
      `Auto-provisioned ${POS_SELF_SERVE_TRIAL_SERVICE_FORMAT} workspace ` +
        `(tenant #${tenant.id}, branch #${branch.id}) for new user #${user.id}` +
        (trial ? `, free until ${getPosFreePeriodEndsAt().toISOString()}` : ''),
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
