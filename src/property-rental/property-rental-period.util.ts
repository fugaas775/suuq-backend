/**
 * Month-based lease period math for the Property Rental format.
 *
 * Mirrors the frontend helpers in pos-s
 * (src/features/register/registerHospitalityHelpers.js) so the backend computes
 * billing periods identically to the POS UI. Property Rental is MONTH-based
 * (with an optional WEEK cadence for short stays), unlike the HOTEL format which
 * counts nights.
 */

export type BillingUnit = 'MONTH' | 'WEEK';

/** Parse a YYYY-MM-DD (or ISO) date string into a UTC Date at midnight, or null. */
function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  // Accept full ISO timestamps too — take the date portion only.
  const datePart = text.length >= 10 ? text.slice(0, 10) : text;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) {
    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

const MS_PER_DAY = 86_400_000;

/**
 * Count whole billing periods between two dates for the given cadence.
 *
 * - WEEK: floor of day-span / 7.
 * - MONTH: full calendar months elapsed; a partial month rounds DOWN unless the
 *   end day reaches the start day (e.g. Jan 15 → Feb 15 = 1 month, Jan 15 →
 *   Feb 14 = 0 months). Handles month-end (Jan 31 → Feb 28 counts as 1 month).
 *
 * Always returns at least 1 when the end is on or after the start (an occupied
 * lease bills for at least one period), and 0 when dates are missing/invalid or
 * the end precedes the start.
 */
export function computeBillingPeriods(
  startStr?: string | null,
  endStr?: string | null,
  unit: BillingUnit = 'MONTH',
): number {
  const start = parseDateOnly(startStr);
  const end = parseDateOnly(endStr);
  if (!start || !end) return 0;
  if (end.getTime() < start.getTime()) return 0;

  if (unit === 'WEEK') {
    const days = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
    return Math.max(1, Math.floor(days / 7));
  }

  // MONTH
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());

  // If the end day-of-month hasn't reached the start day-of-month, the final
  // month is not yet complete — except when the end is clamped to month-end
  // (e.g. start Jan 31, end Feb 28: Feb has no 31st, so it counts as complete).
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  if (endDay < startDay) {
    const lastDayOfEndMonth = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
    ).getUTCDate();
    if (endDay !== lastDayOfEndMonth) {
      months -= 1;
    }
  }

  return Math.max(1, months);
}

/**
 * Add a number of billing periods to a date, returning a YYYY-MM-DD string.
 * Month addition clamps to month-end (Jan 31 + 1 month → Feb 28/29).
 */
export function addBillingPeriods(
  startStr: string | null | undefined,
  count: number,
  unit: BillingUnit = 'MONTH',
): string | null {
  const start = parseDateOnly(startStr);
  if (!start) return null;
  const n = Math.max(0, Math.round(Number(count) || 0));

  if (unit === 'WEEK') {
    const d = new Date(start.getTime() + n * 7 * MS_PER_DAY);
    return d.toISOString().slice(0, 10);
  }

  const targetMonthIndex = start.getUTCMonth() + n;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  const day = Math.min(start.getUTCDate(), lastDay);
  const d = new Date(Date.UTC(targetYear, normalizedMonth, day));
  return d.toISOString().slice(0, 10);
}
