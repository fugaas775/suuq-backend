import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  LessonPlanStatus,
  SchoolLessonPlan,
} from './entities/school-lesson-plan.entity';
import {
  ListSchoolLessonPlansQueryDto,
  ReviewSchoolLessonPlanDto,
  SaveSchoolLessonPlanDto,
  SetSchoolLessonPlanStatusDto,
} from './dto/school-lesson-plan.dto';
import { SchoolTimetableService } from './school-timetable.service';
import {
  SchoolClassScopeService,
  ScopeActor,
} from './school-class-scope.service';
import { taughtPairs, teachesSubjectIn } from './school-marks.policy';

const fold = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();
const text = (v: unknown) => String(v ?? '').trim();
const orNull = (v: unknown, max: number) => text(v).slice(0, max) || null;

export type LessonPlanSummaryRow = {
  employeeId: number;
  teacherName: string | null;
  planned: number;
  taught: number;
  partly: number;
  postponed: number;
  cancelled: number;
  reviewed: number;
  total: number;
};

/**
 * Lesson plans — what a teacher means to teach, and what became of it.
 *
 * The teacher writes plans for the lessons on THEIR timetable (the same
 * (class, subject) pairs marks are held to), marks each one's status, and
 * reads their own. The heads — whoever is not held to a class scope: the
 * owner, a manager, the office — read everyone's and sign them off. Nobody
 * writes a plan for somebody else: a plan is a teacher's own word.
 */
@Injectable()
export class SchoolLessonPlanService {
  constructor(
    @InjectRepository(SchoolLessonPlan)
    private readonly plans: Repository<SchoolLessonPlan>,
    private readonly timetable: SchoolTimetableService,
    private readonly scope: SchoolClassScopeService,
  ) {}

  private async me(branchId: number, actor: ScopeActor | null | undefined) {
    const mine = await this.timetable.mine(branchId, actor?.id ?? null);
    return { employee: mine.employee, pairs: taughtPairs(mine.slots) };
  }

  private async isHead(branchId: number, actor: ScopeActor | null | undefined) {
    const scope = await this.scope.resolve(branchId, actor);
    return { head: !scope.scoped, name: scope.recordedBy };
  }

  async list(query: ListSchoolLessonPlansQueryDto, actor: ScopeActor) {
    const where: Record<string, unknown> = {
      branchId: query.branchId,
      lessonDate: Between(query.from, query.to),
    };
    if (text(query.classCode)) where.classCode = fold(query.classCode);
    if (String(query.mine ?? '') === '1') {
      const { employee } = await this.me(query.branchId, actor);
      if (!employee) return { employee: null, items: [] };
      where.employeeId = employee.id;
      const items = await this.plans.find({
        where,
        order: { lessonDate: 'ASC', periodCode: 'ASC' },
      });
      return { employee, items };
    }
    const { head } = await this.isHead(query.branchId, actor);
    if (!head) {
      throw new ForbiddenException(
        'Only the school office reads every teacher’s plans; ask for your own with mine=1.',
      );
    }
    if (query.employeeId != null) where.employeeId = Number(query.employeeId);
    const items = await this.plans.find({
      where,
      order: { lessonDate: 'ASC', periodCode: 'ASC', employeeId: 'ASC' },
    });
    return { employee: null, items };
  }

