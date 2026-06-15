import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../auth/roles.enum';
import { User } from '../users/entities/user.entity';
import {
  SupplierActivationStatus,
  SupplierOnboardingStatus,
  SupplierProfile,
} from './entities/supplier-profile.entity';
import {
  SupplierStaffAssignment,
  SupplierStaffRole,
} from './entities/supplier-staff-assignment.entity';
import { CreateSupplierStaffManualAccountDto } from './dto/create-supplier-staff-manual-account.dto';
import { UpdateSupplierStaffDto } from './dto/update-supplier-staff.dto';
import { actorIsSuperAdmin } from './active-supplier.util';

/**
 * The branch-INDEPENDENT supplier identity surfaced into the portal session and
 * used by every supplier gate. Resolved from supplier_staff_assignments joined
 * to supplier_profiles — never from a branch.
 */
export interface SupplierContext {
  supplierProfileId: number;
  companyName: string;
  role: SupplierStaffRole;
  isOwner: boolean;
  activationStatus: SupplierActivationStatus;
  onboardingStatus: SupplierOnboardingStatus;
  permissions: string[];
  /** UI hint: account is active AND the member can publish (manager-level). */
  canPublishOffers: boolean;
}

type Actor = {
  id?: number | null;
  roles?: string[];
  /**
   * Multi-supplier: the supplier profile the caller is currently operating
   * (from the `x-supplier-id` header). When set and the user is a member of it,
   * context resolution prefers it over the account's primary supplier.
   */
  supplierId?: number | null;
};

/**
 * Team-roster row returned to the supplier staff surface. Deliberately omits the
 * User password hash and synthetic internal email — manual logins are addressed
 * by their username.
 */
export interface SupplierStaffMember {
  id: number;
  userId: number;
  role: SupplierStaffRole;
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
  user: {
    id: number;
    displayName: string | null;
    username: string | null;
    authMode: string | null;
  } | null;
}

