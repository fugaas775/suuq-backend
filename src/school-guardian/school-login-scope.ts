import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import {
  isSchoolOwner,
  tenantOwnerOf,
} from '../school/school-branch-owner.util';
import {
  ScopeActor,
  SchoolClassScopeService,
} from '../school/school-class-scope.service';

/**
 * Whose parents' and students' logins this person may manage.
 *
 * Owner 2026-10-18: "Teachers should also manage Students' login and
 * parents' login for their respective class like cashiers." The office
 * (ENROL_STUDENT), the cashier (MANAGE_SCHOOL_LOGINS), a manager, the owner
 * and a platform admin manage the whole school's — `null`. A teacher holding
 * MANAGE_CLASS_LOGINS alone manages their ASSIGNED classes only: their home
 * room and the classes written on their login, the same list the register
 * holds them to (`SchoolClassScopeService`) — never the timetable.
 *
 * Read off the staff ROSTER, not the token, like every other school rule.
 */
export type LoginScope = { codes: Set<string> } | null;

export const CLASS_LOGINS_PERMISSION = 'MANAGE_CLASS_LOGINS';

const fold = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();
// Not POS_MANAGER — every vendor holds it; the owner is found by ownership.
const WHOLE_SCHOOL_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const WHOLE_SCHOOL_PERMISSIONS = ['ENROL_STUDENT', 'MANAGE_SCHOOL_LOGINS'];

/** True when this actor manages every family's and pupil's login. */
export function loginsWholeSchool({
  actorId,
  ownerId,
  tenantOwnerId = null,
  roles,
  assignment,
}: {
  actorId: number | null | undefined;
  ownerId: number | null | undefined;
  tenantOwnerId?: number | null;
  roles?: string[] | null;
  assignment?: {
    isActive?: boolean;
    role?: string | null;
    permissions?: string[] | null;
  } | null;
}): boolean {
  const global = (roles ?? []).map((r) => String(r).trim().toUpperCase());
  if (global.some((r) => WHOLE_SCHOOL_ROLES.includes(r))) return true;
  if (actorId == null) return false;
  if (isSchoolOwner(actorId, ownerId, tenantOwnerId)) return true;
  if (!assignment || assignment.isActive === false) return false;
  if (String(assignment.role ?? '').toUpperCase() === 'MANAGER') return true;
  const perms = (assignment.permissions ?? []).map((p) =>
    String(p).trim().toUpperCase(),
  );
  return perms.some((p) => WHOLE_SCHOOL_PERMISSIONS.includes(p));
}

/** Whether a class is this scope's to manage (`null` = the whole school). */
export function classOk(scope: LoginScope, classCode: unknown): boolean {
  if (!scope) return true;
  return scope.codes.has(fold(classCode));
}

/** The 403 a teacher gets for a pupil or family outside their classes. */
export function outOfClassScope(scope: LoginScope, what: string) {
  const own = [...(scope?.codes ?? [])];
  return new ForbiddenException({
    error: {
      code: 'SCHOOL_CLASS_OUT_OF_SCOPE',
      message: own.length
        ? `${what} — you manage logins for your own class${own.length === 1 ? '' : 'es'} (${own.join(', ')}). Ask the office.`
        : `${what} — no class is assigned to you yet. Ask the office.`,
    },
  });
}

@Injectable()
export class SchoolLoginScopeService {
  constructor(
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignments: Repository<BranchStaffAssignment>,
    private readonly classScope: SchoolClassScopeService,
  ) {}

  async resolve(
    branchId: number,
    actor: ScopeActor | null | undefined,
  ): Promise<LoginScope> {
    const actorId = actor?.id ?? null;
    const [branch, assignment] = await Promise.all([
      this.branches.findOne({
        where: { id: branchId },
        select: { id: true, ownerId: true, retailTenantId: true },
      }),
      actorId != null
        ? this.assignments.findOne({ where: { branchId, userId: actorId } })
        : Promise.resolve(null),
    ]);
    const tenantOwnerId = await tenantOwnerOf(
      this.branches.manager,
      branch?.retailTenantId,
    );
    if (
      loginsWholeSchool({
        actorId,
        ownerId: (branch as { ownerId?: number } | null)?.ownerId ?? null,
        tenantOwnerId,
        roles: actor?.roles ?? null,
        assignment,
      })
    ) {
      return null;
    }
    const scope = await this.classScope.resolve(branchId, actor);
    return { codes: new Set([...(scope.codes ?? [])].map(fold)) };
  }
}
