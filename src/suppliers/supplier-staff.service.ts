import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { InviteSupplierStaffDto } from './dto/invite-supplier-staff.dto';
import { UpdateSupplierStaffDto } from './dto/update-supplier-staff.dto';

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

type Actor = { id?: number | null; roles?: string[] };

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

  /**
   * Resolve the supplier identity for a user, independent of any branch.
   * Prefers an explicit staff assignment; falls back to a directly-owned
   * profile (legacy profiles created before staff assignments existed).
   * Returns null when the user has no supplier account.
   */
  async getSupplierContextForUser(
    actor: Actor,
  ): Promise<SupplierContext | null> {
    const userId = Number(actor?.id);
    if (!Number.isFinite(userId) || userId <= 0) return null;

    const assignment = await this.assignmentsRepository.findOne({
      where: { userId, isActive: true },
      relations: { supplierProfile: true },
      order: { role: 'ASC' }, // MANAGER < OPERATOR alphabetically → prefer MANAGER
    });

    let profile = assignment?.supplierProfile ?? null;
    let role = assignment?.role ?? null;
    let permissions = assignment?.permissions ?? [];

    if (!profile) {
      // Legacy / owner-without-assignment fallback.
      profile = await this.profilesRepository.findOne({ where: { userId } });
      if (!profile) return null;
      role = SupplierStaffRole.MANAGER;
      permissions = [];
    }

    const isOwner = profile.userId === userId;
    const resolvedRole = role ?? SupplierStaffRole.MANAGER;
    const managerLevel = resolvedRole === SupplierStaffRole.MANAGER;

    return {
      supplierProfileId: profile.id,
      companyName: profile.companyName,
      role: resolvedRole,
      isOwner,
      activationStatus: profile.activationStatus,
      onboardingStatus: profile.onboardingStatus,
      permissions,
      canPublishOffers:
        managerLevel &&
        profile.activationStatus === SupplierActivationStatus.ACTIVE,
    };
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

  async listStaff(actor: Actor): Promise<SupplierStaffAssignment[]> {
    const profile = await this.requireManagedSupplierProfile(actor);
    return this.assignmentsRepository.find({
      where: { supplierProfileId: profile.id },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }

  async inviteStaff(
    actor: Actor,
    dto: InviteSupplierStaffDto,
  ): Promise<SupplierStaffAssignment> {
    const profile = await this.requireManagedSupplierProfile(actor);
    const email = dto.email.trim().toLowerCase();
    const invitee = await this.usersRepository.findOne({ where: { email } });
    if (!invitee) {
      throw new BadRequestException(
        'No account exists for that email. Ask them to sign up first, then invite them.',
      );
    }
    const existing = await this.assignmentsRepository.findOne({
      where: { supplierProfileId: profile.id, userId: invitee.id },
    });
    if (existing) {
      throw new ConflictException(
        'That user is already a member of this supplier account',
      );
    }
    const role = dto.role ?? SupplierStaffRole.OPERATOR;
    const assignment = await this.assignmentsRepository.save(
      this.assignmentsRepository.create({
        supplierProfileId: profile.id,
        userId: invitee.id,
        role,
        permissions: dto.permissions ?? [],
        isActive: true,
        invitedByUserId: Number(actor.id) || null,
      }),
    );
    await this.grantSupplierRole(invitee, role);
    return assignment;
  }

  async updateStaff(
    actor: Actor,
    assignmentId: number,
    dto: UpdateSupplierStaffDto,
  ): Promise<SupplierStaffAssignment> {
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
    if (assignment.user && dto.role !== undefined) {
      await this.grantSupplierRole(assignment.user, dto.role);
    }
    return saved;
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
  }

  // ---- Helpers -------------------------------------------------------------

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

  private async grantSupplierRole(
    user: User,
    role: SupplierStaffRole,
  ): Promise<void> {
    const target =
      role === SupplierStaffRole.MANAGER
        ? UserRole.SUPPLIER_MANAGER
        : UserRole.SUPPLIER_OPERATOR;
    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!roles.includes(target)) {
      await this.usersRepository.update(user.id, {
        roles: [...roles, target],
      });
    }
  }
}
