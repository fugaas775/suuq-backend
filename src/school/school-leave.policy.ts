/**
 * Who decides a request for leave, and how many school days it covers.
 *
 * Owner 2026-09-22: "Teachers should request Leave and Director or Deputy
 * Director or Manager or Owner should approve/reject." Pure: the service
 * reads the rows, this decides. Mirrors school-class-scope.policy.
 *
 * An approver is the branch owner, a MANAGER login, a platform admin, a
 * login carrying the APPROVE_STAFF_LEAVE capability, or a person whose job
 * on the staff register is a head's — Director, Deputy Director,
 * Principal, Head teacher, Manager, and their Somali and Arabic spellings.
 * The title rule is what makes a Deputy Director who signs in on the
 * teacher lane an approver: the office wrote "Deputy Director" on their
 * row, and that is the school's own statement of who they are.
 *
 * Nobody decides their own request — that is checked by the service, which
 * knows which employee row the actor is.
 */
export const LEAVE_TYPES = [
  'ANNUAL',
  'SICK',
  'PERSONAL',
  'MATERNITY',
  'PATERNITY',
  'STUDY',
  'BEREAVEMENT',
  'UNPAID',
  'OTHER',
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_DECISIONS = ['APPROVED', 'REJECTED'] as const;

export const LEAVE_APPROVER_CAPABILITY = 'APPROVE_STAFF_LEAVE';

/** Job titles that make somebody a head of the school. */
export const HEAD_TITLE_RE =
  /\b(director|principal|head\s?(teacher|master|mistress)|headmaster|headmistress|dean|manager|agaasime|maamule|mudiir|mudir)\b/i;

const GLOBAL_ROLES = ['SUPER_ADMIN', 'ADMIN'];

/** The longest leave a single request may cover, in calendar days. */
export const LEAVE_MAX_CALENDAR_DAYS = 366;

export function isHeadTitle(jobTitle: unknown): boolean {
  return HEAD_TITLE_RE.test(String(jobTitle ?? ''));
}

export function isLeaveApprover({
  actorId,
  ownerId,
  roles,
  assignment,
  employee,
}: {
  actorId: number | null | undefined;
  ownerId: number | null | undefined;
  roles?: string[] | null;
  assignment?: {
    role?: string | null;
    isActive?: boolean;
    capabilities?: string[] | null;
  } | null;
  employee?: { jobTitle?: string | null; status?: string | null } | null;
}): boolean {
  if (actorId == null) return false;
  if (ownerId != null && Number(ownerId) === Number(actorId)) return true;
  if ((roles ?? []).some((r) => GLOBAL_ROLES.includes(String(r).toUpperCase())))
    return true;
  if (assignment && assignment.isActive !== false) {
    if (String(assignment.role ?? '').toUpperCase() === 'MANAGER') return true;
    if (
      (assignment.capabilities ?? [])
        .map((c) => String(c).trim().toUpperCase())
        .includes(LEAVE_APPROVER_CAPABILITY)
    )
      return true;
  }
  if (
    employee &&
    String(employee.status ?? 'ACTIVE').toUpperCase() !== 'INACTIVE' &&
    isHeadTitle(employee.jobTitle)
  )
    return true;
  return false;
}

const DAY_MS = 86_400_000;

/** ISO weekday (1 = Monday … 7 = Sunday) of a 'YYYY-MM-DD'. */
export function isoWeekdayOf(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

export function addCalendarDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function calendarDaysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / DAY_MS) + 1;
}

/**
 * The weekdays the school's bell runs — the union of every period's days.
 * Lessons first; a bell with only breaks on it still says which days the
 * school opens. Empty when there is no timetable: the caller falls back to
 * Monday to Friday.
 */
