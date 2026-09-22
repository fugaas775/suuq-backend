import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchEmployee } from '../payroll/entities/branch-employee.entity';
import { SchoolClass } from './entities/school-class.entity';
import {
  SchoolTimetable,
  SchoolTimetablePeriod,
  SchoolTimetableShift,
  SchoolTimetableSlot,
} from './entities/school-timetable.entity';
import { PutSchoolTimetableDto } from './dto/school-timetable.dto';

const DAY_NAMES = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A person's name the way two spellings of it compare: lowercased, accents
 * and punctuation dropped, whitespace collapsed. "C/raxmaan" and "c raxmaan"
 * are one person; "Cabdiqaadir" and "Cabdiqadir" are not — the rule is
 * deliberately no looser than that, because a wrong link puts a teacher's
 * timetable on somebody else's attendance row, silently.
 */
export function normalizePersonName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dayName(day: number) {
  return DAY_NAMES[day] || `day ${day}`;
}

/** 'HH:MM' → minutes after midnight. Only ever handed a TIME_RE match. */
function minutesOf(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/**
 * A slot's place in the day, for the teacher clash.
 *
 * `key` is the old rule, kept wherever a bell has no end time: the resolved
 * START time when the bell has one, else shift + period code. `interval` is
 * [start, end) in minutes when the bell has BOTH times (and they are in
 * order) — two of those clash when they overlap at all, not only when they
 * start together.
 */
type SlotWhen = {
  key: string;
  interval: [number, number] | null;
  label: string;
};

/**
 * The branch's weekly period schedule.
 *
 * `put` replaces the whole document (see {@link SchoolTimetable}) and refuses
 * the two faults a timetable must never carry: a class with two lessons in one
 * period, and a teacher in two classes at once. Both are checked against the
 * document as sent, in memory, before anything is written — so a rejected
 * save leaves last week's timetable exactly as it was.
 *
 * Class codes are canonicalised to the registry's spelling and unknown ones
 * refused, for the same reason the attendance register lowercases them: every
 * SCHOOL reader keys on the code, and a timetable for "Grade 3" beside a
 * registry that spells it "3aad" is a timetable for a class that does not
 * exist.
 */
@Injectable()
export class SchoolTimetableService {
  constructor(
    @InjectRepository(SchoolTimetable)
    private readonly repo: Repository<SchoolTimetable>,
    @InjectRepository(SchoolClass)
    private readonly classes: Repository<SchoolClass>,
    @InjectRepository(BranchEmployee)
    private readonly employees: Repository<BranchEmployee>,
  ) {}

  private toResponse(row: SchoolTimetable | null, branchId: number) {
    if (!row) {
      return {
        id: null,
        branchId,
        title: null,
        periods: [] as SchoolTimetablePeriod[],
        shifts: [] as SchoolTimetableShift[],
        slots: [] as SchoolTimetableSlot[],
        notes: null,
        updatedByUserId: null,
        createdAt: null,
        updatedAt: null,
      };
    }
    return {
      id: Number(row.id),
      branchId: row.branchId,
      title: row.title ?? null,
      periods: Array.isArray(row.periods) ? row.periods : [],
      shifts: Array.isArray(row.shifts) ? row.shifts : [],
      slots: Array.isArray(row.slots) ? row.slots : [],
      notes: row.notes ?? null,
      updatedByUserId: row.updatedByUserId ?? null,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  async get(branchId: number) {
    const row = await this.repo.findOne({ where: { branchId } });
    return this.toResponse(row, branchId);
  }

  /**
   * The signed-in person's own week.
   *
   * A teacher's lane can read the whole timetable (VIEW_CLASS_BOARD or
   * MARK_ATTENDANCE), but it cannot read the staff register that says which
   * employee they are — that list is manager-only, because it carries pay.
   * So the join is made here: the caller's user id → their employment row on
   * this branch → the slots that name it. No row, or no login on the row, is
   * an empty answer rather than an error; the till simply shows no strip.
   */
  async mine(branchId: number, userId: number | null) {
    const empty = {
      employee: null as null | {
        id: number;
        fullName: string;
        jobTitle: string | null;
      },
      title: null as string | null,
      periods: [] as SchoolTimetablePeriod[],
      shifts: [] as SchoolTimetableShift[],
      slots: [] as SchoolTimetableSlot[],
    };
    if (!userId) return empty;
    const rows = await this.employees.find({ where: { branchId, userId } });
    const employee =
      rows.find((r) => String(r.status).toUpperCase() !== 'INACTIVE') ??
      rows[0] ??
      null;
    if (!employee) return empty;
    const doc = await this.get(branchId);
    const id = Number(employee.id);
    return {
      employee: {
        id,
        fullName: employee.fullName,
        jobTitle: employee.jobTitle ?? null,
      },
      title: doc.title,
      periods: doc.periods,
      shifts: doc.shifts,
      slots: doc.slots.filter((slot) => Number(slot.employeeId) === id),
    };
  }

  private normalizePeriods(
    dto: PutSchoolTimetableDto,
  ): SchoolTimetablePeriod[] {
    const seen = new Set<string>();
    const out: SchoolTimetablePeriod[] = [];
    (dto.periods || []).forEach((p, index) => {
      const code = String(p.code || '').trim();
      if (!code) throw new BadRequestException('A period needs a code.');
      const key = code.toUpperCase();
      if (seen.has(key)) {
        throw new BadRequestException(`Period "${code}" is listed twice.`);
      }
      seen.add(key);

      const times: Record<
        string,
        { start: string | null; end: string | null }
      > = {};
      for (const [shiftRaw, raw] of Object.entries(p.times || {})) {
        const shift =
          String(shiftRaw || '')
            .trim()
            .toUpperCase() || '*';
        // A bare 'HH:MM' is a start time with no end — the DTO allows it.
        const t = typeof raw === 'string' ? { start: raw, end: null } : raw;
        const start = t?.start ? String(t.start).trim() || null : null;
        const end = t?.end ? String(t.end).trim() || null : null;
        for (const value of [start, end]) {
          if (value && !TIME_RE.test(value)) {
            throw new BadRequestException(
              `Period "${code}" has an invalid time "${value}" — use HH:MM.`,
            );
          }
        }
        times[shift] = { start, end };
      }

      const days =
        Array.isArray(p.days) && p.days.length
          ? [...new Set(p.days.map((d) => Number(d)))].sort((a, b) => a - b)
          : [1, 2, 3, 4, 5];

      out.push({
        code,
        label: p.label ? String(p.label).trim() || null : null,
        kind: p.kind === 'BREAK' ? 'BREAK' : 'LESSON',
        sortOrder: Number.isFinite(Number(p.sortOrder))
          ? Number(p.sortOrder)
          : index,
        days,
        times,
      });
    });
    return out.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private normalizeShifts(
    dto: PutSchoolTimetableDto,
    canonicalClass: (code: string) => string,
  ): SchoolTimetableShift[] {
    const seen = new Set<string>();
    const placed = new Map<string, string>();
    return (dto.shifts || []).map((s) => {
      const code = String(s.code || '')
        .trim()
        .toUpperCase();
      if (!code) throw new BadRequestException('A shift needs a code.');
      if (seen.has(code)) {
        throw new BadRequestException(`Shift "${code}" is listed twice.`);
      }
      seen.add(code);
      const classCodes = [
        ...new Set((s.classCodes || []).map((c) => canonicalClass(c))),
      ];
      for (const classCode of classCodes) {
        const already = placed.get(classCode.toLowerCase());
        if (already && already !== code) {
          throw new BadRequestException(
            `${classCode} is in both the ${already} and ${code} shifts.`,
          );
        }
        placed.set(classCode.toLowerCase(), code);
      }
      return {
        code,
        label: s.label ? String(s.label).trim() || null : null,
        classCodes,
      };
    });
  }

  /**
   * Replace the branch's timetable with the document sent.
   *
   * Teachers are resolved in two directions: an `employeeId` fills in the
   * printed name, and a bare name that matches exactly ONE active employee is
   * linked to them. A name matching two (a school with two Mustafes) or none
   * stays unlinked, which the office resolves by hand — guessing here would
   * put one teacher's periods on the other's record.
   */
  async put(dto: PutSchoolTimetableDto, actorUserId: number | null) {
    const branchId = Number(dto.branchId);

    const registry = await this.classes.find({ where: { branchId } });
    const classByLower = new Map<string, SchoolClass>();
    for (const row of registry) {
      classByLower.set(String(row.code).trim().toLowerCase(), row);
    }
    const canonicalClass = (raw: string) => {
      const wanted = String(raw || '').trim();
      const hit = classByLower.get(wanted.toLowerCase());
      if (!hit) {
        throw new BadRequestException(
          `"${wanted}" is not a class in this school's registry. Add it under Classes first.`,
        );
      }
      return hit.code;
    };

    const staff = await this.employees.find({ where: { branchId } });
    const employeeById = new Map<number, BranchEmployee>();
    const activeByName = new Map<string, BranchEmployee[]>();
    for (const e of staff) {
      employeeById.set(Number(e.id), e);
      if (String(e.status).toUpperCase() === 'INACTIVE') continue;
      const key = normalizePersonName(e.fullName);
      if (!key) continue;
      activeByName.set(key, [...(activeByName.get(key) || []), e]);
    }

    const periods = this.normalizePeriods(dto);
    const periodByKey = new Map<string, SchoolTimetablePeriod>();
    periods.forEach((p) => periodByKey.set(p.code.toUpperCase(), p));
    const periodRank = new Map<string, number>();
    periods.forEach((p, i) => periodRank.set(p.code.toUpperCase(), i));

    const shifts = this.normalizeShifts(dto, canonicalClass);
    const shiftOfClass = new Map<string, string>();
    for (const shift of shifts) {
      for (const code of shift.classCodes) {
        shiftOfClass.set(code.toLowerCase(), shift.code);
      }
    }

    const classSeen = new Map<string, SchoolTimetableSlot>();
    // Per teacher per day, every lesson placed so far and when it runs.
    const teacherDay = new Map<
      string,
      Array<{ slot: SchoolTimetableSlot; when: SlotWhen }>
    >();
    const slots: SchoolTimetableSlot[] = [];

    for (const raw of dto.slots || []) {
      const day = Number(raw.day);
      const periodCode = String(raw.period || '').trim();
      const period = periodByKey.get(periodCode.toUpperCase()) || null;
      if (periods.length && !period) {
        throw new BadRequestException(
          `"${periodCode}" is not on the bell schedule.`,
        );
      }
      if (period?.kind === 'BREAK') {
        throw new BadRequestException(
          `${period.code} is a break — a lesson cannot sit on it.`,
        );
      }
      if (period && !period.days.includes(day)) {
        throw new BadRequestException(
          `${period.code} does not run on ${dayName(day)}.`,
        );
      }

      const classCode = canonicalClass(raw.classCode);
      const subject = String(raw.subject || '').trim();
      if (!subject) {
        throw new BadRequestException(
          `${classCode} on ${dayName(day)} ${periodCode} has no subject.`,
        );
      }

      let employeeId: number | null =
        raw.employeeId == null ? null : Number(raw.employeeId);
      let teacherName: string | null = raw.teacherName
        ? String(raw.teacherName).replace(/\s+/g, ' ').trim() || null
        : null;
      if (employeeId != null) {
        const employee = employeeById.get(employeeId);
        if (!employee) {
          throw new BadRequestException(
            `Employee #${employeeId} is not on this branch's staff register.`,
          );
        }
        if (!teacherName) teacherName = employee.fullName;
      } else if (teacherName) {
        const matches =
          activeByName.get(normalizePersonName(teacherName)) || [];
        if (matches.length === 1) employeeId = Number(matches[0].id);
      }

      const slot: SchoolTimetableSlot = {
        day,
        period: period ? period.code : periodCode,
        classCode,
        subject,
        teacherName,
        employeeId,
        room: raw.room ? String(raw.room).trim() || null : null,
      };

      const classKey = `${day}|${slot.period.toUpperCase()}|${classCode.toLowerCase()}`;
      const clash = classSeen.get(classKey);
      if (clash) {
        throw new BadRequestException(
          `${classCode} has two lessons on ${dayName(day)} ${slot.period} (${clash.subject} and ${subject}).`,
        );
      }
      classSeen.set(classKey, slot);

      /* Two shifts ring the same bell at different hours: SMAQ's Monday P1 is
         08:00 for a morning class and 14:00 for an afternoon one, and a teacher
         holding both is not double-booked — the first import was refused for
         exactly this. So the clash is keyed on the resolved START TIME when the
         bell has one, and on shift + period code when it does not; a period
         code alone is only "the same time" inside one shift.

         And where the bell has an END as well, two lessons clash when their
         hours OVERLAP, not only when they start together: the afternoon
         shift's P1 at 12:20–13:00 and the morning's P6 at 12:00–12:40 put one
         teacher in two rooms for twenty minutes, and equal start times alone
         never saw it. */
      const shift = shiftOfClass.get(classCode.toLowerCase()) || null;
      const times = period
        ? period.times[shift || '*'] || period.times['*'] || null
        : null;
      const start = times?.start || null;
      const end = times?.end || null;
      const when: SlotWhen = {
        key: start
          ? `t:${start}`
          : `p:${shift || '*'}|${slot.period.toUpperCase()}`,
        interval:
          start && end && minutesOf(start) < minutesOf(end)
            ? [minutesOf(start), minutesOf(end)]
            : null,
        label: `${slot.period}${start ? ` ${start}${end ? `–${end}` : ''}` : ''}`,
      };
      const teacherKey =
        employeeId != null
          ? `e:${employeeId}`
          : teacherName
            ? `n:${normalizePersonName(teacherName)}`
            : null;
      if (teacherKey) {
        const key = `${day}|${teacherKey}`;
        const placed = teacherDay.get(key) || [];
        const busy = placed.find(
          (p) =>
            p.slot.classCode.toLowerCase() !== classCode.toLowerCase() &&
            (p.when.key === when.key ||
              (p.when.interval &&
                when.interval &&
                p.when.interval[0] < when.interval[1] &&
                when.interval[0] < p.when.interval[1])),
        );
        if (busy) {
          const who = teacherName || busy.slot.teacherName || 'A teacher';
          // Same period: the message the office has always read. Different
          // periods whose hours overlap: both named, with their hours, since
          // "at the same time on Monday P1" would point at only one of them.
          throw new BadRequestException(
            busy.slot.period.toUpperCase() === slot.period.toUpperCase()
              ? `${who} is in ${busy.slot.classCode} and ${classCode} at the same time on ${dayName(day)} ${slot.period}.`
              : `${who} is in ${busy.slot.classCode} (${busy.when.label}) and ${classCode} (${when.label}) at the same time on ${dayName(day)}.`,
          );
        }
        placed.push({ slot, when });
        teacherDay.set(key, placed);
      }

      slots.push(slot);
    }

    const classRank = new Map<string, number>();
    [...registry]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .forEach((c, i) => classRank.set(String(c.code).toLowerCase(), i));
    slots.sort(
      (a, b) =>
        a.day - b.day ||
        (periodRank.get(a.period.toUpperCase()) ?? 999) -
          (periodRank.get(b.period.toUpperCase()) ?? 999) ||
        a.period.localeCompare(b.period) ||
        (classRank.get(a.classCode.toLowerCase()) ?? 999) -
          (classRank.get(b.classCode.toLowerCase()) ?? 999) ||
        a.classCode.localeCompare(b.classCode),
    );

    // The document is replaced under a row lock, and — when the caller says
    // which version it read — only over that version. Two offices editing
    // the week at once used to end with whichever saved second, the other's
    // afternoon of changes silently gone; now the second is told, and handed
    // the week as it stands to re-apply its edit to.
    return this.repo.manager.transaction(async (em) => {
      const repo = em.getRepository(SchoolTimetable);
      const existing = await repo.findOne({
        where: { branchId },
        lock: { mode: 'pessimistic_write' },
      });
      if (dto.expectedUpdatedAt) {
        const expected = Date.parse(dto.expectedUpdatedAt);
        const current = existing?.updatedAt
          ? new Date(existing.updatedAt).getTime()
          : NaN;
        if (expected !== current) {
          throw new ConflictException({
            code: 'TIMETABLE_CHANGED',
            message:
              'The timetable changed since it was read — it has been reloaded; check it and save again.',
            details: { current: this.toResponse(existing, branchId) },
          });
        }
      }
      const row = existing ?? repo.create({ branchId });
      row.title = dto.title ? String(dto.title).trim() || null : null;
      row.periods = periods;
      row.shifts = shifts;
      row.slots = slots;
      row.notes = dto.notes ? String(dto.notes).trim() || null : null;
      row.updatedByUserId = actorUserId ?? null;

      return this.toResponse(await repo.save(row), branchId);
    });
  }
}
