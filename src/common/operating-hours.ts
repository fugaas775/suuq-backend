/**
 * Whether a shop is open, decided on the server.
 *
 * The shopper's phone is not the shop's clock: device time and timezone are
 * unreliable and often simply wrong, so "open now" is computed here against the
 * shop's own local time rather than shipped as raw hours for clients to guess at.
 *
 * Hours are stored on `vendor_stores.operatingHours` as a day-keyed map:
 *
 *   { "MON": { "open": "08:00", "close": "22:00" }, "SUN": { "closed": true } }
 *
 * All branches trade in East Africa Time, and the schema stores wall-clock
 * strings with no zone, so EAT is the reference. This is a fixed +03:00 offset
 * with no daylight saving, which is why a plain offset is safe here.
 */
const EAT_OFFSET_MINUTES = 3 * 60;

const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export interface BranchPresence {
  /**
   * `null` when the shop has published no hours — unknown, not closed. Callers
   * must not render "closed" for a shop that simply never filled this in.
   */
  isOpenNow: boolean | null;
  /** ISO instant the shop next opens, or null when unknown / already open. */
  nextOpenAt: string | null;
}

interface DayWindow {
  openMinutes: number;
  closeMinutes: number;
  /** Closing time lands after midnight, e.g. 18:00 → 02:00. */
  overnight: boolean;
}

/** Parses "HH:MM" into minutes past midnight, or null when unusable. */
function parseClock(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function readDay(
  hours: Record<string, unknown>,
  dayKey: string,
): DayWindow | null {
  const raw = hours[dayKey] ?? hours[dayKey.toLowerCase()];
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  if (entry.closed === true) return null;

  const openMinutes = parseClock(entry.open);
  const closeMinutes = parseClock(entry.close);
  if (openMinutes == null || closeMinutes == null) return null;

  return {
    openMinutes,
    closeMinutes,
    // Equal times mean a zero-length window, not 24h — treat as overnight only
    // when close is strictly earlier than open.
    overnight: closeMinutes < openMinutes,
  };
}

/** Wall-clock view of an instant in EAT. */
function toEat(now: Date): { dayIndex: number; minutesIntoDay: number } {
  const shifted = new Date(now.getTime() + EAT_OFFSET_MINUTES * 60_000);
  return {
    dayIndex: shifted.getUTCDay(),
    minutesIntoDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Turns an EAT wall-clock slot back into an absolute instant. */
function fromEat(now: Date, daysAhead: number, minutesIntoDay: number): Date {
  const shifted = new Date(now.getTime() + EAT_OFFSET_MINUTES * 60_000);
  shifted.setUTCDate(shifted.getUTCDate() + daysAhead);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(
    shifted.getTime() + minutesIntoDay * 60_000 - EAT_OFFSET_MINUTES * 60_000,
  );
}

export function resolveBranchPresence(
  operatingHours: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
): BranchPresence {
  if (
    !operatingHours ||
    typeof operatingHours !== 'object' ||
    Object.keys(operatingHours).length === 0
  ) {
    return { isOpenNow: null, nextOpenAt: null };
  }

  const { dayIndex, minutesIntoDay } = toEat(now);

  // Yesterday's window can still be running if it crosses midnight.
  const yesterday = readDay(operatingHours, DAY_KEYS[(dayIndex + 6) % 7]);
  if (yesterday?.overnight && minutesIntoDay < yesterday.closeMinutes) {
    return { isOpenNow: true, nextOpenAt: null };
  }

  const today = readDay(operatingHours, DAY_KEYS[dayIndex]);
  if (today) {
    const closesAt = today.overnight ? 24 * 60 : today.closeMinutes;
    if (minutesIntoDay >= today.openMinutes && minutesIntoDay < closesAt) {
      return { isOpenNow: true, nextOpenAt: null };
    }
    if (minutesIntoDay < today.openMinutes) {
      return {
        isOpenNow: false,
        nextOpenAt: fromEat(now, 0, today.openMinutes).toISOString(),
      };
    }
  }

  // Closed for today — find the next day that opens. A week of lookahead is
  // enough; a shop with no open day at all reports closed with no next opening.
  for (let offset = 1; offset <= 7; offset++) {
    const day = readDay(operatingHours, DAY_KEYS[(dayIndex + offset) % 7]);
    if (day) {
      return {
        isOpenNow: false,
        nextOpenAt: fromEat(now, offset, day.openMinutes).toISOString(),
      };
    }
  }

  return { isOpenNow: false, nextOpenAt: null };
}