export function bellWeekdays(
  periods:
    | ReadonlyArray<{ days?: readonly number[] | null; kind?: string | null }>
    | null
    | undefined,
): Set<number> {
  const lessons = new Set<number>();
  const all = new Set<number>();
  for (const p of periods ?? []) {
    for (const d of p?.days ?? []) {
      const n = Number(d);
      if (!Number.isInteger(n) || n < 1 || n > 7) continue;
      all.add(n);
      if (String(p?.kind ?? 'LESSON').toUpperCase() !== 'BREAK') lessons.add(n);
    }
  }
  return lessons.size ? lessons : all;
}

export const DEFAULT_SCHOOL_WEEKDAYS = new Set([1, 2, 3, 4, 5]);

/**
 * School days from `start` to `end` inclusive: the calendar days whose
 * weekday the bell runs on. A weekend-only request holds no school day.
 */
export function schoolDaysBetween(
  start: string,
  end: string,
  weekdays: Set<number> | null | undefined,
): number {
  const total = calendarDaysBetween(start, end);
  if (total <= 0) return 0;
  const open = weekdays && weekdays.size ? weekdays : DEFAULT_SCHOOL_WEEKDAYS;
  let count = 0;
  let day = start;
  for (let i = 0; i < total && i <= LEAVE_MAX_CALENDAR_DAYS; i += 1) {
    if (open.has(isoWeekdayOf(day))) count += 1;
    day = addCalendarDays(day, 1);
  }
  return count;
}

/** Two inclusive date ranges share at least one day. */
export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** A request that still stands in the way of another for the same days. */
export const LIVE_LEAVE_STATUSES = ['PENDING', 'APPROVED'] as const;

/**
 * The same people decide leave, give warnings and confirm a dismissal —
 * one rule, one name for it wherever staff matters are decided.
 */
export const isStaffHead = isLeaveApprover;

/* ── The year's allowance ─────────────────────────────────────────────
 *
 * Owner 2026-10-06: "Teachers should only have a 10% annual leave, if it
 * is more than it should not be tolerated." A person's leave for a school
 * year is capped at a tenth of the school days in it, and a request or an
 * approval that would go past the cap is refused — not flagged, refused —
 * whether the teacher asks or the office records it for them.
 *
 * Annual, personal, study, unpaid and other leave draw on the allowance.
 * Sick, maternity, paternity and bereavement leave are outside it: nobody
 * chooses when they fall ill, and a maternity leave is longer than a tenth
 * of any year. They still show on the heads' board.
 *
 * The year is the school's own: Meskerem 1 to the end of Pagume for an
 * Ethiopian school, 1 September to 31 August otherwise. Its school days
 * are counted on the same bell as a request's.
 */
export const LEAVE_ALLOWANCE_RATE = 0.1;

export const ALLOWANCE_LEAVE_TYPES = [
  'ANNUAL',
  'PERSONAL',
  'STUDY',
  'UNPAID',
  'OTHER',
] as const;

export function countsAgainstAllowance(leaveType: unknown): boolean {
  return (ALLOWANCE_LEAVE_TYPES as readonly string[]).includes(
    String(leaveType ?? '')
      .trim()
      .toUpperCase(),
  );
}

/** A tenth of the year's school days, whole days only. */
export function leaveAllowanceDays(yearSchoolDays: number): number {
  const days = Math.max(0, Number(yearSchoolDays) || 0);
  return Math.floor(days * LEAVE_ALLOWANCE_RATE + 1e-9);
}

/* The same spellings the till accepts (shared/ethiopianSchoolCalendar). */
const ETHIOPIA_NAMES = new Set([
  'ethiopia',
  'et',
  'eth',
  'itoobiya',
  'itoobiyaa',
  'ityopiya',
  'ኢትዮጵያ',
]);

export function isEthiopianCountry(country: unknown): boolean {
  return ETHIOPIA_NAMES.has(
    String(country ?? '')
      .trim()
      .toLowerCase(),
  );
}

const isGregorianLeap = (y: number) =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Meskerem 1 of the Ethiopian year that opens in a Gregorian year: 11
 * September, or the 12th when the Gregorian year that follows is a leap
 * year (so 2027-09-12 opens 2020 E.C., as 2023-09-12 opened 2016 E.C.).
 */
