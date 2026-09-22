import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { PosSuspendedCart } from '../pos-sync/entities/pos-suspended-cart.entity';
import { isSchoolPupilFolio } from '../pos-sync/school-withdrawal.policy';
import { SchoolClassService } from './school-class.service';
import { SchoolTimetableService } from './school-timetable.service';
import {
  ClassScope,
  assignedClassCodes,
  classInScope,
  classScopeRefusal,
  isClassScoped,
  pupilClassRefusal,
  pupilsOutsideClass,
} from './school-class-scope.policy';

export type ScopeActor = {
  id?: number | null;
  email?: string | null;
  roles?: string[] | null;
};

/**
 * Resolves who may manage which classes, and the name to stamp on what they
 * record — off the same rows `classes/mine` and `timetable/mine` read, so
 * the server and the teacher's own page cannot disagree about their classes.
 */
@Injectable()
export class SchoolClassScopeService {
  constructor(
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignments: Repository<BranchStaffAssignment>,
    @InjectRepository(PosSuspendedCart)
    private readonly carts: Repository<PosSuspendedCart>,
    private readonly classes: SchoolClassService,
    private readonly timetable: SchoolTimetableService,
  ) {}

  async resolve(
    branchId: number,
    actor: ScopeActor | null | undefined,
  ): Promise<ClassScope> {
    const actorId = actor?.id ?? null;
    const branch = await this.branches.findOne({
      where: { id: branchId },
      select: { id: true, ownerId: true },
    });
    const assignment =
      actorId != null
        ? await this.assignments.findOne({
            where: { branchId, userId: actorId },
          })
        : null;
    const ownerId = (branch as { ownerId?: number } | null)?.ownerId ?? null;
    const scoped = isClassScoped({
      actorId,
      ownerId,
      roles: actor?.roles ?? null,
      assignment,
    });

    // The name, from the staff register first (a login's display name can
    // lag a rename), then the account. The timetable is read for the name
    // only — its classes are not assignments.
    const [mine, timetable] = await Promise.all([
      this.classes.mine(branchId, actorId),
      this.timetable.mine(branchId, actorId),
    ]);
    const recordedBy =
      mine.employee?.fullName ||
      timetable.employee?.fullName ||
      String(actor?.email ?? '').trim() ||
      (actorId != null ? `user ${actorId}` : '');

    if (!scoped) return { scoped: false, codes: null, recordedBy };
    return {
      scoped: true,
      codes: assignedClassCodes({
        homeroomCodes: mine.items.map((c) => c.code),
        capabilities: assignment?.capabilities ?? null,
      }),
      recordedBy,
    };
  }

  /** Throws a 403 naming the class when it is outside the person's scope. */
  assertInScope(
    scope: ClassScope | null | undefined,
    classCode: unknown,
  ): void {
    if (classInScope(scope, classCode)) return;
    throw new ForbiddenException({
      code: 'SCHOOL_CLASS_OUT_OF_SCOPE',
      message: classScopeRefusal(scope, classCode),
    });
  }

  /**
   * Throws a 400 naming the pupils when any of `subjectRefs` is a folio on
   * this branch that sits in a different class from `classCode`. Applies to
   * everyone, scoped or not: it is about the register's integrity, not about
   * who is taking it. See `pupilsOutsideClass`.
   *
   * `requireOnRoll` is the stricter form a textbook issue wants: there every
   * id must BE a pupil's folio on this branch (404 / 400 naming it). A
   * register tolerates an id it cannot find — a child withdrawn since the
   * morning was on that register — but a book handed to a folio that is not
   * a pupil here is a loan nobody can ever collect or bill.
   */
  async assertPupilsInClass(
    branchId: number,
    classCode: unknown,
    subjectRefs: Array<string | number>,
    { requireOnRoll = false }: { requireOnRoll?: boolean } = {},
  ): Promise<void> {
    const ids = [...new Set((subjectRefs ?? []).map((r) => Number(r)))].filter(
      (n) => Number.isFinite(n) && n > 0,
    );
    if (!ids.length) return;
    if (!requireOnRoll && !String(classCode ?? '').trim()) return;
    const carts = await this.carts.find({
      where: { id: In(ids), branchId },
    });
    if (requireOnRoll) {
      const found = new Set(carts.map((c) => Number(c.id)));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length) {
        throw new NotFoundException({
          code: 'SCHOOL_PUPIL_NOT_FOUND',
          message: `No pupil on this branch for folio ${missing.join(', ')}.`,
        });
      }
      const notPupils = carts.filter((c) => !isSchoolPupilFolio(c));
      if (notPupils.length) {
        throw new BadRequestException({
          code: 'SCHOOL_NOT_A_PUPIL',
          message: `Folio ${notPupils.map((c) => c.id).join(', ')} ${notPupils.length === 1 ? 'is' : 'are'} not a pupil.`,
        });
      }
    }
    const outside = pupilsOutsideClass(carts, classCode);
    if (!outside.length) return;
    throw new BadRequestException({
      code: 'SCHOOL_PUPIL_NOT_IN_CLASS',
      message: pupilClassRefusal(classCode, outside),
    });
  }
}
