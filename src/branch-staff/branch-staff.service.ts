import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
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
  serviceFormat: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  role: BranchStaffRole;
  permissions: string[];
  isOwner: boolean;
  isTenantOwner: boolean;
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
  serviceFormat: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  role: BranchStaffRole;
  isOwner: boolean;
  isTenantOwner: boolean;
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
  activationBlockers: string[];
  pricing: {
    amount: number;
    currency: string;
    billingInterval: TenantBillingInterval;
    paymentMethod: string;
  };
}

export interface PosBranchRosterPersonSummary {
  userId: number | null;
  email: string | null;
  displayName: string | null;
  isOwner: boolean;
}

export interface PosBranchRosterSummary {
  branchId: number;
  managerCount: number;
  operatorCount: number;
  assignedManagers: PosBranchRosterPersonSummary[];
  assignedOperators: PosBranchRosterPersonSummary[];
}

export interface PosPortalSupportDiagnostic {
  searchedEmail: string;
  user: {
    id: number;
    email: string;
    roles: string[];
    displayName: string | null;
  } | null;
  branchAssignments: PosBranchSummary[];
  workspaceActivationCandidates: PosWorkspaceActivationCandidate[];
  summary: {
    status:
      | 'USER_NOT_FOUND'
      | 'ACTIVE_BRANCH_ACCESS'
      | 'ACTIVATION_REQUIRED'
      | 'NO_BRANCH_ACCESS';
    branchAssignmentCount: number;
    activationCandidateCount: number;
    canOpenNow: boolean;
    likelyRootCause: string | null;
    recommendedActions: string[];
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
    @InjectRepository(RetailTenant)
    private readonly retailTenantsRepository: Repository<RetailTenant>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly emailService: EmailService,
    private readonly retailEntitlementsService: RetailEntitlementsService,
    private readonly auditService: AuditService,
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

  async assign(
    branchId: number,
    dto: AssignBranchStaffDto,
    actor?: { id?: number | null; email?: string | null },
  ) {
    const result = await this.upsertAssignment(
      branchId,
      dto.userId,
      dto.role,
      dto.permissions ?? [],
    );

    await this.logManagerChangeIfNeeded({
      branchId,
      actor,
      userId: dto.userId,
      previousRole: result.previousRole,
      nextRole: result.assignment.role,
      changeType:
        result.previousRole === BranchStaffRole.MANAGER
          ? 'UPDATED'
          : 'ASSIGNED',
    });

    return result.assignment;
  }

  async unassign(
    branchId: number,
    userId: number,
    actor?: { id?: number | null; email?: string | null },
  ) {
    const assignment = await this.assignmentsRepository.findOne({
      where: { branchId, userId, isActive: true },
      relations: { user: true },
    });

    if (!assignment) {
      throw new NotFoundException('Active branch staff assignment not found.');
    }

    assignment.isActive = false;
    const savedAssignment = await this.assignmentsRepository.save(assignment);

    await this.logManagerChangeIfNeeded({
      branchId,
      actor,
      userId,
      email: assignment.user?.email ?? null,
      previousRole: assignment.role,
      nextRole: null,
      changeType: 'REMOVED',
    });

    return savedAssignment;
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
      const assignmentResult = await this.upsertAssignment(
        branchId,
        user.id,
        dto.role,
        permissions,
      );
      assignment = assignmentResult.assignment;

      await this.logManagerChangeIfNeeded({
        branchId,
        actor: {
          id: invitedByUserId ?? null,
          email: null,
        },
        userId: user.id,
        email,
        previousRole: assignmentResult.previousRole,
        nextRole: assignment.role,
        changeType:
          assignmentResult.previousRole === BranchStaffRole.MANAGER
            ? 'UPDATED'
            : 'ASSIGNED',
      });
    }

    if (!user && dto.role === BranchStaffRole.MANAGER) {
      await this.logBranchManagerChange({
        branchId,
        actor: {
          id: invitedByUserId ?? null,
          email: null,
        },
        changeType: 'INVITED',
        email,
        previousRole: null,
        nextRole: dto.role,
      });
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
          summary.isOwner ||
          summary.isTenantOwner ||
          summary.role === BranchStaffRole.MANAGER;
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
          serviceFormat: summary.serviceFormat,
          address: summary.address ?? null,
          city: summary.city ?? null,
          country: summary.country ?? null,
          timezone: summary.timezone ?? null,
          role: summary.role,
          isOwner: summary.isOwner,
          isTenantOwner: summary.isTenantOwner,
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
          activationBlockers: this.describeActivationBlockers(workspace),
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

  async getPortalAccessDiagnosticsByEmail(
    email: string,
  ): Promise<PosPortalSupportDiagnostic> {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        roles: true,
        displayName: true,
      },
    });

