import { Injectable } from '@nestjs/common';
import { taughtPairs } from '../school/school-marks.policy';
import {
  SchoolClassScopeService,
  ScopeActor,
} from '../school/school-class-scope.service';
import { SchoolTimetableService } from '../school/school-timetable.service';

const fold = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();

/**
 * Which families a member of staff may reach — for homework and messages.
 *
 * Wider than the register's class scope on purpose. The register is held to
 * the classes the office ASSIGNED (home room, SCHOOL_CLASS caps), because a
 * Mathematics teacher taking eight registers was the failure. Homework and a
 * word to a family are that teacher's daily work in all eight, so here the
 * timetable's classes count too. The heads — whoever is not held to a class
 * scope — reach every family.
 */
export type StaffReach = {
  head: boolean;
  /** Lowercased class codes the person reaches; null when unscoped. */
  classes: Set<string> | null;
  /** The classes the office assigned — any subject may be set there. */
  assigned: Set<string>;
  /** The (class|subject) pairs the timetable puts them in front of. */
  pairs: Set<string>;
  employee: { id: number; fullName: string } | null;
  /** The name the other side reads. */
  name: string;
};

@Injectable()
export class SchoolStaffReachService {
  constructor(
    private readonly scope: SchoolClassScopeService,
    private readonly timetable: SchoolTimetableService,
  ) {}

  async resolve(branchId: number, actor: ScopeActor): Promise<StaffReach> {
    const [scope, mine] = await Promise.all([
      this.scope.resolve(branchId, actor),
      this.timetable.mine(branchId, actor?.id ?? null),
    ]);
    const pairs = taughtPairs(mine.slots);
    const employee = mine.employee
      ? { id: Number(mine.employee.id), fullName: mine.employee.fullName }
      : null;
    const assigned = new Set<string>(scope.codes ?? []);
    if (!scope.scoped) {
      return {
        head: true,
        classes: null,
        assigned,
        pairs,
        employee,
        name: scope.recordedBy,
      };
    }
    const classes = new Set<string>(assigned);
    for (const slot of mine.slots)
      if (fold(slot.classCode)) classes.add(fold(slot.classCode));
    return {
      head: false,
      classes,
      assigned,
      pairs,
      employee,
      name: scope.recordedBy,
    };
  }

  reachesClass(reach: StaffReach, classCode: unknown): boolean {
    if (reach.head || !reach.classes) return true;
    return reach.classes.has(fold(classCode));
  }
}
