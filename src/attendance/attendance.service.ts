import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AttendanceMark,
  AttendanceStatus,
  AttendanceSubjectType,
} from './entities/attendance-mark.entity';
import {
  ListAttendanceQueryDto,
  MarkAttendanceDto,
  ReclassAttendanceDto,
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
  ) {
    const day = dayOf(dto.date);
    if (!day) throw new BadRequestException('date must be YYYY-MM-DD.');

    const code =
      subjectType === AttendanceSubjectType.STUDENT
        ? classKey(dto.classCode)
        : null;

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
        updatedAt: new Date(),
      });
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
   */
  async reclass(dto: ReclassAttendanceDto) {
    const from = classKey(dto.from);
    const to = classKey(dto.to);
    if (!from || !to) {
      throw new BadRequestException('from and to are both required.');
    }
    if (from === to) return { updated: 0 };

    const result = await this.repo
      .createQueryBuilder()
      .update(AttendanceMark)
      .set({ classCode: to })
      .where('"branchId" = :branchId', { branchId: dto.branchId })
      .andWhere('"subjectType" = :subjectType', {
        subjectType: AttendanceSubjectType.STUDENT,
      })
      .andWhere('"classCode" = :from', { from })
      .execute();

    return { updated: result.affected ?? 0 };
  }
}
