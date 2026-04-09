import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignBranchStaffDto } from './dto/assign-branch-staff.dto';
import { InviteBranchStaffDto } from './dto/invite-branch-staff.dto';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from './entities/branch-staff-assignment.entity';
import { BranchStaffInvite } from './entities/branch-staff-invite.entity';
import { Branch } from '../branches/entities/branch.entity';
import { EmailService } from '../email/email.service';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { User } from '../users/entities/user.entity';

export interface PosBranchSummary {
  branchId: number;
  branchName: string;
  branchCode: string | null;
  role: BranchStaffRole;
  permissions: string[];
  isOwner: boolean;
  retailTenantId: number | null;
  retailTenantName: string | null;
  modules: RetailModule[];
  workspaceStatus: 'ACTIVE' | 'TRIAL';
  subscriptionStatus: TenantSubscriptionStatus | null;
  planCode: string | null;
  canStartTrial: boolean;
  canStartActivation: boolean;
  canOpenNow: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  joinedAt: Date;
}

export interface PosWorkspaceActivationCandidate {
  branchId: number;
  branchName: string;
  branchCode: string | null;
  role: BranchStaffRole;
  isOwner: boolean;
  retailTenantId: number | null;
  retailTenantName: string | null;
  workspaceStatus:
    | 'TENANT_SETUP_REQUIRED'
    | 'TENANT_INACTIVE'
    | 'MODULE_SETUP_REQUIRED'
    | 'PAYMENT_REQUIRED'
    | 'TRIAL'
    | 'PAST_DUE'
    | 'EXPIRED'
    | 'CANCELLED';
  subscriptionStatus: TenantSubscriptionStatus | null;
  planCode: string | null;
  canStartTrial: boolean;
  canStartActivation: boolean;
  canOpenNow: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  pricing: {
    amount: number;
    currency: string;
    billingInterval: TenantBillingInterval;
    paymentMethod: string;
  };
}

const POS_WORKSPACE_MONTHLY_PRICE = 1900;
const POS_WORKSPACE_CURRENCY = 'ETB';
const POS_WORKSPACE_PAYMENT_METHOD = 'EBIRR';

@Injectable()
export class BranchStaffService {
  private readonly logger = new Logger(BranchStaffService.name);

  constructor(
    @InjectRepository(BranchStaffAssignment)
    private readonly assignmentsRepository: Repository<BranchStaffAssignment>,
    @InjectRepository(BranchStaffInvite)
    private readonly invitesRepository: Repository<BranchStaffInvite>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly emailService: EmailService,
    private readonly retailEntitlementsService: RetailEntitlementsService,
  ) {}

  async assertCanManageBranchStaff(
    user: {
      id?: number | null;
      roles?: string[];
    },
    branchId: number,
  ) {
    const normalizedRoles = Array.isArray(user?.roles)
      ? user.roles.map((role) => String(role || '').toUpperCase())
      : [];

    if (
      normalizedRoles.includes('SUPER_ADMIN') ||
      normalizedRoles.includes('ADMIN')
    ) {
      return;
    }

    if (!user?.id) {
      throw new ForbiddenException(
        'Branch staff management access was denied.',
      );
    }

    const [ownedBranch, managerAssignment] = await Promise.all([
      this.branchesRepository.findOne({
        where: { id: branchId, ownerId: user.id, isActive: true },
        select: { id: true },
      }),
      this.assignmentsRepository.findOne({
        where: {
          branchId,
          userId: user.id,
          isActive: true,
          role: BranchStaffRole.MANAGER,
        },
        select: { id: true },
      }),
    ]);

    if (ownedBranch || managerAssignment) {
      return;
    }

    throw new ForbiddenException('Branch staff management access was denied.');
  }

  async assign(branchId: number, dto: AssignBranchStaffDto) {
    return this.upsertAssignment(
      branchId,
      dto.userId,
      dto.role,
      dto.permissions ?? [],
    );
  }

