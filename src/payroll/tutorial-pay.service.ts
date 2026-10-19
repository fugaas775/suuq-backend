import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, Repository } from 'typeorm';
import { BranchBillingService } from '../billing/branch-billing.service';
import { BranchExpenseCategory } from '../billing/entities/branch-expense.entity';
import {
  AttendanceStatus,
  AttendanceSubjectType,
} from '../attendance/entities/attendance-mark.entity';
import { LessonAttendanceMark } from '../attendance/entities/lesson-attendance-mark.entity';
import { SchoolTimetable } from '../school/entities/school-timetable.entity';
import { BranchEmployee } from './entities/branch-employee.entity';
import {
  PayrollRun,
  PayrollRunKind,
  PayrollRunLesson,
  PayrollRunLine,
} from './entities/payroll-run.entity';
import { CreateTutorialRunDto, TutorialPayQueryDto } from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

/** Shared with salary runs, so the two kinds never race each other either. */
const PAYROLL_LOCK_NAMESPACE = 812_640;
/** A tutorial run covers a month; two months is the most one read walks. */
const MAX_SPAN_DAYS = 62;

function money(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** 'YYYY-MM-DD' → ISO weekday (1 = Monday), read as a calendar day. */
function isoWeekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

function daysFrom(from: string, to: string): string[] {
  const out: string[] = [];
  const [y, m, d] = from.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i <= MAX_SPAN_DAYS; i += 1) {
    const day = cursor.toISOString().slice(0, 10);
    if (day > to) break;
    out.push(day);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** One lesson's identity, as the register keys it: who, day, period, class. */
function lessonKey(
  employeeId: number | string,
  date: string,
  period: string,
  classCode: string,
): string {
  return `${Number(employeeId)}|${date}|${String(period).toUpperCase()}|${String(classCode).toLowerCase()}`;
}

type TutorialLesson = {
  date: string;
  period: string;
  classCode: string;
  subject: string | null;
  rate: number;
  status?: string;
};

type TutorialTeacher = {
  employeeId: number;
  fullName: string;
  jobTitle: string | null;
  currency: string;
  scheduled: number;
  taught: number;
  absent: number;
  unmarked: number;
  alreadyPaid: number;
  payable: number;
  amount: number;
  lessons: TutorialLesson[];
  unmarkedLessons: Omit<TutorialLesson, 'rate'>[];
};

/**
 * Tutorial pay — the per-period rate a school pays on top of salary for the
 * evening tutorial its exam grades sit (SMAQ: Grades 6 and 8, the regional
 * examination, ETB 300 a period).
 *
 * The RATE lives on the timetable (`payPerPeriod` on the bell period); WHAT
 * HAPPENED lives in the lesson register. A lesson is paid when the register
 * marks it PRESENT or LATE — the same rule that lets the register say who
 * taught — and never otherwise: a lesson nobody marked is unmarked, not
 * taught, and is NAMED back so the office marks it before paying, the way a
 * salary run names whoever it skipped.
 *
 * A TUTORIAL run is a document like a salary run: its lines freeze each
 * lesson it paid and the rate it paid it at. Those lessons ARE its claim —
 * a lesson in any earlier tutorial run is never paid again, so a late mark
 * can be paid in a second run of the same month and a double press pays
 * nothing twice. It writes no `pos_payroll_run_members` row, so it never
 * touches the month's salary cap.
 */
@Injectable()
export class TutorialPayService {
  constructor(
    @InjectRepository(PayrollRun)
    private readonly runs: Repository<PayrollRun>,
    private readonly payroll: PayrollService,
    private readonly billing: BranchBillingService,
  ) {}

  private span(from: string, to: string) {
    if (from > to) {
      throw new BadRequestException('The first day is after the last day.');
    }
    const days = daysFrom(from, to);
    if (days[days.length - 1] !== to) {
      throw new BadRequestException(
        `Tutorial pay covers at most ${MAX_SPAN_DAYS} days at a time.`,
      );
    }
    return days;
  }

  /** What every teacher is owed for tutorial lessons between two days. */
  private async compute(
    em: EntityManager,
    branchId: number,
    from: string,
    to: string,
    asOf: string | null,
  ) {
    const days = this.span(from, to);
    const doc = await em
      .getRepository(SchoolTimetable)
      .findOne({ where: { branchId } });
    const periods = Array.isArray(doc?.periods) ? doc.periods : [];
    const paidPeriods = periods
      .filter((p) => p.kind !== 'BREAK' && Number(p.payPerPeriod) > 0)
      .map((p) => ({
        code: p.code,
        label: p.label ?? null,
        rate: money(Number(p.payPerPeriod)),
        classCodes: Array.isArray(p.classCodes) ? p.classCodes : [],
        days: Array.isArray(p.days) ? p.days : [],
      }));
    const rateOf = new Map(paidPeriods.map((p) => [p.code.toUpperCase(), p]));

    const result = {
      branchId,
      from,
      to,
      paidPeriods: paidPeriods.map(({ code, label, rate, classCodes }) => ({
        code,
        label,
        rate,
        classCodes,
      })),
      teachers: [] as TutorialTeacher[],
      totals: {
        scheduled: 0,
        taught: 0,
        unmarked: 0,
        alreadyPaid: 0,
        payable: 0,
        amount: 0,
      },
    };
    if (!paidPeriods.length) return result;

    const staff = await em
      .getRepository(BranchEmployee)
      .find({ where: { branchId } });
    const employeeById = new Map(staff.map((e) => [Number(e.id), e]));

    const marks = (
      await em.getRepository(LessonAttendanceMark).find({
        where: {
          branchId,
          subjectType: AttendanceSubjectType.STAFF,
          attendanceDate: Between(from, to),
        },
      })
    ).filter((m) => rateOf.has(String(m.periodCode).toUpperCase()));

    // Every lesson any tutorial run has already paid, ever.
    const earlier = await em.getRepository(PayrollRun).find({
      where: { branchId, kind: PayrollRunKind.TUTORIAL },
    });
    const paidKeys = new Set<string>();
    for (const run of earlier) {
      for (const line of Array.isArray(run.lines) ? run.lines : []) {
        for (const l of line.lessons || []) {
          if (line.employeeId == null) continue;
          paidKeys.add(
            lessonKey(line.employeeId, l.date, l.period, l.classCode),
          );
        }
      }
    }

    const byTeacher = new Map<number, TutorialTeacher>();
    const teacher = (id: number, fallbackName: string | null) => {
      let row = byTeacher.get(id);
      if (!row) {
        const e = employeeById.get(id);
        row = {
          employeeId: id,
          fullName: e?.fullName || fallbackName || `Employee #${id}`,
          jobTitle: e?.jobTitle ?? null,
          currency: (e?.currency || 'ETB').toUpperCase(),
          scheduled: 0,
          taught: 0,
          absent: 0,
          unmarked: 0,
          alreadyPaid: 0,
          payable: 0,
          amount: 0,
          lessons: [],
          unmarkedLessons: [],
        };
        byTeacher.set(id, row);
      }
      return row;
    };

    const markByKey = new Map<string, LessonAttendanceMark>();
    for (const m of marks) {
      const id = Number(m.subjectRef);
      if (!Number.isFinite(id)) continue;
      markByKey.set(
        lessonKey(id, m.attendanceDate, m.periodCode, m.classCode),
        m,
      );
      const row = teacher(id, m.subjectName);
      const period = rateOf.get(String(m.periodCode).toUpperCase());
      const taught =
        m.status === AttendanceStatus.PRESENT ||
        m.status === AttendanceStatus.LATE;
      if (!taught) {
        if (m.status === AttendanceStatus.ABSENT) row.absent += 1;
        continue;
      }
      row.taught += 1;
      const key = lessonKey(id, m.attendanceDate, m.periodCode, m.classCode);
      if (paidKeys.has(key)) {
        row.alreadyPaid += 1;
        continue;
      }
      row.payable += 1;
      row.amount = money(row.amount + period.rate);
      row.lessons.push({
        date: m.attendanceDate,
        period: period.code,
        classCode: m.classCode,
        subject: m.subject ?? null,
        rate: period.rate,
        status: m.status,
      });
    }

    // What the timetable says SHOULD have been taught, for the unmarked
    // count. It is today's week laid over the span, so it is advice — the
    // pay itself reads only the register.
    const lastDay = asOf && asOf < to ? asOf : to;
    const slots = Array.isArray(doc?.slots) ? doc.slots : [];
    for (const day of days) {
      if (day > lastDay) break;
      const weekday = isoWeekdayOf(day);
      for (const slot of slots) {
        if (slot.employeeId == null || Number(slot.day) !== weekday) continue;
        const period = rateOf.get(String(slot.period).toUpperCase());
        if (!period || (period.days.length && !period.days.includes(weekday))) {
          continue;
        }
        const id = Number(slot.employeeId);
        const row = teacher(id, slot.teacherName);
        row.scheduled += 1;
        const key = lessonKey(id, day, slot.period, slot.classCode);
        if (!markByKey.has(key)) {
          row.unmarked += 1;
          row.unmarkedLessons.push({
            date: day,
            period: period.code,
            classCode: slot.classCode,
            subject: slot.subject || null,
          });
        }
      }
    }

    const order = (a: TutorialLesson, b: TutorialLesson) =>
      a.date.localeCompare(b.date) || a.period.localeCompare(b.period);
    result.teachers = [...byTeacher.values()]
      .map((t) => ({
        ...t,
        lessons: t.lessons.sort(order),
        unmarkedLessons: t.unmarkedLessons.sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.period.localeCompare(b.period),
        ),
      }))
      .sort(
        (a, b) => b.amount - a.amount || a.fullName.localeCompare(b.fullName),
      );
    for (const t of result.teachers) {
      result.totals.scheduled += t.scheduled;
      result.totals.taught += t.taught;
      result.totals.unmarked += t.unmarked;
      result.totals.alreadyPaid += t.alreadyPaid;
      result.totals.payable += t.payable;
      result.totals.amount = money(result.totals.amount + t.amount);
    }
    return result;
  }

  preview(query: TutorialPayQueryDto) {
    return this.compute(
      this.runs.manager,
      Number(query.branchId),
      query.from,
      query.to,
      query.asOf || null,
    );
  }

  /**
   * Pay every tutorial lesson taught and not yet paid between two days.
   *
   * The owed lessons are read and the run inserted inside ONE transaction
   * holding the branch's payroll lock, so a double press or two offices at
   * once cannot both claim a lesson: the second reads the first's run and
   * finds nothing left. The expense posts after, and a failed post deletes
   * the run — nothing is claimed that the books do not carry.
   */
  async createRun(branchId: number, userId: number, dto: CreateTutorialRunDto) {
    const periodKey = String(dto.periodKey || '').trim();
    if (!periodKey) throw new BadRequestException('A period is required.');
    const only = (dto.employeeIds || []).map(Number);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('That date could not be read.');
    }

    let run: PayrollRun = await this.runs.manager.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock($1, $2)', [
        PAYROLL_LOCK_NAMESPACE,
        branchId,
      ]);
      const owed = await this.compute(em, branchId, dto.from, dto.to, null);
      if (!owed.paidPeriods.length) {
        throw new BadRequestException(
          'No period on the timetable carries a pay per period, so there is no tutorial to pay.',
        );
      }
      const chosen = owed.teachers.filter(
        (t) => t.payable > 0 && (!only.length || only.includes(t.employeeId)),
      );
      if (!chosen.length) {
        throw new BadRequestException(
          owed.totals.alreadyPaid && !owed.totals.payable
            ? 'Every tutorial lesson marked taught in these days has already been paid.'
            : 'No tutorial lesson in these days is marked taught yet — mark them in Branch Staff → Attendance → By lesson first.',
        );
      }
      const currencies = new Set(chosen.map((t) => t.currency));
      if (currencies.size > 1) {
        throw new BadRequestException(
          `These teachers are paid in different currencies (${[...currencies].join(', ')}). One run posts one expense, so it can only pay one.`,
        );
      }
      const lines: PayrollRunLine[] = chosen.map((t) => ({
        employeeId: t.employeeId,
        fullName: t.fullName,
        jobTitle: t.jobTitle,
        amount: t.amount,
        lessons: t.lessons.map(
          (l): PayrollRunLesson => ({
            date: l.date,
            period: l.period,
            classCode: l.classCode,
            subject: l.subject,
            rate: l.rate,
          }),
        ),
      }));
      const repo = em.getRepository(PayrollRun);
      return repo.save(
        repo.create({
          branchId,
          periodKey,
          kind: PayrollRunKind.TUTORIAL,
          label: dto.label ? String(dto.label).trim() : null,
          total: money(lines.reduce((sum, l) => sum + l.amount, 0)),
          currency: [...currencies][0] || 'ETB',
          headcount: lines.length,
          lines,
          expenseId: null,
          occurredAt,
          postedByUserId: userId ?? null,
          note: dto.note ? String(dto.note).trim() : null,
        }),
      );
    });

    const lessons = run.lines.reduce((n, l) => n + (l.lessons?.length || 0), 0);
    try {
      const expense = await this.billing.createBranchExpense(branchId, userId, {
        category: BranchExpenseCategory.PAYROLL,
        amount: Number(run.total),
        currency: run.currency,
        occurredAt,
        note: `Tutorial pay — ${dto.label || periodKey} (${run.lines.length} teachers, ${lessons} periods)`,
      });
      run.expenseId = Number(expense.id);
      run = await this.runs.save(run);
    } catch (error) {
      await this.runs.delete({ id: run.id });
      throw error;
    }
    return { ...this.payroll.toRun(run), lessons };
  }
}
