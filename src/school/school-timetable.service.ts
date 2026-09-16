import { BadRequestException, Injectable } from '@nestjs/common';
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
      for (const [shiftRaw, t] of Object.entries(p.times || {})) {
        const shift =
          String(shiftRaw || '')
            .trim()
            .toUpperCase() || '*';
        const start = t?.start ? String(t.start).trim() : null;
        const end = t?.end ? String(t.end).trim() : null;
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
    const teacherSeen = new Map<string, SchoolTimetableSlot>();
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
         code alone is only "the same time" inside one shift. */
      const shift = shiftOfClass.get(classCode.toLowerCase()) || null;
      const times = period
        ? period.times[shift || '*'] || period.times['*'] || null
        : null;
      const whenKey = times?.start
        ? `t:${times.start}`
        : `p:${shift || '*'}|${slot.period.toUpperCase()}`;
      const teacherKey =
        employeeId != null
          ? `e:${employeeId}`
          : teacherName
            ? `n:${normalizePersonName(teacherName)}`
            : null;
      if (teacherKey) {
        const key = `${day}|${whenKey}|${teacherKey}`;
        const busy = teacherSeen.get(key);
        if (busy && busy.classCode.toLowerCase() !== classCode.toLowerCase()) {
          throw new BadRequestException(
            `${teacherName} is in ${busy.classCode} and ${classCode} at the same time on ${dayName(day)} ${slot.period}.`,
          );
        }
        teacherSeen.set(key, slot);
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

    const existing = await this.repo.findOne({ where: { branchId } });
    const row = existing ?? this.repo.create({ branchId });
    row.title = dto.title ? String(dto.title).trim() || null : null;
    row.periods = periods;
    row.shifts = shifts;
    row.slots = slots;
    row.notes = dto.notes ? String(dto.notes).trim() || null : null;
    row.updatedByUserId = actorUserId ?? null;

    return this.toResponse(await this.repo.save(row), branchId);
  }
}
