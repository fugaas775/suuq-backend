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
  if (
    (roles ?? []).some((r) => GLOBAL_ROLES.includes(String(r).toUpperCase()))
  )
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
