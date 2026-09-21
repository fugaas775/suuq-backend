import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  AttendanceMark,
  AttendanceStatus,
  AttendanceSubjectType,
} from './entities/attendance-mark.entity';
import { LessonAttendanceMark } from './entities/lesson-attendance-mark.entity';
import {
  ListAttendanceQueryDto,
  MarkAttendanceDto,
  MarkLessonAttendanceDto,
  ReclassAttendanceDto,
  RekeyAttendanceDto,
} from './dto/attendance.dto';

/** 'YYYY-MM-DD' from anything the ISO8601 validator let through. */
function dayOf(value: string | undefined | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Class codes are matched case-insensitively everywhere in SCHOOL; stored lowered. */
function classKey(value: string | undefined | null): string | null {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  return raw || null;
}

export interface AttendanceSummaryRow {
  subjectRef: string;
  subjectName: string | null;
  classCode: string | null;
  marked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

/**
 * The branch's attendance register, for pupils and for staff.
 *
 * One service over one table; the two controllers above it differ only in who
 * they let in. See {@link AttendanceMark} for why the record is a table rather
 * than a field on a pupil's folio.
 *
 * Nothing here invents a school calendar. A day exists in the register because
 * somebody marked it, so weekends, holidays and the Ethiopian year need no
 * special case, and a class nobody marked is simply not counted rather than
 * counted as absent.
 */
@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceMark)
    private readonly repo: Repository<AttendanceMark>,
    @InjectRepository(LessonAttendanceMark)
    private readonly lessons: Repository<LessonAttendanceMark>,
  ) {}

  private toResponse(row: AttendanceMark) {
    return {
      id: Number(row.id),
      branchId: row.branchId,
      attendanceDate: String(row.attendanceDate).slice(0, 10),
      subjectType: row.subjectType,
      subjectRef: row.subjectRef,
      subjectName: row.subjectName ?? null,
      classCode: row.classCode ?? null,
      status: row.status,
      minutesLate: row.minutesLate ?? null,
      note: row.note ?? null,
      recordedByUserId: row.recordedByUserId ?? null,
      recordedByName:
        (row as { recordedByName?: string | null }).recordedByName ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Apply the day/range/class/subject filters shared by `list` and `summary`.
   *
   * `date` and `from`/`to` are alternatives; supplying none is legitimate and
   * means the whole register, which is what a report card asks for when the term
   * it is printing has no published calendar.
   */
  private scoped(
    alias: string,
    branchId: number,
    subjectType: AttendanceSubjectType,
    query: ListAttendanceQueryDto,
  ) {
    const qb = this.repo
      .createQueryBuilder(alias)
      .where(`${alias}."branchId" = :branchId`, { branchId })
      .andWhere(`${alias}."subjectType" = :subjectType`, { subjectType });

    const exact = dayOf(query.date);
    if (exact) {
      qb.andWhere(`${alias}."attendanceDate" = :exact`, { exact });
    } else {
      const from = dayOf(query.from);
      const to = dayOf(query.to);
      if (from) qb.andWhere(`${alias}."attendanceDate" >= :from`, { from });
      if (to) qb.andWhere(`${alias}."attendanceDate" <= :to`, { to });
    }

    const code = classKey(query.classCode);
    if (code) qb.andWhere(`${alias}."classCode" = :code`, { code });

    const subjectRef = String(query.subjectRef ?? '').trim();
    if (subjectRef) {
      qb.andWhere(`${alias}."subjectRef" = :subjectRef`, { subjectRef });
    }

    return qb;
  }

  async list(
    subjectType: AttendanceSubjectType,
    query: ListAttendanceQueryDto,
  ) {
    const rows = await this.scoped('m', query.branchId, subjectType, query)
      .orderBy('m."attendanceDate"', 'ASC')
      .addOrderBy('m."subjectRef"', 'ASC')
      // A month of a 242-pupil school is ~5,000 rows; the cap is the backstop
      // for a caller that asks for a whole year of a whole branch at once.
      .take(20000)
      .getMany();
    return { items: rows.map((r) => this.toResponse(r)) };
  }

  /**
   * Counts, computed in the database.
   *
   * The report card, the month view and the Reports block all want totals, and
   * none of them should pull a year of rows across the wire to add them up.
   *
   * Grouped by subject AND class: a pupil promoted mid-year has marks under two
   * class codes, and rolling them together here would lose the per-class view
   * that Reports is built on. A caller wanting one number per pupil sums the
   * rows — the frontend's `summarizeAttendance` does exactly that.
   *
   * COUNTS ONLY, never a percentage. The rate is one definition living in the
   * frontend's `attendanceRate`, so the parent's report card, the class board
   * and the Bureau's export can never quote three different numbers. A second
   * copy here is exactly how they would.
   */
  /**
   * One person's own register, read-only: the day marks and the lesson
   * marks the heads recorded about them over a range. Owner 2026-09-20:
   * "Teachers attendance is taken by the director or deputy director or the
   * owner in Branch Staff, so teachers should see as a read-only their
   * attendance taken by their heads." `subjectRef` is the employee id, the
   * key both staff registers file under; the caller resolves it from the
   * actor. A person with no employee row gets empty lists, not an error.
   */
  async mine(subjectRef: string | null, query: ListAttendanceQueryDto) {
    if (!subjectRef) return { days: [], lessons: [] };
    const [days, lessons] = await Promise.all([
      this.list(AttendanceSubjectType.STAFF, query),
      this.listLessons(AttendanceSubjectType.STAFF, query),
    ]);
    const own = (row: { subjectRef?: unknown }) =>
      String(row?.subjectRef ?? '') === String(subjectRef);
    return {
      days: (days?.items ?? []).filter(own),
      lessons: (lessons?.items ?? []).filter(own),
    };
  }

  async summary(
    subjectType: AttendanceSubjectType,
    query: ListAttendanceQueryDto,
  ) {
    const filter = (status: AttendanceStatus) =>
      `COUNT(*) FILTER (WHERE m."status" = '${status}')::int`;

    const rows = await this.scoped('m', query.branchId, subjectType, query)
      .select('m."subjectRef"', 'subjectRef')
      .addSelect('m."classCode"', 'classCode')
      // The latest spelling of the name, so a summary can label itself without
      // joining back to a roster the person may have left.
      .addSelect('MAX(m."subjectName")', 'subjectName')
      .addSelect('COUNT(*)::int', 'marked')
      .addSelect(filter(AttendanceStatus.PRESENT), 'present')
      .addSelect(filter(AttendanceStatus.ABSENT), 'absent')
      .addSelect(filter(AttendanceStatus.LATE), 'late')
      .addSelect(filter(AttendanceStatus.EXCUSED), 'excused')
      .groupBy('m."subjectRef"')
      .addGroupBy('m."classCode"')
      .getRawMany<AttendanceSummaryRow>();

    // The number of days the register was taken at all, which is the honest
    // denominator for "how much of the term has been recorded" — distinct from
    // any one person's marked count.
    const daysRow = await this.scoped('m', query.branchId, subjectType, query)
      .select('COUNT(DISTINCT m."attendanceDate")::int', 'days')
      .getRawOne<{ days: number }>();

    return {
      items: rows.map((row) => ({
        subjectRef: String(row.subjectRef),
        subjectName: row.subjectName ?? null,
        classCode: row.classCode ?? null,
        marked: Number(row.marked) || 0,
        present: Number(row.present) || 0,
        absent: Number(row.absent) || 0,
        late: Number(row.late) || 0,
        excused: Number(row.excused) || 0,
      })),
      days: Number(daysRow?.days) || 0,
    };
  }

  /**
   * Take (or re-take) a register for one day.
   *
   * Idempotent by construction: the unique index on
   * (branch, type, subject, day) turns a second submission into an update, so a
   * teacher correcting one child at eleven o'clock cannot create a second mark
   * for the morning. An entry with a null status DELETES the day instead —
   * clearing a mark is not the same as marking an absence.
   */
  async mark(
    subjectType: AttendanceSubjectType,
    dto: MarkAttendanceDto,
    recordedByUserId: number | null,
    /* The recorder's name and their class scope, resolved by the controller.
       `scope.assert` refuses a class outside a teacher's own before a row is
       written; absent (the staff register, older callers), nothing is scoped. */
    who: {
      recordedByName?: string | null;
      scope?: {
        assert: (classCode: unknown) => void;
        /* Optional: refuses pupils whose folio sits in another class. Runs
           after the lists are built and before the first write. */
        assertPupils?: (
          classCode: unknown,
          subjectRefs: string[],
        ) => Promise<void> | void;
      } | null;
    } = {},
  ) {
    const day = dayOf(dto.date);
    if (!day) throw new BadRequestException('date must be YYYY-MM-DD.');

    const code =
      subjectType === AttendanceSubjectType.STUDENT
        ? classKey(dto.classCode)
        : null;
    if (subjectType === AttendanceSubjectType.STUDENT && who.scope) {
      who.scope.assert(dto.classCode);
    }
    const recordedByName =
      String(who.recordedByName ?? '')
        .trim()
        .slice(0, 160) || null;

    const clearing: string[] = [];
    const upserting: Partial<AttendanceMark>[] = [];
    const seen = new Set<string>();

    for (const entry of dto.entries || []) {
      const subjectRef = String(entry?.subjectRef ?? '').trim();
      if (!subjectRef || seen.has(subjectRef)) continue;
      seen.add(subjectRef);

      if (!entry.status) {
        clearing.push(subjectRef);
        continue;
      }

      upserting.push({
        branchId: dto.branchId,
        attendanceDate: day,
        subjectType,
        subjectRef,
        subjectName: entry.subjectName
          ? String(entry.subjectName).trim().slice(0, 255)
          : null,
        classCode: code,
        status: entry.status,
        // Only a LATE row carries minutes. Leaving them on a row later
        // corrected to PRESENT would report a punctual child as fifteen minutes
        // late forever, because the upsert overwrites the status and not the
        // fields the operator never touched again.
        minutesLate:
          entry.status === AttendanceStatus.LATE && entry.minutesLate != null
            ? Number(entry.minutesLate)
            : null,
        note: entry.note ? String(entry.note).trim().slice(0, 200) : null,
        recordedByUserId,
        recordedByName,
        updatedAt: new Date(),
      });
    }

    if (
      subjectType === AttendanceSubjectType.STUDENT &&
      who.scope?.assertPupils &&
      (upserting.length || clearing.length)
    ) {
      await who.scope.assertPupils(dto.classCode, [
        ...upserting.map((row) => String(row.subjectRef)),
        ...clearing,
      ]);
    }

    if (upserting.length) {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(AttendanceMark)
        .values(upserting)
        // The conflict target has to name the unique index's columns, in its
        // order — a mismatch is a 500 on the very first save, not a build error.
        .orUpdate(
          [
            'subjectName',
            'classCode',
            'status',
            'minutesLate',
            'note',
            'recordedByUserId',
            'recordedByName',
            'updatedAt',
          ],
          ['branchId', 'subjectType', 'subjectRef', 'attendanceDate'],
        )
        .execute();
    }

    let cleared = 0;
    if (clearing.length) {
      const result = await this.repo
        .createQueryBuilder()
        .delete()
        .from(AttendanceMark)
        .where('"branchId" = :branchId', { branchId: dto.branchId })
        .andWhere('"subjectType" = :subjectType', { subjectType })
        .andWhere('"attendanceDate" = :day', { day })
        .andWhere('"subjectRef" IN (:...refs)', { refs: clearing })
        .execute();
      cleared = result.affected ?? 0;
    }

    return { saved: upserting.length, cleared, date: day };
  }

  /**
   * Move a class's register to its new code.
   *
   * A rename says the class is now called something else, so its history comes
   * with it — otherwise the register splits in two and neither half can be found
   * under the name on the board. Promotion is the opposite case and must not
   * call this: a child moving up does not change which class took last year's
   * register.
   *
   * `subjectRefs` narrows it to named pupils, for the SPLIT: half of 3aad
   * becomes 3aad B, and their days marked have to follow them or the new
   * section opens with an empty register while its pupils' attendance sits
   * under a class they are no longer in. An EMPTY array is not "everyone" —
   * it is a split that moved nobody, and updating the whole class on it would
   * be the opposite of what was asked.
   */
  async reclass(dto: ReclassAttendanceDto) {
    const from = classKey(dto.from);
    const to = classKey(dto.to);
    if (!from || !to) {
      throw new BadRequestException('from and to are both required.');
    }
    if (from === to) return { updated: 0 };

    const refs = Array.isArray(dto.subjectRefs)
      ? dto.subjectRefs.map((ref) => String(ref).trim()).filter(Boolean)
      : null;
    if (refs && !refs.length) return { updated: 0 };

    const qb = this.repo
      .createQueryBuilder()
      .update(AttendanceMark)
      .set({ classCode: to })
      .where('"branchId" = :branchId', { branchId: dto.branchId })
      .andWhere('"subjectType" = :subjectType', {
        subjectType: AttendanceSubjectType.STUDENT,
      })
      .andWhere('"classCode" = :from', { from });

    if (refs) qb.andWhere('"subjectRef" IN (:...refs)', { refs });

    const result = await qb.execute();
    return { updated: result.affected ?? 0 };
  }

  /**
   * Re-file one pupil's marks under another folio id — see RekeyAttendanceDto.
   *
   * Two statements, in order: drop the duplicate's marks on days the survivor
   * already has one (the unique index would refuse the move), then move the
   * rest. Both rows' marks are the same child's, so nothing is lost that the
   * survivor did not already say.
   */
  async rekey(dto: RekeyAttendanceDto) {
    const from = String(dto.from ?? '').trim();
    const to = String(dto.to ?? '').trim();
    if (!from || !to) {
      throw new BadRequestException('from and to are both required.');
    }
    if (from === to) return { moved: 0, dropped: 0 };

    const dropped = await this.repo
      .createQueryBuilder()
      .delete()
      .from(AttendanceMark)
      .where('"branchId" = :branchId', { branchId: dto.branchId })
      .andWhere('"subjectType" = :subjectType', {
        subjectType: AttendanceSubjectType.STUDENT,
      })
      .andWhere('"subjectRef" = :from', { from })
      .andWhere(
        `"attendanceDate" IN (
          SELECT "attendanceDate" FROM pos_branch_attendance
          WHERE "branchId" = :branchId AND "subjectType" = :subjectType AND "subjectRef" = :to
        )`,
        { to },
      )
      .execute();

    const moved = await this.repo
      .createQueryBuilder()
      .update(AttendanceMark)
      .set({ subjectRef: to })
      .where('"branchId" = :branchId', { branchId: dto.branchId })
      .andWhere('"subjectType" = :subjectType', {
        subjectType: AttendanceSubjectType.STUDENT,
      })
      .andWhere('"subjectRef" = :from', { from })
      .execute();

    return { moved: moved.affected ?? 0, dropped: dropped.affected ?? 0 };
  }

  // ── Lessons: the grain below the day ────────────────────────────────────

  private lessonToResponse(row: LessonAttendanceMark) {
    return {
      id: Number(row.id),
      branchId: row.branchId,
      attendanceDate: String(row.attendanceDate).slice(0, 10),
      subjectType: row.subjectType,
      subjectRef: row.subjectRef,
      subjectName: row.subjectName ?? null,
      periodCode: row.periodCode,
      classCode: row.classCode,
      subject: row.subject ?? null,
      status: row.status,
      minutesLate: row.minutesLate ?? null,
      note: row.note ?? null,
      recordedByUserId: row.recordedByUserId ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** The same day / range / class / subject filters, over the lesson table. */
  private scopedLessons(
    alias: string,
    branchId: number,
    subjectType: AttendanceSubjectType,
    query: ListAttendanceQueryDto,
  ) {
    const qb = this.lessons
      .createQueryBuilder(alias)
      .where(`${alias}."branchId" = :branchId`, { branchId })
      .andWhere(`${alias}."subjectType" = :subjectType`, { subjectType });

    const exact = dayOf(query.date);
    if (exact) {
      qb.andWhere(`${alias}."attendanceDate" = :exact`, { exact });
    } else {
      const from = dayOf(query.from);
      const to = dayOf(query.to);
      if (from) qb.andWhere(`${alias}."attendanceDate" >= :from`, { from });
      if (to) qb.andWhere(`${alias}."attendanceDate" <= :to`, { to });
    }

    const code = classKey(query.classCode);
    if (code) qb.andWhere(`${alias}."classCode" = :code`, { code });

    const subjectRef = String(query.subjectRef ?? '').trim();
    if (subjectRef) {
      qb.andWhere(`${alias}."subjectRef" = :subjectRef`, { subjectRef });
    }
    return qb;
  }

  async listLessons(
    subjectType: AttendanceSubjectType,
    query: ListAttendanceQueryDto,
  ) {
    const rows = await this.scopedLessons(
      'l',
      query.branchId,
      subjectType,
      query,
    )
      .orderBy('l."attendanceDate"', 'ASC')
      .addOrderBy('l."subjectRef"', 'ASC')
      .addOrderBy('l."periodCode"', 'ASC')
      // A month of 14 teachers × 28 lessons is ~1,600 rows; the cap is the
      // backstop for a whole year of a whole branch.
      .take(40000)
      .getMany();
    return { items: rows.map((r) => this.lessonToResponse(r)) };
  }

  /**
   * Counts per person, in the database — never a percentage, for the reason
   * the day summary gives: the rate has one definition and it lives in the
   * frontend. `lessons` is the number marked, which is the honest denominator;
   * the lessons a teacher SHOULD have taught are the timetable's to say.
   */
  async summaryLessons(
    subjectType: AttendanceSubjectType,
    query: ListAttendanceQueryDto,
  ) {
    const filter = (status: AttendanceStatus) =>
      `COUNT(*) FILTER (WHERE l."status" = '${status}')::int`;
    const rows = await this.scopedLessons(
      'l',
      query.branchId,
      subjectType,
      query,
    )
      .select('l."subjectRef"', 'subjectRef')
      .addSelect('MAX(l."subjectName")', 'subjectName')
      .addSelect('COUNT(*)::int', 'marked')
      .addSelect(filter(AttendanceStatus.PRESENT), 'present')
      .addSelect(filter(AttendanceStatus.ABSENT), 'absent')
      .addSelect(filter(AttendanceStatus.LATE), 'late')
      .addSelect(filter(AttendanceStatus.EXCUSED), 'excused')
      .addSelect('COUNT(DISTINCT l."attendanceDate")::int', 'days')
      .groupBy('l."subjectRef"')
      .getRawMany<AttendanceSummaryRow & { days: number }>();
    const daysRow = await this.scopedLessons(
      'l',
      query.branchId,
      subjectType,
      query,
    )
      .select('COUNT(DISTINCT l."attendanceDate")::int', 'days')
      .getRawOne<{ days: number }>();
    return {
      items: rows.map((row) => ({
        subjectRef: String(row.subjectRef),
        subjectName: row.subjectName ?? null,
        marked: Number(row.marked) || 0,
        present: Number(row.present) || 0,
        absent: Number(row.absent) || 0,
        late: Number(row.late) || 0,
        excused: Number(row.excused) || 0,
        days: Number(row.days) || 0,
      })),
      days: Number(daysRow?.days) || 0,
    };
  }

  /**
   * Mark (or re-mark) a day's lessons.
   *
   * Idempotent on (branch, type, person, day, period, class): a second save of
   * Monday P1 for 3aad updates the mark rather than adding a second lesson. A
   * null status DELETES that lesson's mark — "no register was taken for this
   * lesson", which is a different fact from "the teacher was not there".
   */
  async markLessons(
    subjectType: AttendanceSubjectType,
    dto: MarkLessonAttendanceDto,
    recordedByUserId: number | null,
  ) {
    const day = dayOf(dto.date);
    if (!day) throw new BadRequestException('date must be YYYY-MM-DD.');

    const clearing: {
      subjectRef: string;
      periodCode: string;
      classCode: string;
    }[] = [];
    const upserting: Partial<LessonAttendanceMark>[] = [];
    const seen = new Set<string>();

    for (const entry of dto.entries || []) {
      const subjectRef = String(entry?.subjectRef ?? '').trim();
      const periodCode = String(entry?.periodCode ?? '')
        .trim()
        .slice(0, 16);
      const code = classKey(entry?.classCode);
      if (!subjectRef || !periodCode || !code) {
        throw new BadRequestException(
          'Every lesson entry needs a subjectRef, a periodCode and a classCode.',
        );
      }
      const key = `${subjectRef}|${periodCode.toUpperCase()}|${code}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!entry.status) {
        clearing.push({ subjectRef, periodCode, classCode: code });
        continue;
      }
      upserting.push({
        branchId: dto.branchId,
        attendanceDate: day,
        subjectType,
        subjectRef,
        subjectName: entry.subjectName
          ? String(entry.subjectName).trim().slice(0, 255)
          : null,
        periodCode,
        classCode: code,
        subject: entry.subject
          ? String(entry.subject).trim().slice(0, 120)
          : null,
        status: entry.status,
        minutesLate:
          entry.status === AttendanceStatus.LATE && entry.minutesLate != null
            ? Number(entry.minutesLate)
            : null,
        note: entry.note ? String(entry.note).trim().slice(0, 200) : null,
        recordedByUserId,
        updatedAt: new Date(),
      });
    }

    if (upserting.length) {
      await this.lessons
        .createQueryBuilder()
        .insert()
        .into(LessonAttendanceMark)
        .values(upserting)
        .orUpdate(
          [
            'subjectName',
            'subject',
            'status',
            'minutesLate',
            'note',
            'recordedByUserId',
            'updatedAt',
          ],
          [
            'branchId',
            'subjectType',
            'subjectRef',
            'attendanceDate',
            'periodCode',
            'classCode',
          ],
        )
        .execute();
    }

    let cleared = 0;
    if (clearing.length) {
      const qb = this.lessons
        .createQueryBuilder()
        .delete()
        .from(LessonAttendanceMark)
        .where('"branchId" = :branchId', { branchId: dto.branchId })
        .andWhere('"subjectType" = :subjectType', { subjectType })
        .andWhere('"attendanceDate" = :day', { day })
        .andWhere(
          new Brackets((outer) => {
            clearing.forEach((c, i) => {
              const clause = `("subjectRef" = :ref${i} AND "periodCode" = :period${i} AND "classCode" = :class${i})`;
              const params = {
                [`ref${i}`]: c.subjectRef,
                [`period${i}`]: c.periodCode,
                [`class${i}`]: c.classCode,
              };
              if (i === 0) outer.where(clause, params);
              else outer.orWhere(clause, params);
            });
          }),
        );
      const result = await qb.execute();
      cleared = result.affected ?? 0;
    }

    return { saved: upserting.length, cleared, date: day };
  }
}