export function ethiopianNewYear(gregorianYear: number): string {
  return `${gregorianYear}-09-${isGregorianLeap(gregorianYear + 1) ? '12' : '11'}`;
}

export type SchoolYearRange = { from: string; to: string; label: string };

/** The school year a day falls in. */
export function schoolYearRangeOf(
  day: string,
  ethiopian: boolean,
): SchoolYearRange {
  const d = String(day).slice(0, 10);
  const year = Number(d.slice(0, 4));
  if (ethiopian) {
    const start = d >= ethiopianNewYear(year) ? year : year - 1;
    return {
      from: ethiopianNewYear(start),
      to: addCalendarDays(ethiopianNewYear(start + 1), -1),
      label: `${start - 7} E.C.`,
    };
  }
  const month = Number(d.slice(5, 7));
  const start = month >= 9 ? year : year - 1;
  return {
    from: `${start}-09-01`,
    to: `${start + 1}-08-31`,
    label: `${start}/${start + 1}`,
  };
}

/** The school years a range touches, first to last — one, or two for a request over the New Year. */
export function schoolYearsTouched(
  start: string,
  end: string,
  ethiopian: boolean,
): SchoolYearRange[] {
  const out = [schoolYearRangeOf(start, ethiopian)];
  let cursor = out[0].to;
  while (cursor < end && out.length < 4) {
    const next = schoolYearRangeOf(addCalendarDays(cursor, 1), ethiopian);
    out.push(next);
    cursor = next.to;
  }
  return out;
}

/**
 * The school days of a request that fall inside a window. A request wholly
 * inside keeps the count frozen on it; one over the window's edge is
 * counted again on the bell for the part inside.
 */
export function schoolDaysWithin(
  row: { startDate: string; endDate: string; schoolDays?: number | null },
  window: { from: string; to: string },
  weekdays: Set<number> | null | undefined,
): number {
  if (row.startDate >= window.from && row.endDate <= window.to) {
    return Number(row.schoolDays) || 0;
  }
  const start = row.startDate > window.from ? row.startDate : window.from;
  const end = row.endDate < window.to ? row.endDate : window.to;
  if (end < start) return 0;
  return schoolDaysBetween(start, end, weekdays);
}

export type LeaveAllowanceStanding = {
  year: SchoolYearRange;
  yearDays: number;
  allowanceDays: number;
  rate: number;
  approvedDays: number;
  pendingDays: number;
  leftDays: number;
};

/**
 * Where a person stands against a year's allowance: the school days of
 * their approved and their still-pending requests of the kinds that draw
 * on it, inside that year. `leftDays` is what a new request may still
 * take — pending ones are spoken for.
 */
export function leaveAllowanceStanding({
  rows,
  year,
  weekdays,
  excludeId,
}: {
  rows: ReadonlyArray<{
    id?: number | null;
    status: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    schoolDays?: number | null;
  }>;
  year: SchoolYearRange;
  weekdays: Set<number> | null | undefined;
  excludeId?: number | null;
}): LeaveAllowanceStanding {
  const yearDays = schoolDaysBetween(year.from, year.to, weekdays);
  const allowanceDays = leaveAllowanceDays(yearDays);
  let approvedDays = 0;
  let pendingDays = 0;
  for (const row of rows) {
    if (excludeId != null && Number(row.id) === Number(excludeId)) continue;
    const status = String(row.status).toUpperCase();
    if (!(LIVE_LEAVE_STATUSES as readonly string[]).includes(status)) continue;
    if (!countsAgainstAllowance(row.leaveType)) continue;
    const days = schoolDaysWithin(row, year, weekdays);
    if (status === 'APPROVED') approvedDays += days;
    else pendingDays += days;
  }
  return {
    year,
    yearDays,
    allowanceDays,
    rate: LEAVE_ALLOWANCE_RATE,
    approvedDays,
    pendingDays,
    leftDays: Math.max(0, allowanceDays - approvedDays - pendingDays),
  };
}
