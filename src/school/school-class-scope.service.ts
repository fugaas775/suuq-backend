import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { SchoolClassService } from './school-class.service';
import { SchoolTimetableService } from './school-timetable.service';
import {
  ClassScope,
  assignedClassCodes,
  classInScope,
  classScopeRefusal,
  isClassScoped,
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
}