  /**
   * Write, or rewrite, one lesson's plan. Held to the teacher's own
   * timetable: the (class, subject) pair must be one they teach. The key is
   * the lesson itself, so planning the same slot twice edits, never
   * duplicates. A plan already TAUGHT keeps its status through an edit.
   */
  async upsert(dto: SaveSchoolLessonPlanDto, actor: ScopeActor) {
    const { employee, pairs } = await this.me(dto.branchId, actor);
    if (!employee) {
      throw new ForbiddenException(
        'Your login is not linked to a teacher on the staff list, so there is no timetable to plan against.',
      );
    }
    const classCode = fold(dto.classCode);
    const subject = text(dto.subject);
    const periodCode = text(dto.periodCode).toUpperCase();
    if (!teachesSubjectIn(pairs, classCode, subject)) {
      throw new ForbiddenException(
        `Your timetable does not put you in front of ${text(dto.classCode) || 'this class'} for ${subject}, so you cannot plan its lesson.`,
      );
    }
    const key = {
      branchId: dto.branchId,
      employeeId: employee.id,
      lessonDate: dto.lessonDate,
      periodCode,
      classCode,
    };
    const existing = await this.plans.findOne({ where: key });
    const row =
      existing ??
      this.plans.create({
        ...key,
        status: 'PLANNED',
        taughtOn: null,
        statusNote: null,
        createdByUserId: actor.id ?? null,
      });
    row.teacherName = employee.fullName ?? row.teacherName ?? null;
    row.subject = subject;
    row.topic = text(dto.topic).slice(0, 200);
    row.objectives = orNull(dto.objectives, 4000);
    row.activities = orNull(dto.activities, 4000);
    row.materials = orNull(dto.materials, 2000);
    row.assessment = orNull(dto.assessment, 2000);
    row.updatedByUserId = actor.id ?? null;
    return this.plans.save(row);
  }

  /** The teacher's own word on what became of the lesson. Own plans only. */
  async setStatus(
    id: number,
    dto: SetSchoolLessonPlanStatusDto,
    actor: ScopeActor,
  ) {
    const row = await this.plans.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException(`Lesson plan ${id} not found.`);
    const { employee } = await this.me(dto.branchId, actor);
    if (!employee || Number(employee.id) !== Number(row.employeeId)) {
      throw new ForbiddenException(
        'Only the teacher whose lesson it is says what became of it.',
      );
    }
    const status = String(dto.status).toUpperCase() as LessonPlanStatus;
    row.status = status;
    row.taughtOn =
      status === 'TAUGHT' || status === 'PARTLY'
        ? dto.taughtOn || row.lessonDate
        : null;
    row.statusNote = orNull(dto.statusNote, 200);
    row.updatedByUserId = actor.id ?? null;
    return this.plans.save(row);
  }

  /** The head's sign-off — anyone not held to a class scope. */
  async review(id: number, dto: ReviewSchoolLessonPlanDto, actor: ScopeActor) {
    const row = await this.plans.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException(`Lesson plan ${id} not found.`);
    const { head, name } = await this.isHead(dto.branchId, actor);
    if (!head)
      throw new ForbiddenException(
        'Only the school office signs a lesson plan off.',
      );
    row.reviewedByUserId = actor.id ?? null;
    row.reviewedByName = name || null;
    row.reviewedAt = new Date();
    row.reviewComment = orNull(dto.reviewComment, 400);
    row.updatedByUserId = actor.id ?? null;
    return this.plans.save(row);
  }

  /** Per teacher, how the range's plans stand — the deputy's board. */
  async summary(branchId: number, from: string, to: string, actor: ScopeActor) {
    if (!from || !to)
      throw new BadRequestException('from and to are required.');
    const { head } = await this.isHead(branchId, actor);
    if (!head)
      throw new ForbiddenException(
        'Only the school office reads the plans board.',
      );
    const rows = await this.plans.find({
      where: { branchId, lessonDate: Between(from, to) },
    });
    const byTeacher = new Map<number, LessonPlanSummaryRow>();
    for (const row of rows) {
      const id = Number(row.employeeId);
      const entry = byTeacher.get(id) ?? {
        employeeId: id,
        teacherName: row.teacherName ?? null,
        planned: 0,
        taught: 0,
        partly: 0,
        postponed: 0,
        cancelled: 0,
        reviewed: 0,
        total: 0,
      };
      entry.total += 1;
      if (row.status === 'TAUGHT') entry.taught += 1;
      else if (row.status === 'PARTLY') entry.partly += 1;
      else if (row.status === 'POSTPONED') entry.postponed += 1;
      else if (row.status === 'CANCELLED') entry.cancelled += 1;
      else entry.planned += 1;
      if (row.reviewedAt) entry.reviewed += 1;
      byTeacher.set(id, entry);
    }
    return {
      from,
      to,
      teachers: [...byTeacher.values()].sort((a, b) =>
        String(a.teacherName ?? '').localeCompare(String(b.teacherName ?? '')),
      ),
    };
  }
}
