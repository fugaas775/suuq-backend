import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '../auth/roles.enum';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import { User } from '../users/entities/user.entity';
import { AssignSupplierStaffDto } from './dto/assign-supplier-staff.dto';
import { UpdateSupplierStaffDto } from './dto/update-supplier-staff.dto';
import {
  SupplierStaffAssignment,
  SupplierStaffRole,
} from './entities/supplier-staff-assignment.entity';

const STAFF_ROLE_TO_USER_ROLE: Record<SupplierStaffRole, UserRole> = {
  [SupplierStaffRole.MANAGER]: UserRole.SUPPLIER_MANAGER,
  [SupplierStaffRole.OPERATOR]: UserRole.SUPPLIER_OPERATOR,
};

const SUPPLIER_STAFF_USER_ROLES: UserRole[] = [
  UserRole.SUPPLIER_MANAGER,
  UserRole.SUPPLIER_OPERATOR,
];

export interface SupplierStaffActor {
  id: number | null;
  roles: UserRole[];
}

@Injectable()
export class SupplierStaffService {
  constructor(
    @InjectRepository(SupplierStaffAssignment)
    private readonly assignmentsRepository: Repository<SupplierStaffAssignment>,
    @InjectRepository(SupplierProfile)
    private readonly supplierProfilesRepository: Repository<SupplierProfile>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /**
   * Profile IDs the user can access either as owner OR as an active staff member.
   * Used to scope listings of supplier profiles for non-admin sessions.
   */
  async findAccessibleProfileIdsForUser(userId: number): Promise<number[]> {
    if (!userId) return [];
    const owned = await this.supplierProfilesRepository.find({
      where: { userId },
      select: ['id'],
    });
    const staffed = await this.assignmentsRepository.find({
      where: { userId, isActive: true },
      select: ['supplierProfileId'],
    });
    const ids = new Set<number>();
    owned.forEach((p) => ids.add(p.id));
    staffed.forEach((s) => ids.add(s.supplierProfileId));
    return Array.from(ids);
  }

  /**
   * Returns the highest privilege a user has on a supplier profile, or null.
   * Owner > MANAGER > OPERATOR.
   */
  async resolveAccessLevel(
    userId: number,
    supplierProfileId: number,
  ): Promise<'OWNER' | 'MANAGER' | 'OPERATOR' | null> {
    if (!userId) return null;
    const profile = await this.supplierProfilesRepository.findOne({
      where: { id: supplierProfileId },
      select: ['id', 'userId'],
    });
    if (!profile) return null;
    if (profile.userId === userId) return 'OWNER';
    const assignment = await this.assignmentsRepository.findOne({
      where: { supplierProfileId, userId, isActive: true },
    });
    if (!assignment) return null;
    return assignment.role === SupplierStaffRole.MANAGER
      ? 'MANAGER'
      : 'OPERATOR';
  }

  async list(supplierProfileId: number, actor: SupplierStaffActor) {
    await this.assertCanRead(supplierProfileId, actor);
    const profile = await this.supplierProfilesRepository.findOne({
      where: { id: supplierProfileId },
      relations: { user: true },
    });
    if (!profile) {
      throw new NotFoundException(
        `Supplier profile ${supplierProfileId} not found`,
      );
    }
    const assignments = await this.assignmentsRepository.find({
      where: { supplierProfileId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    const owner = profile.user
      ? {
          kind: 'OWNER' as const,
          userId: profile.user.id,
          email: profile.user.email,
          fullName: this.fullName(profile.user),
          isActive: profile.user.isActive,
        }
      : null;
    return {
      owner,
      staff: assignments.map((a) => this.serialize(a)),
    };
  }

  async assign(
    supplierProfileId: number,
    dto: AssignSupplierStaffDto,
    actor: SupplierStaffActor,
  ) {
    await this.assertCanManage(supplierProfileId, actor);
    const profile = await this.supplierProfilesRepository.findOne({
      where: { id: supplierProfileId },
    });
    if (!profile) {
      throw new NotFoundException(
        `Supplier profile ${supplierProfileId} not found`,
      );
    }
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException(
        `No platform user with email ${email}. Ask them to register first, then invite.`,
      );
    }
    if (user.id === profile.userId) {
      throw new BadRequestException(
        'This user already owns the supplier profile and does not need a staff assignment.',
      );
    }
    let assignment = await this.assignmentsRepository.findOne({
      where: { supplierProfileId, userId: user.id },
    });
    if (assignment) {
      assignment.role = dto.role;
      assignment.isActive = true;
    } else {
      assignment = this.assignmentsRepository.create({
        supplierProfileId,
        userId: user.id,
        role: dto.role,
        isActive: true,
        invitedByUserId: actor.id ?? null,
        permissions: [],
      });
    }
    await this.assignmentsRepository.save(assignment);
    await this.syncUserRoles(user, dto.role, true);
    const refreshed = await this.assignmentsRepository.findOne({
      where: { id: assignment.id },
      relations: { user: true },
    });
    return this.serialize(refreshed);
  }

  async update(
    supplierProfileId: number,
    staffId: number,
    dto: UpdateSupplierStaffDto,
    actor: SupplierStaffActor,
  ) {
    await this.assertCanManage(supplierProfileId, actor);
    const assignment = await this.assignmentsRepository.findOne({
      where: { id: staffId, supplierProfileId },
      relations: { user: true },
    });
    if (!assignment) {
      throw new NotFoundException(`Staff assignment ${staffId} not found`);
    }
    if (typeof dto.role !== 'undefined') assignment.role = dto.role;
    if (typeof dto.isActive !== 'undefined') assignment.isActive = dto.isActive;
    await this.assignmentsRepository.save(assignment);
    await this.syncUserRoles(
      assignment.user,
      assignment.role,
      assignment.isActive,
    );
    return this.serialize(assignment);
  }

  async remove(
    supplierProfileId: number,
    staffId: number,
    actor: SupplierStaffActor,
  ) {
    await this.assertCanManage(supplierProfileId, actor);
    const assignment = await this.assignmentsRepository.findOne({
      where: { id: staffId, supplierProfileId },
      relations: { user: true },
    });
    if (!assignment) {
      throw new NotFoundException(`Staff assignment ${staffId} not found`);
    }
    await this.assignmentsRepository.remove(assignment);
    await this.recomputeUserSupplierRoles(assignment.user);
    return { ok: true };
  }

  // ---- helpers ---------------------------------------------------------

  private async assertCanRead(
    supplierProfileId: number,
    actor: SupplierStaffActor,
  ) {
    if (this.isPlatformAdmin(actor.roles)) return;
    if (!actor.id) throw new ForbiddenException();
    const level = await this.resolveAccessLevel(actor.id, supplierProfileId);
    if (!level) {
      throw new ForbiddenException(
        'You do not have access to this supplier profile.',
      );
    }
  }

  private async assertCanManage(
    supplierProfileId: number,
    actor: SupplierStaffActor,
  ) {
    if (this.isPlatformAdmin(actor.roles)) return;
    if (!actor.id) throw new ForbiddenException();
    const level = await this.resolveAccessLevel(actor.id, supplierProfileId);
    if (level !== 'OWNER') {
      throw new ForbiddenException(
        'Only the supplier account owner (or a platform admin) can manage staff.',
      );
    }
  }

  private isPlatformAdmin(roles: UserRole[] = []): boolean {
    return (
      roles.includes(UserRole.SUPER_ADMIN) || roles.includes(UserRole.ADMIN)
    );
  }

  private async syncUserRoles(
    user: User,
    role: SupplierStaffRole,
    isActive: boolean,
  ) {
    const desired = STAFF_ROLE_TO_USER_ROLE[role];
    const otherActive = await this.assignmentsRepository.find({
      where: { userId: user.id, isActive: true },
    });
    const activeRoles = new Set<UserRole>(
      otherActive.map((a) => STAFF_ROLE_TO_USER_ROLE[a.role]),
    );
    if (isActive) activeRoles.add(desired);
    const filteredCurrent = (user.roles || []).filter(
      (r) => !SUPPLIER_STAFF_USER_ROLES.includes(r),
    );
    const next = Array.from(new Set([...filteredCurrent, ...activeRoles]));
    if (this.rolesEqual(user.roles || [], next)) return;
    user.roles = next;
    await this.usersRepository.save(user);
  }

  private async recomputeUserSupplierRoles(user: User) {
    const remaining = await this.assignmentsRepository.find({
      where: { userId: user.id, isActive: true },
    });
    const roles = new Set<UserRole>(
      remaining.map((a) => STAFF_ROLE_TO_USER_ROLE[a.role]),
    );
    const next = (user.roles || []).filter(
      (r) => !SUPPLIER_STAFF_USER_ROLES.includes(r) || roles.has(r),
    );
    if (this.rolesEqual(user.roles || [], next)) return;
    user.roles = next;
    await this.usersRepository.save(user);
  }

  private rolesEqual(a: UserRole[], b: UserRole[]): boolean {
    if (a.length !== b.length) return false;
    const setA = new Set(a);
    return b.every((r) => setA.has(r));
  }

  private fullName(user: User): string {
    const fn = (user as any).firstName ?? '';
    const ln = (user as any).lastName ?? '';
    return [fn, ln].filter(Boolean).join(' ').trim() || user.email;
  }

  private serialize(a: SupplierStaffAssignment) {
    return {
      id: a.id,
      supplierProfileId: a.supplierProfileId,
      userId: a.userId,
      email: a.user?.email ?? null,
      fullName: a.user ? this.fullName(a.user) : null,
      role: a.role,
      portalRole: STAFF_ROLE_TO_USER_ROLE[a.role],
      isActive: a.isActive,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