  async unassign(branchId: number, userId: number) {
    const assignment = await this.assignmentsRepository.findOne({
      where: { branchId, userId, isActive: true },
    });

    if (!assignment) {
      throw new NotFoundException('Active branch staff assignment not found.');
    }

    assignment.isActive = false;
    return this.assignmentsRepository.save(assignment);
  }

  async invite(
    branchId: number,
    dto: InviteBranchStaffDto,
    invitedByUserId?: number | null,
  ) {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId },
    });

    if (!branch || !branch.isActive) {
      throw new NotFoundException(`Active branch ${branchId} was not found`);
    }

    const email = this.normalizeEmail(dto.email);
    const permissions = this.normalizePermissions(dto.permissions);
    const user = await this.usersRepository.findOne({ where: { email } });
    const existingInvite = await this.invitesRepository.findOne({
      where: { branchId, email },
    });

    const invite = this.invitesRepository.create({
      ...(existingInvite ?? {}),
      branchId,
      email,
      role: dto.role,
      permissions,
      invitedByUserId:
        invitedByUserId ?? existingInvite?.invitedByUserId ?? null,
      acceptedByUserId: user?.id ?? null,
      acceptedAt: user ? new Date() : null,
      isActive: !user,
    });
    const savedInvite = await this.invitesRepository.save(invite);

    let assignment: BranchStaffAssignment | null = null;
    if (user) {
      assignment = await this.upsertAssignment(
        branchId,
        user.id,
        dto.role,
        permissions,
      );
    }

    await this.sendInvitationEmail({
      email,
      branchName: branch.name,
      isExistingUser: !!user,
    });

    return {
      status: user ? 'LINKED_EXISTING_USER' : 'PENDING_SIGNUP',
      invite: savedInvite,
      assignment,
    };
  }

  async findPendingInvitesByBranch(branchId: number) {
    return this.invitesRepository.find({
      where: { branchId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async resendInvite(branchId: number, inviteId: number) {
    const invite = await this.invitesRepository.findOne({
      where: { id: inviteId, branchId, isActive: true },
      relations: { branch: true },
    });

    if (!invite || !invite.branch?.isActive) {
      throw new NotFoundException('Pending branch invite not found.');
    }

    await this.sendInvitationEmail({
      email: invite.email,
      branchName: invite.branch.name,
      isExistingUser: false,
    });

    await this.invitesRepository.save(invite);

    return {
      status: 'RESENT',
      invite,
    };
  }

  async revokeInvite(branchId: number, inviteId: number) {
    const invite = await this.invitesRepository.findOne({
      where: { id: inviteId, branchId, isActive: true },
    });

    if (!invite) {
      throw new NotFoundException('Pending branch invite not found.');
    }

    invite.isActive = false;
    const savedInvite = await this.invitesRepository.save(invite);

    return {
      status: 'REVOKED',
      invite: savedInvite,
    };
  }

  async findByBranch(branchId: number) {
    return this.assignmentsRepository.find({
      where: { branchId, isActive: true },
      order: { createdAt: 'DESC' },
      relations: { user: true, branch: true },
    });
  }

  async getPosBranchSummariesForUser(user: {
    id: number;
    roles?: string[];
  }): Promise<PosBranchSummary[]> {
    const byBranchId = await this.collectPosBranchAccessForUser(user);

    const scopedBranches = await Promise.all(
      Array.from(byBranchId.values()).map(async (summary) => {
        try {
          const workspace =
            await this.retailEntitlementsService.getBranchWorkspaceStatus(
              summary.branchId,
            );

          if (
            workspace.workspaceStatus !== 'ACTIVE' &&
            workspace.workspaceStatus !== 'TRIAL'
          ) {
            return null;
          }

          const modules = workspace.entitlements
            .map((entry) => entry.module)
            .sort((left, right) => left.localeCompare(right));

          if (!modules.includes(RetailModule.POS_CORE)) {
            return null;
          }

          return {
            ...summary,
            retailTenantId: workspace.tenant?.id ?? summary.retailTenantId,
            retailTenantName:
              workspace.tenant?.name ?? summary.retailTenantName,
            modules,
            workspaceStatus: workspace.workspaceStatus,
            subscriptionStatus: workspace.subscription?.status ?? null,
            planCode: workspace.subscription?.planCode ?? null,
            canStartTrial: false,
            canStartActivation: false,
            canOpenNow: true,
            trialStartedAt: workspace.trialStartedAt,
            trialEndsAt: workspace.trialEndsAt,
            trialDaysRemaining: workspace.trialDaysRemaining,
          };
        } catch (error) {
          if (
            error instanceof ForbiddenException ||
            error instanceof NotFoundException
          ) {
            return null;
          }

          throw error;
        }
      }),
    );

    return scopedBranches.filter((summary): summary is PosBranchSummary => {
      return summary != null;
    });
  }

  async getPosWorkspaceActivationCandidatesForUser(user: {
    id: number;
    roles?: string[];
  }): Promise<PosWorkspaceActivationCandidate[]> {
    const byBranchId = await this.collectPosBranchAccessForUser(user);
    const activationCandidates = await Promise.all(
      Array.from(byBranchId.values()).map(async (summary) => {
        const workspace =
          await this.retailEntitlementsService.getBranchWorkspaceStatus(
            summary.branchId,
          );
        const canManageWorkspace =
          summary.isOwner || summary.role === BranchStaffRole.MANAGER;
        const canStartActivation =
          canManageWorkspace &&
          ['PAYMENT_REQUIRED', 'PAST_DUE', 'EXPIRED', 'CANCELLED'].includes(
            workspace.workspaceStatus,
          );
        const canStartTrial =
          canManageWorkspace &&
          workspace.workspaceStatus === 'PAYMENT_REQUIRED' &&
          !workspace.subscription;

        if (workspace.workspaceStatus === 'ACTIVE') {
          return null;
        }

        return {
          branchId: summary.branchId,
          branchName: summary.branchName,
          branchCode: summary.branchCode,
          role: summary.role,
          isOwner: summary.isOwner,
          retailTenantId: workspace.tenant?.id ?? summary.retailTenantId,
          retailTenantName: workspace.tenant?.name ?? summary.retailTenantName,
          workspaceStatus: workspace.workspaceStatus,
          subscriptionStatus: workspace.subscription?.status ?? null,
          planCode: workspace.subscription?.planCode ?? null,
          canStartTrial,
          canStartActivation,
          canOpenNow: workspace.workspaceStatus === 'TRIAL',
          trialStartedAt: workspace.trialStartedAt,
          trialEndsAt: workspace.trialEndsAt,
          trialDaysRemaining: workspace.trialDaysRemaining,
          pricing: this.getPosWorkspacePricing(),
        };
      }),
    );

    return activationCandidates.filter(
      (candidate): candidate is PosWorkspaceActivationCandidate =>
        candidate != null,
    );
  }

  async getAdminPosAccessForUser(userId: number) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, roles: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [branchAssignments, workspaceActivationCandidates] =
      await Promise.all([
        this.getPosBranchSummariesForUser(user),
        this.getPosWorkspaceActivationCandidatesForUser(user),
      ]);

    return {
      branchAssignments,
      workspaceActivationCandidates,
    };
  }

  getPosWorkspacePricing() {
    return {
      amount: POS_WORKSPACE_MONTHLY_PRICE,
      currency: POS_WORKSPACE_CURRENCY,
      billingInterval: TenantBillingInterval.MONTHLY,
      paymentMethod: POS_WORKSPACE_PAYMENT_METHOD,
    };
  }

  private async collectPosBranchAccessForUser(user: {
    id: number;
    roles?: string[];
  }): Promise<Map<number, PosBranchSummary>> {
    const [ownedBranches, assignments] = await Promise.all([
      this.branchesRepository.find({
        where: { ownerId: user.id, isActive: true },
        order: { createdAt: 'ASC' },
      }),
      this.assignmentsRepository.find({
        where: { userId: user.id, isActive: true },
        relations: { branch: true },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const byBranchId = new Map<number, PosBranchSummary>();

    for (const branch of ownedBranches) {
      byBranchId.set(branch.id, {
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code ?? null,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isOwner: true,
        retailTenantId: branch.retailTenantId ?? null,
        retailTenantName: null,
        modules: [],
        workspaceStatus: 'ACTIVE',
        subscriptionStatus: null,
        planCode: null,
        canStartTrial: false,
        canStartActivation: false,
        canOpenNow: false,
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
        joinedAt: branch.createdAt,
      });
    }

    for (const assignment of assignments) {
      if (!assignment.branch?.isActive) {
        continue;
      }

      const existing = byBranchId.get(assignment.branchId);
      const mergedPermissions = Array.from(
        new Set([
          ...(existing?.permissions ?? []),
          ...(assignment.permissions ?? []),
        ]),
      ).sort();

      byBranchId.set(assignment.branchId, {
        branchId: assignment.branchId,
        branchName: assignment.branch.name,
        branchCode: assignment.branch.code ?? null,
        role: assignment.role ?? existing?.role ?? BranchStaffRole.OPERATOR,
        permissions: mergedPermissions,
        isOwner: existing?.isOwner ?? false,
        retailTenantId:
          existing?.retailTenantId ?? assignment.branch.retailTenantId ?? null,
        retailTenantName: existing?.retailTenantName ?? null,
        modules: existing?.modules ?? [],
        workspaceStatus: existing?.workspaceStatus ?? 'ACTIVE',
        subscriptionStatus: existing?.subscriptionStatus ?? null,
        planCode: existing?.planCode ?? null,
        canStartTrial: existing?.canStartTrial ?? false,
        canStartActivation: existing?.canStartActivation ?? false,
        canOpenNow: existing?.canOpenNow ?? false,
        trialStartedAt: existing?.trialStartedAt ?? null,
        trialEndsAt: existing?.trialEndsAt ?? null,
        trialDaysRemaining: existing?.trialDaysRemaining ?? null,
        joinedAt: existing?.joinedAt ?? assignment.createdAt,
      });
    }

    return byBranchId;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePermissions(permissions?: string[]): string[] {
    return Array.from(new Set((permissions ?? []).filter(Boolean))).sort();
  }

  private async upsertAssignment(
    branchId: number,
    userId: number,
    role: BranchStaffRole,
    permissions: string[],
  ): Promise<BranchStaffAssignment> {
    const existing = await this.assignmentsRepository.findOne({
      where: { branchId, userId },
    });

    const assignment = this.assignmentsRepository.create({
      ...(existing ?? {}),
      branchId,
      userId,
      role,
      permissions,
      isActive: true,
    });

    return this.assignmentsRepository.save(assignment);
  }

  private async sendInvitationEmail(params: {
    email: string;
    branchName: string;
    isExistingUser: boolean;
  }) {
    const portalUrl = process.env.POS_PORTAL_URL || 'https://pos.ugasfuad.com';
    const subject = params.isExistingUser
      ? `POS access granted for ${params.branchName}`
      : `You've been invited to ${params.branchName} on POS`;
    const actionText = params.isExistingUser
      ? 'Sign in to the POS portal using this email address to access your branch workspace.'
      : 'Complete your account signup with this email address, then sign in to the POS portal to claim your branch workspace.';

    try {
      await this.emailService.send({
        to: params.email,
        subject,
        text: `${actionText}\n\nPOS portal: ${portalUrl}`,
        html: `<p>${actionText}</p><p><a href="${portalUrl}">Open POS portal</a></p>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to queue POS branch invite email for ${params.email}: ${message}`,
      );
    }
  }
}
