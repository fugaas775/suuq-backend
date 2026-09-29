import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { teachesSubjectIn } from '../school/school-marks.policy';
import { ScopeActor } from '../school/school-class-scope.service';
import {
  SchoolStaffReachService,
  StaffReach,
} from './school-staff-reach.service';
import {
  CreateSchoolHomeworkDto,
  ListSchoolHomeworkQueryDto,
  UpdateSchoolHomeworkDto,
} from './dto/school-homework.dto';
import { SchoolHomework } from './entities/school-homework.entity';

const text = (v: unknown) => String(v ?? '').trim();
const fold = (v: unknown) => text(v).toLowerCase();

/** How far back the families' and the teachers' lists reach. */
const HOMEWORK_WINDOW_DAYS = 45;

export function daysAgoIso(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class SchoolHomeworkService {
  constructor(
    @InjectRepository(SchoolHomework)
    private readonly homework: Repository<SchoolHomework>,
    private readonly reachSvc: SchoolStaffReachService,
  ) {}

  reach(branchId: number, actor: ScopeActor): Promise<StaffReach> {
    return this.reachSvc.resolve(branchId, actor);
  }

  /**
   * The heads set anything. A teacher sets their own subject in a class the
   * timetable puts them in, or any subject in a class the office assigned
   * them (their home room).
   */
  private canSet(
    reach: StaffReach,
    classCode: string,
    subject: string,
  ): boolean {
    if (reach.head) return true;
    if (teachesSubjectIn(reach.pairs, classCode, subject)) return true;
    return reach.assigned.has(classCode);
  }

  private canEdit(
    reach: StaffReach,
    row: SchoolHomework,
    actor: ScopeActor,
  ): boolean {
    if (reach.head) return true;
    if (reach.employee && Number(row.employeeId) === Number(reach.employee.id))
      return true;
    return (
      actor?.id != null && Number(row.createdByUserId) === Number(actor.id)
    );
  }

  private view(row: SchoolHomework) {
    return {
      id: Number(row.id),
      branchId: row.branchId,
      classCode: row.classCode,
      subject: row.subject,
      title: row.title,
      body: row.body ?? null,
      dueOn: row.dueOn ?? null,
      employeeId: row.employeeId ?? null,
      teacherName: row.teacherName ?? null,
      isActive: row.isActive !== false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** The teacher's list: what is set for the classes they reach, newest first. */
  async list(query: ListSchoolHomeworkQueryDto, actor: ScopeActor) {
    const reach = await this.reach(query.branchId, actor);
    const wanted = fold(query.classCode);
    if (wanted && !reach.head && !(reach.classes ?? new Set()).has(wanted)) {
      throw new ForbiddenException(
        `${text(query.classCode)} is not one of your classes.`,
      );
    }
    const qb = this.homework
      .createQueryBuilder('h')
      .where('h."branchId" = :branchId', { branchId: query.branchId })
      .andWhere('h."createdAt" >= :since', {
        since: `${daysAgoIso(HOMEWORK_WINDOW_DAYS)}T00:00:00Z`,
      });
    if (wanted) qb.andWhere('h."classCode" = :code', { code: wanted });
    else if (!reach.head) {
      const codes = [...(reach.classes ?? [])];
      if (!codes.length)
        return { employee: reach.employee, reach: [], items: [] };
      qb.andWhere('h."classCode" IN (:...codes)', { codes });
    }
    if (String(query.mine ?? '') === '1') {
      if (!reach.employee)
        return { employee: null, reach: [...(reach.classes ?? [])], items: [] };
      qb.andWhere('h."employeeId" = :emp', { emp: reach.employee.id });
    }
    if (String(query.all ?? '') !== '1')
      qb.andWhere('h."isActive" = :active', { active: true });
    const rows = await qb.orderBy('h."createdAt"', 'DESC').take(300).getMany();
    return {
      employee: reach.employee,
      reach: reach.head ? null : [...(reach.classes ?? [])].sort(),
      items: rows.map((r) => this.view(r)),
    };
  }

  async create(dto: CreateSchoolHomeworkDto, actor: ScopeActor) {
    const reach = await this.reach(dto.branchId, actor);
    const classCode = fold(dto.classCode);
    const subject = text(dto.subject).slice(0, 120);
    if (!this.canSet(reach, classCode, subject)) {
      throw new ForbiddenException({
        code: 'SCHOOL_HOMEWORK_OUT_OF_SCOPE',
        message: reach.classes?.size
          ? `Your timetable does not put you in front of ${text(dto.classCode)} for ${subject}, and it is not a class the office assigned you (${[...reach.classes].join(', ')}).`
          : 'No class is assigned to you yet — the office assigns your classes and timetable in Branch Staff.',
      });
    }
    const row = this.homework.create({
      branchId: dto.branchId,
      classCode,
      subject,
      title: text(dto.title).slice(0, 200),
      body: text(dto.body).slice(0, 4000) || null,
      dueOn: text(dto.dueOn) || null,
      employeeId: reach.employee?.id ?? null,
      teacherName: reach.employee?.fullName || reach.name || null,
      createdByUserId: actor?.id ?? null,
      isActive: true,
    });
    return this.view(await this.homework.save(row));
  }

  async update(id: number, dto: UpdateSchoolHomeworkDto, actor: ScopeActor) {
    const row = await this.homework.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException('Homework not found on this school.');
    const reach = await this.reach(dto.branchId, actor);
    if (!this.canEdit(reach, row, actor)) {
      throw new ForbiddenException(
        'Only the teacher who set this homework, or the office, changes it.',
      );
    }
    if (dto.title !== undefined) row.title = text(dto.title).slice(0, 200);
    if (dto.body !== undefined)
      row.body = text(dto.body).slice(0, 4000) || null;
    if (dto.dueOn !== undefined) row.dueOn = text(dto.dueOn) || null;
    if (dto.isActive !== undefined) row.isActive = dto.isActive !== false;
    return this.view(await this.homework.save(row));
  }

  async remove(id: number, branchId: number, actor: ScopeActor) {
    const row = await this.homework.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException('Homework not found on this school.');
    const reach = await this.reach(branchId, actor);
    if (!this.canEdit(reach, row, actor)) {
      throw new ForbiddenException(
        'Only the teacher who set this homework, or the office, removes it.',
      );
    }
    await this.homework.remove(row);
    return { status: 'REMOVED', id };
  }

  // ── for the families ─────────────────────────────────────────────────────

  /** Live homework for the named classes at one school, newest first. */
  async forClasses(branchId: number, classCodes: Iterable<string>) {
    const codes = [
      ...new Set([...classCodes].map((c) => fold(c)).filter(Boolean)),
    ];
    if (!codes.length) return [] as ReturnType<SchoolHomeworkService['view']>[];
    const rows = await this.homework.find({
      where: { branchId, classCode: In(codes), isActive: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 200,
    });
    const since = daysAgoIso(HOMEWORK_WINDOW_DAYS);
    return rows
      .filter((r) => {
        const due = text(r.dueOn).slice(0, 10);
        const made = r.createdAt
          ? new Date(r.createdAt).toISOString().slice(0, 10)
          : '';
        return (due && due >= since) || (made && made >= since);
      })
      .map((r) => this.view(r));
  }

  /** Per class, how many live entries fall due today or later. */
  async dueCounts(
    branchId: number,
    classCodes: Iterable<string>,
    today: string,
  ) {
    const items = await this.forClasses(branchId, classCodes);
    const out = new Map<string, number>();
    for (const h of items) {
      if (!h.dueOn || h.dueOn < today) continue;
      out.set(h.classCode, (out.get(h.classCode) ?? 0) + 1);
    }
    return out;
  }
}