@Injectable()
export class SupplierStaffService {
  constructor(
    @InjectRepository(SupplierProfile)
    private readonly profilesRepository: Repository<SupplierProfile>,
    @InjectRepository(SupplierStaffAssignment)
    private readonly assignmentsRepository: Repository<SupplierStaffAssignment>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  private buildSupplierContext(
    profile: SupplierProfile,
    role: SupplierStaffRole,
    permissions: string[],
    userId: number,
  ): SupplierContext {
    const managerLevel = role === SupplierStaffRole.MANAGER;
    return {
      supplierProfileId: profile.id,
      companyName: profile.companyName,
      role,
      isOwner: profile.userId === userId,
      activationStatus: profile.activationStatus,
      onboardingStatus: profile.onboardingStatus,
      permissions,
      canPublishOffers:
        managerLevel &&
        profile.activationStatus === SupplierActivationStatus.ACTIVE &&
        profile.isActive,
    };
  }

  /**
   * Resolve the ACTIVE supplier identity for a user, independent of any branch.
   * With multi-supplier an account may belong to several supplier profiles; when
   * the caller names one (`actor.supplierId`) and is a member of it, that one is
   * returned. Otherwise this prefers an explicit staff assignment and falls back
   * to a directly-owned profile (legacy). Returns null when the user has none.
   */
  async getSupplierContextForUser(
    actor: Actor,
  ): Promise<SupplierContext | null> {
    const userId = Number(actor?.id);
    if (!Number.isFinite(userId) || userId <= 0) return null;

    // Explicit selection → resolve from the full set so the chosen profile wins.
    const preferredId = Number(actor?.supplierId);
    if (Number.isFinite(preferredId) && preferredId > 0) {
      // SUPER_ADMIN acting as a supplier owner: resolve the explicitly-named
      // supplier directly (not restricted to owned/assigned profiles) and grant
      // a manager-level context for full support management. Requires BOTH the
      // role AND an explicit x-supplier-id, mirroring the branch act-as.
      if (actorIsSuperAdmin(actor?.roles)) {
        const profile = await this.profilesRepository.findOne({
          where: { id: preferredId },
        });
        if (profile) {
          return this.buildSupplierContext(
            profile,
            SupplierStaffRole.MANAGER,
            [],
            userId,
          );
        }
      }
      const contexts = await this.getSupplierContextsForUser(actor);
      return (
        contexts.find((c) => c.supplierProfileId === preferredId) ||
        contexts[0] ||
        null
      );
    }

    // Default (single active) path — the account's primary supplier.
    const assignment = await this.assignmentsRepository.findOne({
      where: { userId, isActive: true },
      relations: { supplierProfile: true },
      order: { role: 'ASC' }, // MANAGER < OPERATOR alphabetically → prefer MANAGER
    });

    if (assignment?.supplierProfile) {
      return this.buildSupplierContext(
        assignment.supplierProfile,
        assignment.role,
        assignment.permissions ?? [],
        userId,
      );
    }

    // Legacy / owner-without-assignment fallback.
    const profile = await this.profilesRepository.findOne({
      where: { userId },
    });
    if (!profile) return null;
    return this.buildSupplierContext(
      profile,
      SupplierStaffRole.MANAGER,
      [],
      userId,
    );
  }

  /**
   * Resolve EVERY supplier identity a user can act as — their owned profiles
   * plus any staff assignments — deduped by profile and ordered owner-first then
   * by id. Powers the portal's supplier switcher (availableSuppliers).
   */
  async getSupplierContextsForUser(actor: Actor): Promise<SupplierContext[]> {
    const userId = Number(actor?.id);
    if (!Number.isFinite(userId) || userId <= 0) return [];

    const assignments = await this.assignmentsRepository.find({
      where: { userId, isActive: true },
      relations: { supplierProfile: true },
      order: { role: 'ASC' }, // MANAGER < OPERATOR alphabetically → prefer MANAGER
    });

    const byProfileId = new Map<number, SupplierContext>();
    const add = (
      profile: SupplierProfile | null | undefined,
      role: SupplierStaffRole,
      permissions: string[],
    ) => {
      if (!profile || byProfileId.has(profile.id)) return;
      byProfileId.set(
        profile.id,
        this.buildSupplierContext(profile, role, permissions, userId),
      );
    };

    for (const assignment of assignments) {
      add(
        assignment.supplierProfile,
        assignment.role,
        assignment.permissions ?? [],
      );
    }

    // Owned profiles without an active assignment (legacy, or freshly created
    // before the owner assignment landed) — surface them as owner/manager.
    const ownedProfiles = await this.profilesRepository.find({
      where: { userId },
    });
    for (const profile of ownedProfiles) {
      add(profile, SupplierStaffRole.MANAGER, []);
    }

    return [...byProfileId.values()].sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return a.supplierProfileId - b.supplierProfileId;
    });
  }

  /**
   * Resolve the supplier profile a user MANAGES (owner or MANAGER assignment).
   * Throws 403 when the user is not a manager-level member of any supplier.
   */
  async requireManagedSupplierProfile(actor: Actor): Promise<SupplierProfile> {
    const ctx = await this.getSupplierContextForUser(actor);
    if (!ctx) {
      throw new ForbiddenException('No supplier account for this user');
    }
    if (ctx.role !== SupplierStaffRole.MANAGER) {
      throw new ForbiddenException(
        'Only a supplier owner or manager can perform this action',
      );
    }
    const profile = await this.profilesRepository.findOne({
      where: { id: ctx.supplierProfileId },
    });
    if (!profile) {
      throw new NotFoundException('Supplier profile not found');
    }
    if (!profile.isActive) {
      throw new ForbiddenException('This supplier account is deactivated.');
    }
    return profile;
  }

  /** Create the owner's MANAGER assignment during onboarding. */
  async createOwnerAssignment(
    supplierProfileId: number,
    ownerUserId: number,
  ): Promise<SupplierStaffAssignment> {
    return this.assignmentsRepository.save(
      this.assignmentsRepository.create({
        supplierProfileId,
        userId: ownerUserId,
        role: SupplierStaffRole.MANAGER,
        permissions: [],
        isActive: true,
        invitedByUserId: ownerUserId,
      }),
    );
  }

  // ---- Team management (used by SupplierStaffController) --------------------

  async listStaff(actor: Actor): Promise<SupplierStaffMember[]> {
    const profile = await this.requireManagedSupplierProfile(actor);
    const assignments = await this.assignmentsRepository.find({
      where: { supplierProfileId: profile.id },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return assignments.map((a) => this.serializeAssignment(a));
  }

  /**
   * Create a manual supplier-staff login — the wholesaler-side mirror of branch
   * staff manual accounts. The manager provisions a username + password directly
   * (no email invite); the teammate signs in with those credentials.
   */
  async createManualAccount(
    actor: Actor,
    dto: CreateSupplierStaffManualAccountDto,
  ): Promise<SupplierStaffMember> {
    const profile = await this.requireManagedSupplierProfile(actor);

    const normalizedUsername = String(dto.username || '')
      .trim()
      .toLowerCase();
    if (normalizedUsername.length < 3) {
      throw new BadRequestException(
        'A username of at least 3 characters is required.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const internalEmail = `supplier.m.${normalizedUsername}@sys.internal`;

    // Purge any inactive MANUAL user that still holds this username or internal
    // email so a deactivated teammate's username can be reused; reject a live one.
    const staleByUsername = await this.usersRepository.findOne({
      where: { posUsername: normalizedUsername },
    });
    if (staleByUsername) {
      if (staleByUsername.authMode === 'MANUAL' && !staleByUsername.isActive) {
        await this.assignmentsRepository.delete({ userId: staleByUsername.id });
        await this.usersRepository.remove(staleByUsername);
      } else {
        throw new ConflictException({
          error: {
            code: 'SUPPLIER_STAFF_USERNAME_CONFLICT',
            message: 'This username is already in use.',
            details: { field: 'username' },
          },
        });
      }
    }

    const staleByEmail = await this.usersRepository.findOne({
      where: { email: internalEmail },
    });
    if (staleByEmail) {
      // Same guard as the username branch above: only recycle a deactivated
      // MANUAL stub. Never delete a live account that happens to collide on the
      // synthetic internal email.
      if (staleByEmail.authMode === 'MANUAL' && !staleByEmail.isActive) {
        await this.assignmentsRepository.delete({ userId: staleByEmail.id });
        await this.usersRepository.remove(staleByEmail);
      } else {
        throw new ConflictException({
          error: {
            code: 'SUPPLIER_STAFF_USERNAME_CONFLICT',
            message: 'This username is already in use.',
            details: { field: 'username' },
          },
        });
      }
    }

    const role = dto.role ?? SupplierStaffRole.OPERATOR;
    const savedUser = await this.usersRepository.save(
      this.usersRepository.create({
        email: internalEmail,
        posUsername: normalizedUsername,
        authMode: 'MANUAL',
        displayName: dto.displayName?.trim() || null,
        password: hashedPassword,
        roles: [],
        isActive: true,
      }),
    );

    const assignment = await this.assignmentsRepository.save(
      this.assignmentsRepository.create({
        supplierProfileId: profile.id,
        userId: savedUser.id,
        role,
        permissions: [],
        isActive: true,
        invitedByUserId: Number(actor.id) || null,
      }),
    );
    await this.syncSupplierRolesForUser(savedUser.id);

    return this.serializeAssignment({ ...assignment, user: savedUser });
  }

  /**
   * Reset a teammate's manual login password. Manager-only; restricted to
   * MANUAL logins in this supplier account (an OAuth/email user owns their own).
   */
  async changeStaffPassword(
    actor: Actor,
    assignmentId: number,
    newPassword: string,
  ): Promise<{ status: 'PASSWORD_CHANGED'; assignmentId: number }> {
    const profile = await this.requireManagedSupplierProfile(actor);
    const assignment = await this.assignmentsRepository.findOne({
      where: { id: assignmentId, supplierProfileId: profile.id },
      relations: { user: true },
    });
    if (!assignment) {
      throw new NotFoundException('Staff assignment not found');
    }
    if (!assignment.user || assignment.user.authMode !== 'MANUAL') {
      throw new BadRequestException(
        'Passwords can only be changed for manually-created supplier logins.',
      );
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.update(assignment.user.id, {
      password: hashedPassword,
    });
    return { status: 'PASSWORD_CHANGED', assignmentId: assignment.id };
  }

  async updateStaff(
    actor: Actor,
    assignmentId: number,
    dto: UpdateSupplierStaffDto,
  ): Promise<SupplierStaffMember> {
    const profile = await this.requireManagedSupplierProfile(actor);
    const assignment = await this.assignmentsRepository.findOne({
      where: { id: assignmentId, supplierProfileId: profile.id },
      relations: { user: true },
    });
    if (!assignment) {
      throw new NotFoundException('Staff assignment not found');
    }
    // Never let the last active manager (or the owner) be demoted/deactivated
    // into a state with no managers.
    if (
      (dto.role === SupplierStaffRole.OPERATOR || dto.isActive === false) &&
      assignment.role === SupplierStaffRole.MANAGER
    ) {
      await this.assertNotLastManager(profile.id, assignment.id);
    }
    if (dto.role !== undefined) assignment.role = dto.role;
    if (dto.permissions !== undefined)
      assignment.permissions = dto.permissions ?? [];
    if (dto.isActive !== undefined) assignment.isActive = dto.isActive;
    const saved = await this.assignmentsRepository.save(assignment);
    // Reconcile global roles after any role/active change so a demotion or
    // deactivation actually revokes the prior supplier role.
    await this.syncSupplierRolesForUser(assignment.userId);
    return this.serializeAssignment(saved);
  }

  async removeStaff(actor: Actor, assignmentId: number): Promise<void> {
    const profile = await this.requireManagedSupplierProfile(actor);
    const assignment = await this.assignmentsRepository.findOne({
      where: { id: assignmentId, supplierProfileId: profile.id },
    });
    if (!assignment) {
      throw new NotFoundException('Staff assignment not found');
    }
    if (assignment.userId === profile.userId) {
      throw new BadRequestException(
        'The supplier owner cannot be removed from the account',
      );
    }
    if (assignment.role === SupplierStaffRole.MANAGER) {
      await this.assertNotLastManager(profile.id, assignment.id);
    }
    assignment.isActive = false;
    await this.assignmentsRepository.save(assignment);
    // Strip the global supplier role now that this assignment is inactive
    // (unless the user still holds another active supplier assignment).
    await this.syncSupplierRolesForUser(assignment.userId);
  }

  // ---- Helpers -------------------------------------------------------------

  private serializeAssignment(
    assignment: SupplierStaffAssignment,
  ): SupplierStaffMember {
    const user = assignment.user ?? null;
    return {
      id: assignment.id,
      userId: assignment.userId,
      role: assignment.role,
      permissions: assignment.permissions ?? [],
      isActive: assignment.isActive,
      createdAt: assignment.createdAt,
      user: user
        ? {
            id: user.id,
            displayName: user.displayName ?? null,
            username: user.posUsername ?? null,
            authMode: user.authMode ?? null,
          }
        : null,
    };
  }

  private async assertNotLastManager(
    supplierProfileId: number,
    excludingAssignmentId: number,
  ): Promise<void> {
    const otherManagers = await this.assignmentsRepository.count({
      where: {
        supplierProfileId,
        role: SupplierStaffRole.MANAGER,
        isActive: true,
      },
    });
    // count includes the row being changed; require at least one OTHER manager.
    if (otherManagers <= 1) {
      const stillThere = await this.assignmentsRepository.findOne({
        where: { id: excludingAssignmentId },
      });
      if (stillThere) {
        throw new BadRequestException(
          'A supplier account must keep at least one active manager',
        );
      }
    }
  }

  /**
   * Reconcile a user's global SUPPLIER_MANAGER / SUPPLIER_OPERATOR roles to
   * match their CURRENT active supplier staff assignments across all suppliers.
   * Adds the role(s) they hold and strips any supplier role no longer backed by
   * an active assignment (so demote/remove actually revokes), without disturbing
   * non-supplier roles. Reflects the exact set held, so a user who is a manager
   * in one supplier and an operator in another keeps both.
   */
  private async syncSupplierRolesForUser(userId: number): Promise<void> {
    if (!Number.isFinite(userId) || userId <= 0) return;

    const assignments = await this.assignmentsRepository.find({
      where: { userId, isActive: true },
    });
    const isManager = assignments.some(
      (a) => a.role === SupplierStaffRole.MANAGER,
    );
    const isOperator = assignments.some(
      (a) => a.role === SupplierStaffRole.OPERATOR,
    );

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return;
    const current = Array.isArray(user.roles) ? user.roles : [];

    const next: UserRole[] = current.filter(
      (r) =>
        r !== UserRole.SUPPLIER_MANAGER && r !== UserRole.SUPPLIER_OPERATOR,
    );
    if (isManager) next.push(UserRole.SUPPLIER_MANAGER);
    if (isOperator) next.push(UserRole.SUPPLIER_OPERATOR);

    const changed =
      next.length !== current.length || next.some((r) => !current.includes(r));
    if (changed) {
      await this.usersRepository.update(userId, { roles: next });
    }
  }
}
