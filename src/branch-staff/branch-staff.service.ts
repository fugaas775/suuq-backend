import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AssignBranchStaffDto } from './dto/assign-branch-staff.dto';
import { CreateBranchStaffManualAccountDto } from './dto/create-branch-staff-manual-account.dto';
import { InviteBranchStaffDto } from './dto/invite-branch-staff.dto';
import {
  BranchStaffAssignment,
  BranchStaffCapability,
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
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { User } from '../users/entities/user.entity';
import { POS_BRANCH_SUBSCRIPTION_OPTIONS } from './pos-workspace-pricing';

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
  assignedSurfaces: string[] | null;
  capabilities: BranchStaffCapability[];
  isOwner: boolean;
  isTenantOwner: boolean;
  retailTenantId: number | null;
  retailTenantName: string | null;
  modules: RetailModule[];
  workspaceStatus: 'ACTIVE';
  subscriptionStatus: TenantSubscriptionStatus | null;
  planCode: string | null;
  canStartActivation: boolean;
  canOpenNow: boolean;
  joinedAt: Date;
  phone: string | null;
  tinNumber: string | null;
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
  phone: string | null;
  tinNumber: string | null;
  role: BranchStaffRole;
  permissions: string[];
  assignedSurfaces: string[] | null;
  capabilities: BranchStaffCapability[];
  isOwner: boolean;
  isTenantOwner: boolean;
  retailTenantId: number | null;
  retailTenantName: string | null;
  workspaceStatus:
    | 'TENANT_SETUP_REQUIRED'
    | 'TENANT_INACTIVE'
    | 'MODULE_SETUP_REQUIRED'
    | 'PAYMENT_REQUIRED'
    | 'PAST_DUE'
    | 'EXPIRED'
    | 'CANCELLED';
  subscriptionStatus: TenantSubscriptionStatus | null;
  planCode: string | null;
  canStartActivation: boolean;
  canOpenNow: boolean;
  activationBlockers: string[];
  pricing: {
    amount: number;
    currency: string;
    billingInterval: TenantBillingInterval;
    paymentMethod: string;
    subscriptionOptions: Array<{
      period: 'SIX_MONTHS' | 'ONE_YEAR';
      months: number;
      amount: number;
      currency: string;
      label: string;
      planCode: string;
    }>;
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
    @InjectRepository(TenantSubscription)
    private readonly tenantSubscriptionsRepository: Repository<TenantSubscription>,
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
        select: { id: true, capabilities: true },
      }),
    ]);

    const managerCapabilities = Array.isArray(managerAssignment?.capabilities)
      ? managerAssignment.capabilities
      : [];

    if (
      ownedBranch ||
      managerCapabilities.includes(BranchStaffCapability.MANAGE_BRANCH_STAFF)
    ) {
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
      dto.assignedSurfaces ?? null,
      dto.capabilities ?? [],
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

  async findByBranch(branchId: number) {
    return this.assignmentsRepository.find({
      where: { branchId, isActive: true },
      order: { createdAt: 'DESC' },
      relations: { user: true, branch: true },
    });
  }

  async invite(
    branchId: number,
    dto: InviteBranchStaffDto,
    actor?: { id?: number | null; email?: string | null },
  ) {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId, isActive: true },
      select: { id: true, name: true },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const normalizedEmail = this.normalizeEmail(dto.email);
    const normalizedPermissions = this.normalizePermissions(dto.permissions);
    const existingUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });
    const existingInvite = await this.invitesRepository.findOne({
      where: { branchId, email: normalizedEmail },
    });

    if (existingUser) {
      const result = await this.upsertAssignment(
        branchId,
        existingUser.id,
        dto.role,
        normalizedPermissions,
      );

      const linkedInvite = this.invitesRepository.create({
        ...(existingInvite ?? {}),
        branchId,
        email: normalizedEmail,
        role: dto.role,
        permissions: normalizedPermissions,
        invitedByUserId: actor?.id ?? null,
        acceptedByUserId: existingUser.id,
        acceptedAt: new Date(),
        isActive: false,
      });
      const savedInvite = await this.invitesRepository.save(linkedInvite);

      await this.sendInvitationEmail({
        email: normalizedEmail,
        branchName: branch.name,
        isExistingUser: true,
      });

      await this.logManagerChangeIfNeeded({
        branchId,
        actor,
        userId: existingUser.id,
        email: normalizedEmail,
        previousRole: result.previousRole,
        nextRole: result.assignment.role,
        changeType:
          result.previousRole === BranchStaffRole.MANAGER
            ? 'UPDATED'
            : 'INVITED',
      });

      return {
        status: 'LINKED_EXISTING_USER' as const,
        invite: savedInvite,
        assignment: result.assignment,
      };
    }

    const invite = this.invitesRepository.create({
      ...(existingInvite ?? {}),
      branchId,
      email: normalizedEmail,
      role: dto.role,
      permissions: normalizedPermissions,
      invitedByUserId: actor?.id ?? null,
      acceptedByUserId: null,
      acceptedAt: null,
      isActive: true,
    });
    const savedInvite = await this.invitesRepository.save(invite);

    await this.sendInvitationEmail({
      email: normalizedEmail,
      branchName: branch.name,
      isExistingUser: false,
    });

    await this.logManagerChangeIfNeeded({
      branchId,
      actor,
      email: normalizedEmail,
      previousRole: null,
      nextRole: dto.role,
      changeType: 'INVITED',
    });

    return {
      status: 'PENDING_SIGNUP' as const,
      invite: savedInvite,
      assignment: null,
    };
  }

  async findInvitesByBranch(branchId: number) {
    return this.invitesRepository.find({
      where: { branchId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async resendInvite(
    branchId: number,
    inviteId: number,
    actor?: { id?: number | null; email?: string | null },
  ) {
    const invite = await this.invitesRepository.findOne({
      where: { id: inviteId, branchId, isActive: true },
      relations: { branch: true },
    });

    if (!invite) {
      throw new NotFoundException('Active branch invite not found.');
    }

    invite.invitedByUserId = actor?.id ?? invite.invitedByUserId ?? null;
    const savedInvite = await this.invitesRepository.save(invite);

    await this.sendInvitationEmail({
      email: invite.email,
      branchName: invite.branch?.name || `Branch ${branchId}`,
      isExistingUser: false,
    });

    return {
      status: 'RESENT' as const,
      invite: savedInvite,
    };
  }

  async revokeInvite(branchId: number, inviteId: number) {
    const invite = await this.invitesRepository.findOne({
      where: { id: inviteId, branchId, isActive: true },
    });

    if (!invite) {
      throw new NotFoundException('Active branch invite not found.');
    }

    invite.isActive = false;
    const savedInvite = await this.invitesRepository.save(invite);

    return {
      status: 'REVOKED' as const,
      invite: savedInvite,
    };
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

          if (workspace.workspaceStatus !== 'ACTIVE') {
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
            canStartActivation: false,
            canOpenNow: true,
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
          phone: summary.phone ?? null,
          tinNumber: summary.tinNumber ?? null,
          role: summary.role,
          isOwner: summary.isOwner,
          isTenantOwner: summary.isTenantOwner,
          retailTenantId: workspace.tenant?.id ?? summary.retailTenantId,
          retailTenantName: workspace.tenant?.name ?? summary.retailTenantName,
          workspaceStatus: workspace.workspaceStatus,
          subscriptionStatus: workspace.subscription?.status ?? null,
          planCode: workspace.subscription?.planCode ?? null,
          canStartActivation,
          canOpenNow: false,
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

  getPosWorkspacePricing(): PosWorkspaceActivationCandidate['pricing'] {
    // Effective monthly price is preserved (1,900 ETB) so derived metrics
    // such as equity-partner payouts keep working unchanged. The activation
    // surface should additionally show the per-period totals from
    // `subscriptionOptions` and let the user pick 6 months or 1 year.
    return {
      amount: POS_WORKSPACE_MONTHLY_PRICE,
      currency: POS_WORKSPACE_CURRENCY,
      billingInterval: TenantBillingInterval.MONTHLY,
      paymentMethod: POS_WORKSPACE_PAYMENT_METHOD,
      subscriptionOptions: POS_BRANCH_SUBSCRIPTION_OPTIONS.map((option) => ({
        period: option.period,
        months: option.months,
        amount: option.amount,
        currency: option.currency as string,
        label: option.label,
        planCode: option.planCode,
      })),
    };
  }

  private describeActivationBlockers(workspace: {
    workspaceStatus:
      | 'ACTIVE'
      | 'TENANT_SETUP_REQUIRED'
      | 'TENANT_INACTIVE'
      | 'MODULE_SETUP_REQUIRED'
      | 'PAYMENT_REQUIRED'
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
        'Complete the first monthly billing activation for this branch workspace.',
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
          'Finish billing activation for the selected branch workspace.',
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
        phone: branch.phone ?? null,
        tinNumber: branch.tinNumber ?? null,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        assignedSurfaces: null,
        capabilities: [],
        isOwner: true,
        isTenantOwner: false,
        retailTenantId: branch.retailTenantId ?? null,
        retailTenantName: null,
        modules: [],
        workspaceStatus: 'ACTIVE',
        subscriptionStatus: null,
        planCode: null,
        canStartActivation: false,
        canOpenNow: false,
        joinedAt: branch.createdAt,
      });
    }

    for (const tenant of tenantOwnedTenants) {
      for (const branch of tenant.branches ?? []) {
        if (!branch?.isActive || byBranchId.has(branch.id)) {
          continue;
        }
        // Skip branches explicitly transferred to another owner.
        // If ownerId is set and doesn't match the tenant owner, the branch
        // has been transferred and should no longer appear via tenant access.
        if (branch.ownerId != null && branch.ownerId !== user.id) {
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
          phone: branch.phone ?? null,
          tinNumber: branch.tinNumber ?? null,
          role: BranchStaffRole.MANAGER,
          permissions: [],
          assignedSurfaces: null,
          capabilities: [],
          isOwner: false,
          isTenantOwner: true,
          retailTenantId: branch.retailTenantId ?? tenant.id,
          retailTenantName: tenant.name,
          modules: [],
          workspaceStatus: 'ACTIVE',
          subscriptionStatus: null,
          planCode: null,
          canStartActivation: false,
          canOpenNow: false,
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
        phone: existing?.phone ?? assignment.branch.phone ?? null,
        tinNumber: existing?.tinNumber ?? assignment.branch.tinNumber ?? null,
        role: assignment.role ?? existing?.role ?? BranchStaffRole.OPERATOR,
        permissions: mergedPermissions,
        assignedSurfaces:
          assignment.assignedSurfaces && assignment.assignedSurfaces.length > 0
            ? assignment.assignedSurfaces
            : (existing?.assignedSurfaces ?? null),
        capabilities: Array.from(
          new Set([
            ...(existing?.capabilities ?? []),
            ...(assignment.capabilities ?? []),
          ]),
        ).sort() as BranchStaffCapability[],
        isOwner: existing?.isOwner ?? false,
        isTenantOwner: existing?.isTenantOwner ?? false,
        retailTenantId:
          existing?.retailTenantId ?? assignment.branch.retailTenantId ?? null,
        retailTenantName: existing?.retailTenantName ?? null,
        modules: existing?.modules ?? [],
        workspaceStatus: existing?.workspaceStatus ?? 'ACTIVE',
        subscriptionStatus: existing?.subscriptionStatus ?? null,
        planCode: existing?.planCode ?? null,
        canStartActivation: existing?.canStartActivation ?? false,
        canOpenNow: existing?.canOpenNow ?? false,
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

  private normalizeCapabilities(
    capabilities?: BranchStaffCapability[],
    role?: BranchStaffRole,
  ): BranchStaffCapability[] {
    const normalized = new Set((capabilities ?? []).filter(Boolean));

    if (role === BranchStaffRole.MANAGER) {
      normalized.add(BranchStaffCapability.MANAGE_BRANCH_STAFF);
    }

    return Array.from(normalized).sort();
  }

  private async upsertAssignment(
    branchId: number,
    userId: number,
    role: BranchStaffRole,
    permissions: string[],
    assignedSurfaces: string[] | null = null,
    capabilities: BranchStaffCapability[] = [],
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
      assignedSurfaces:
        assignedSurfaces && assignedSurfaces.length > 0
          ? assignedSurfaces
          : null,
      capabilities: this.normalizeCapabilities(capabilities, role),
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

  async createManualAccount(
    branchId: number,
    dto: CreateBranchStaffManualAccountDto,
    actor: { id?: number | null; roles?: string[] },
  ) {
    await this.assertCanManageBranchStaff(actor, branchId);

    const branch = await this.branchesRepository.findOne({
      where: { id: branchId, isActive: true },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const normalizedUsername = String(dto.username || '')
      .trim()
      .toLowerCase();

    const existing = await this.usersRepository.findOne({
      where: { posUsername: normalizedUsername },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: 'POS_BRANCH_STAFF_USERNAME_CONFLICT',
          message: 'This username is already in use.',
          details: { field: 'username' },
        },
      });
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const internalEmail = `pos.m.${normalizedUsername}@sys.internal`;

    const user = this.usersRepository.create({
      email: internalEmail,
      posUsername: normalizedUsername,
      authMode: 'MANUAL',
      displayName: dto.displayName?.trim() || null,
      password: hashedPassword,
      roles: [],
      isActive: true,
    });
    await this.usersRepository.save(user);

    const assignment = this.assignmentsRepository.create({
      branchId: branch.id,
      userId: user.id,
      role: dto.role,
      permissions: dto.permissions ?? [],
      assignedSurfaces:
        dto.assignedSurfaces && dto.assignedSurfaces.length > 0
          ? dto.assignedSurfaces
          : null,
      capabilities: this.normalizeCapabilities(dto.capabilities, dto.role),
      isActive: true,
    });
    await this.assignmentsRepository.save(assignment);

    return {
      status: 'CREATED',
      branchId: branch.id,
      username: normalizedUsername,
      user: {
        id: user.id,
        username: normalizedUsername,
        email: null,
        displayName: user.displayName ?? null,
        authMode: 'MANUAL',
      },
      assignment: {
        id: assignment.id,
        branchId: assignment.branchId,
        userId: assignment.userId,
        role: assignment.role,
        permissions: assignment.permissions,
        assignedSurfaces: assignment.assignedSurfaces ?? null,
        capabilities: assignment.capabilities ?? [],
        createdAt: assignment.createdAt,
        username: normalizedUsername,
        authMode: 'MANUAL',
      },
    };
  }

  async updateAssignment(
    branchId: number,
    userId: number,
    dto: {
      role?: BranchStaffRole;
      permissions?: string[];
      assignedSurfaces?: string[] | null;
      capabilities?: BranchStaffCapability[];
    },
    actor: { id?: number | null; email?: string | null; roles?: string[] },
  ) {
    await this.assertCanManageBranchStaff(actor, branchId);

    const assignment = await this.assignmentsRepository.findOne({
      where: { branchId, userId, isActive: true },
      relations: { user: true },
    });
    if (!assignment) {
      throw new NotFoundException('Active branch staff assignment not found.');
    }

    const previousRole = assignment.role;

    if (dto.role) {
      assignment.role = dto.role;
    }
    if (Array.isArray(dto.permissions)) {
      assignment.permissions = dto.permissions;
    }
    if (dto.assignedSurfaces !== undefined) {
      assignment.assignedSurfaces =
        dto.assignedSurfaces && dto.assignedSurfaces.length > 0
          ? dto.assignedSurfaces
          : null;
    }
    if (dto.capabilities !== undefined) {
      assignment.capabilities = this.normalizeCapabilities(
        dto.capabilities,
        assignment.role,
      );
    }

    const saved = await this.assignmentsRepository.save(assignment);

    if (dto.role && dto.role !== previousRole) {
      await this.logManagerChangeIfNeeded({
        branchId,
        actor,
        userId,
        previousRole,
        nextRole: saved.role,
        changeType: 'UPDATED',
      });
    }

    return saved;
  }

  async deleteStaffAccount(
    branchId: number,
    userId: number,
    actor: { id?: number | null; email?: string | null; roles?: string[] },
  ) {
    await this.assertCanManageBranchStaff(actor, branchId);

    const assignment = await this.assignmentsRepository.findOne({
      where: { branchId, userId },
      relations: { user: true },
    });
    if (!assignment) {
      throw new NotFoundException('Branch staff assignment not found.');
    }

    const targetUser = assignment.user;
    if (targetUser && targetUser.authMode !== 'MANUAL') {
      throw new ForbiddenException({
        error: {
          code: 'POS_BRANCH_STAFF_DELETE_NOT_ALLOWED',
          message:
            'Only manually-created POS staff accounts can be deleted from this surface.',
        },
      });
    }

    const previousRole = assignment.role;
    assignment.isActive = false;
    assignment.assignedSurfaces = null;
    assignment.capabilities = [];
    await this.assignmentsRepository.save(assignment);

    if (targetUser) {
      targetUser.isActive = false;
      targetUser.posUsername = null;
      await this.usersRepository.save(targetUser);
    }

    await this.logManagerChangeIfNeeded({
      branchId,
      actor,
      userId,
      email: targetUser?.email ?? null,
      previousRole,
      nextRole: null,
      changeType: 'REMOVED',
    });

    return {
      status: 'DELETED',
      branchId,
      userId,
      assignment: {
        id: assignment.id,
        branchId: assignment.branchId,
        userId: assignment.userId,
        role: assignment.role,
        isActive: assignment.isActive,
      },
    };
  }

  async linkGoogleAccount(
    actor: { id?: number | null },
    googleUid: string,
    googleEmail: string,
  ) {
    if (!actor?.id) {
      throw new ForbiddenException('Authentication required.');
    }
    if (!googleUid || !googleEmail) {
      throw new ConflictException({
        error: {
          code: 'POS_PORTAL_GOOGLE_LINK_INVALID',
          message: 'Google account details are missing.',
        },
      });
    }

    const user = await this.usersRepository.findOne({
      where: { id: actor.id },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (
      user.email &&
      user.email.toLowerCase() !== googleEmail.toLowerCase() &&
      !user.email.endsWith('@sys.internal')
    ) {
      throw new ConflictException({
        error: {
          code: 'POS_PORTAL_GOOGLE_LINK_EMAIL_MISMATCH',
          message:
            'The Google account email must match the email on file for this user.',
        },
      });
    }

    const existing = await this.usersRepository.findOne({
      where: { firebaseUid: googleUid },
    });
    if (existing && existing.id !== user.id) {
      throw new ConflictException({
        error: {
          code: 'POS_PORTAL_GOOGLE_LINK_ALREADY_LINKED',
          message: 'This Google account is already linked to a different user.',
        },
      });
    }

    user.firebaseUid = googleUid;
    if (!user.email || user.email.endsWith('@sys.internal')) {
      user.email = googleEmail;
    }
    await this.usersRepository.save(user);

    return {
      status: 'LINKED',
      userId: user.id,
      email: user.email,
      googleLinked: true,
    };
  }
}
