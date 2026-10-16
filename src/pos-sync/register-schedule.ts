/**
 * A branch's register schedule: one opening and one closing time a day,
 * "HH:MM" on East Africa Time (UTC+3 all year — Ethiopia keeps no DST).
 * Pure functions so the rules can be tested without a clock or a database.
 */
export const EAT_OFFSET_MINUTES = 3 * 60;
const DAY = 24 * 60;

export function parseScheduleTime(value?: string | null): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Minutes since midnight EAT for `now`. */
export function eatMinuteOfDay(now: Date): number {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + EAT_OFFSET_MINUTES) % DAY;
}

/**
 * The latest moment ≤ now at which the branch's closing time struck, or null
 * when the branch has no closing time. A session opened before it and still
 * open is due to close.
 */
export function lastScheduledClose(
  closesAt: string | null | undefined,
  now: Date,
): Date | null {
  const close = parseScheduleTime(closesAt);
  if (close == null) return null;
  const sinceClose = (eatMinuteOfDay(now) - close + DAY) % DAY;
  const at = new Date(now.getTime() - sinceClose * 60_000);
  at.setUTCSeconds(0, 0);
  return at;
}

/**
 * Whether an operator may start a session now. Closed hours run from the
 * closing time (or midnight when there is none) up to the opening time; with
 * no opening time there are none. Equal times mean always open.
 */
export function isWithinOpeningHours(
  schedule: { opensAt?: string | null; closesAt?: string | null },
  now: Date,
): boolean {
  const open = parseScheduleTime(schedule.opensAt);
  if (open == null) return true;
  const closedFrom = parseScheduleTime(schedule.closesAt) ?? 0;
  if (closedFrom === open) return true;
  const minute = eatMinuteOfDay(now);
  const inClosedHours =
    closedFrom < open
      ? minute >= closedFrom && minute < open
      : minute >= closedFrom || minute < open;
  return !inClosedHours;
}