    if (!user) {
      return {
        searchedEmail: normalizedEmail,
        user: null,
        branchAssignments: [],
        workspaceActivationCandidates: [],
        summary: {
          status: 'USER_NOT_FOUND',
          branchAssignmentCount: 0,
          activationCandidateCount: 0,
          canOpenNow: false,
          likelyRootCause: 'No user record matches this email address.',
          recommendedActions: [
            'Confirm the operator signed in with the exact invited or owner email address.',
            'If the account should exist, ask the user to retry sign-in or create the account first.',
          ],
        },
      };
    }

    const [branchAssignments, workspaceActivationCandidates] =
      await Promise.all([
        this.getPosBranchSummariesForUser({ id: user.id, roles: user.roles }),
        this.getPosWorkspaceActivationCandidatesForUser({
          id: user.id,
          roles: user.roles,
        }),
      ]);

    const hasActiveBranchAccess = branchAssignments.length > 0;
    const hasActivationCandidates = workspaceActivationCandidates.length > 0;
    const primaryCandidate = workspaceActivationCandidates[0] || null;

    return {
      searchedEmail: normalizedEmail,
      user: {
        id: user.id,
        email: user.email,
        roles: Array.isArray(user.roles) ? user.roles : [],
        displayName: user.displayName ?? null,
      },
      branchAssignments,
      workspaceActivationCandidates,
      summary: {
        status: hasActiveBranchAccess
          ? 'ACTIVE_BRANCH_ACCESS'
          : hasActivationCandidates
            ? 'ACTIVATION_REQUIRED'
            : 'NO_BRANCH_ACCESS',
        branchAssignmentCount: branchAssignments.length,
        activationCandidateCount: workspaceActivationCandidates.length,
        canOpenNow: hasActiveBranchAccess,
        likelyRootCause: hasActiveBranchAccess
          ? 'The user already has at least one active POS branch workspace.'
          : primaryCandidate?.activationBlockers?.[0] ||
            (hasActivationCandidates
              ? 'The user is linked to a branch, but activation is still incomplete.'
              : 'The user has no active branch assignment or openable POS workspace.'),
        recommendedActions: this.buildPortalDiagnosticActions({
          hasActiveBranchAccess,
          hasActivationCandidates,
          primaryCandidate,
        }),
      },
    };
  }

  async getBranchRosterSummaries(
    branchIds: number[],
  ): Promise<PosBranchRosterSummary[]> {
    const resolvedBranchIds = Array.from(
      new Set(
        (branchIds ?? []).filter((branchId): branchId is number =>
          Number.isInteger(branchId),
        ),
      ),
    );

    if (!resolvedBranchIds.length) {
      return [];
    }

    const [branches, assignments] = await Promise.all([
      this.branchesRepository.find({
        where: { id: In(resolvedBranchIds) },
        relations: { owner: true },
      }),
      this.assignmentsRepository.find({
        where: { branchId: In(resolvedBranchIds), isActive: true },
        relations: { user: true },
      }),
    ]);

    const rosterByBranchId = new Map<number, PosBranchRosterSummary>();

    for (const branch of branches) {
      const assignedManagers: PosBranchRosterPersonSummary[] = [];

      if (branch.owner) {
        assignedManagers.push({
          userId: branch.owner.id,
          email: branch.owner.email ?? null,
          displayName:
            branch.owner.displayName ?? branch.owner.contactName ?? null,
          isOwner: true,
        });
      }

      rosterByBranchId.set(branch.id, {
        branchId: branch.id,
        managerCount: assignedManagers.length,
        operatorCount: 0,
        assignedManagers,
        assignedOperators: [],
      });
    }

    for (const assignment of assignments) {
      const current = rosterByBranchId.get(assignment.branchId) || {
        branchId: assignment.branchId,
        managerCount: 0,
        operatorCount: 0,
        assignedManagers: [],
        assignedOperators: [],
      };
      const person = {
        userId: assignment.user?.id ?? assignment.userId ?? null,
        email: assignment.user?.email ?? null,
        displayName:
          assignment.user?.displayName ?? assignment.user?.contactName ?? null,
        isOwner: false,
      };

      if (assignment.role === BranchStaffRole.MANAGER) {
        if (
          !current.assignedManagers.some(
            (entry) =>
              entry.userId === person.userId && entry.email === person.email,
          )
        ) {
          current.assignedManagers.push(person);
        }
      } else if (
        !current.assignedOperators.some(
          (entry) =>
            entry.userId === person.userId && entry.email === person.email,
        )
      ) {
        current.assignedOperators.push(person);
      }

      current.managerCount = current.assignedManagers.length;
      current.operatorCount = current.assignedOperators.length;
      rosterByBranchId.set(assignment.branchId, current);
    }

    return resolvedBranchIds.map((branchId) => {
      return (
        rosterByBranchId.get(branchId) || {
          branchId,
          managerCount: 0,
          operatorCount: 0,
          assignedManagers: [],
          assignedOperators: [],
        }
      );
    });
  }

  getPosWorkspacePricing() {
    return {
      amount: POS_WORKSPACE_MONTHLY_PRICE,
      currency: POS_WORKSPACE_CURRENCY,
      billingInterval: TenantBillingInterval.MONTHLY,
      paymentMethod: POS_WORKSPACE_PAYMENT_METHOD,
    };
  }

  private describeActivationBlockers(workspace: {
    workspaceStatus:
      | 'ACTIVE'
      | 'TENANT_SETUP_REQUIRED'
      | 'TENANT_INACTIVE'
      | 'MODULE_SETUP_REQUIRED'
      | 'PAYMENT_REQUIRED'
      | 'TRIAL'
      | 'PAST_DUE'
      | 'EXPIRED'
      | 'CANCELLED';
    subscription: { status?: TenantSubscriptionStatus | null } | null;
    branch?: { serviceFormat?: string | null };
    governance?: { activationReadiness?: { blockers?: string[] } } | null;
  }) {
    const blockers: string[] = [];

    if (
      workspace.workspaceStatus === 'PAYMENT_REQUIRED' &&
      !workspace.subscription
    ) {
      blockers.push(
        'Start a 15-day trial or complete the first monthly billing activation for this branch workspace.',
      );
    }

    if (workspace.workspaceStatus === 'PAST_DUE') {
      blockers.push(
        'This branch workspace has a past-due monthly billing balance.',
      );
    }

    if (workspace.workspaceStatus === 'EXPIRED') {
      blockers.push(
        'This branch workspace subscription expired and must be reactivated.',
      );
    }

    if (workspace.workspaceStatus === 'CANCELLED') {
      blockers.push(
        'This branch workspace subscription was cancelled and must be reactivated.',
      );
    }

    if (workspace.workspaceStatus === 'MODULE_SETUP_REQUIRED') {
      blockers.push(
        'POS_CORE entitlement must be enabled before this branch can open in POS-S.',
      );
    }

    if (workspace.workspaceStatus === 'TENANT_SETUP_REQUIRED') {
      blockers.push('This branch is not linked to a retail tenant yet.');
    }

    if (workspace.workspaceStatus === 'TENANT_INACTIVE') {
      blockers.push('The linked retail tenant is inactive.');
    }

    if (!String(workspace.branch?.serviceFormat || '').trim()) {
      blockers.push(
        'Set a branch service format such as RETAIL before starting activation.',
      );
    }

    const govBlockers =
      workspace.governance?.activationReadiness?.blockers || [];
    const hasServiceFormat = Boolean(workspace.branch?.serviceFormat);
    blockers.push(
      ...govBlockers.filter(
        (b) =>
          !(
            hasServiceFormat &&
            (b === 'Choose a primary retail category.' ||
              b === 'Choose a POS fit category.')
          ),
      ),
    );

    return Array.from(new Set(blockers.filter(Boolean)));
  }

  private buildPortalDiagnosticActions(params: {
    hasActiveBranchAccess: boolean;
    hasActivationCandidates: boolean;
    primaryCandidate: PosWorkspaceActivationCandidate | null;
  }) {
    if (params.hasActiveBranchAccess) {
      return [
        'Ask the user to retry sign-in or refresh the POS frontend if they still cannot enter POS-S.',
        'If sign-in still fails, inspect the browser network response for /api/pos-portal/auth/google or /login.',
      ];
    }

    if (params.hasActivationCandidates) {
      return Array.from(
        new Set([
          ...(params.primaryCandidate?.activationBlockers || []),
          'Finish trial or billing activation for the selected branch workspace.',
          'If this is a legacy self-serve branch, backfill the missing serviceFormat before retrying activation.',
        ]),
      );
    }

    return [
      'Confirm the user was invited or assigned to the correct branch workspace.',
      'If this should be the tenant owner, create the first self-serve POS workspace before retrying sign-in.',
    ];
  }

  private async collectPosBranchAccessForUser(user: {
    id: number;
    roles?: string[];
  }): Promise<Map<number, PosBranchSummary>> {
    const [ownedBranches, tenantOwnedTenants, assignments] = await Promise.all([
      this.branchesRepository.find({
        where: { ownerId: user.id, isActive: true },
        order: { createdAt: 'ASC' },
      }),
      this.retailTenantsRepository.find({
        where: { ownerUserId: user.id },
        relations: { branches: true },
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
        serviceFormat: branch.serviceFormat ?? null,
        address: branch.address ?? null,
        city: branch.city ?? null,
        country: branch.country ?? null,
        timezone: branch.timezone ?? null,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isOwner: true,
        isTenantOwner: false,
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

    for (const tenant of tenantOwnedTenants) {
      for (const branch of tenant.branches ?? []) {
        if (!branch?.isActive || byBranchId.has(branch.id)) {
          continue;
        }

        byBranchId.set(branch.id, {
          branchId: branch.id,
          branchName: branch.name,
          branchCode: branch.code ?? null,
          serviceFormat: branch.serviceFormat ?? null,
          address: branch.address ?? null,
          city: branch.city ?? null,
          country: branch.country ?? null,
          timezone: branch.timezone ?? null,
          role: BranchStaffRole.MANAGER,
          permissions: [],
          isOwner: false,
          isTenantOwner: true,
          retailTenantId: branch.retailTenantId ?? tenant.id,
          retailTenantName: tenant.name,
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
        serviceFormat:
          existing?.serviceFormat ?? assignment.branch.serviceFormat ?? null,
        address: existing?.address ?? assignment.branch.address ?? null,
        city: existing?.city ?? assignment.branch.city ?? null,
        country: existing?.country ?? assignment.branch.country ?? null,
        timezone: existing?.timezone ?? assignment.branch.timezone ?? null,
        role: assignment.role ?? existing?.role ?? BranchStaffRole.OPERATOR,
        permissions: mergedPermissions,
        isOwner: existing?.isOwner ?? false,
        isTenantOwner: existing?.isTenantOwner ?? false,
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
  ): Promise<{
    assignment: BranchStaffAssignment;
    previousRole: BranchStaffRole | null;
  }> {
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

    return {
      assignment: await this.assignmentsRepository.save(assignment),
      previousRole: existing?.role ?? null,
    };
  }

  private async logManagerChangeIfNeeded(params: {
    branchId: number;
    actor?: { id?: number | null; email?: string | null };
    userId?: number | null;
    email?: string | null;
    previousRole: BranchStaffRole | null;
    nextRole: BranchStaffRole | null;
    changeType: 'ASSIGNED' | 'UPDATED' | 'REMOVED' | 'INVITED';
  }) {
    const involvesManagerRole =
      params.previousRole === BranchStaffRole.MANAGER ||
      params.nextRole === BranchStaffRole.MANAGER;

    if (!involvesManagerRole) {
      return;
    }

    await this.logBranchManagerChange(params);
  }

  private async logBranchManagerChange(params: {
    branchId: number;
    actor?: { id?: number | null; email?: string | null };
    userId?: number | null;
    email?: string | null;
    previousRole: BranchStaffRole | null;
    nextRole: BranchStaffRole | null;
    changeType: 'ASSIGNED' | 'UPDATED' | 'REMOVED' | 'INVITED';
  }) {
    const branch = await this.branchesRepository.findOne({
      where: { id: params.branchId },
    });

    if (!branch) {
      return;
    }

    await this.auditService.log({
      action: 'tenant.branchManager.change',
      targetType: branch.retailTenantId ? 'RETAIL_TENANT' : 'BRANCH',
      targetId: branch.retailTenantId ?? branch.id,
      actorId: params.actor?.id ?? null,
      actorEmail: params.actor?.email ?? null,
      meta: {
        branchId: branch.id,
        branchName: branch.name,
        retailTenantId: branch.retailTenantId ?? null,
        userId: params.userId ?? null,
        email: params.email ?? null,
        previousRole: params.previousRole ?? null,
        nextRole: params.nextRole ?? null,
        changeType: params.changeType,
      },
    });
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
