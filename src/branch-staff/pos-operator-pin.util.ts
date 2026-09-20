import { createHmac } from 'crypto';

/**
 * Quick-unlock PIN helpers for the POS register lock screen.
 *
 * A PIN is deliberately *not* an identifier. The waiter taps their own tile on
 * the lock screen first, and the PIN is then checked against that one staff
 * member. That keeps the digits out of any reverse-lookup path and makes
 * "one waiter cannot sign in as another" structurally true rather than a
 * validation rule we have to remember to run.
 *
 * On top of that we still refuse to let two people in the same branch hold the
 * same digits, because in QSR the operator identity is what stamps
 * `waiterUserId` onto an order. A shared PIN would silently misroute another
 * waiter's order list and their service share, which is a money bug, not a
 * cosmetic one.
 */

/** Fixed length. Variable length would force an explicit submit button and
 * defeat the point of a quick unlock. */
export const OPERATOR_UNLOCK_PIN_LENGTH = 4;

/**
 * The lanes allowed to carry a quick-unlock PIN, by branch format.
 *
 * QSR: the waiter — one tablet on the floor, taken in turns. SCHOOL: the
 * teacher — one tablet in the staff room, and the person unlocking it is the
 * person whose name lands on every mark they take. The cashier and the office
 * at either kind of branch keep the password lock screen: their session
 * carries money, and a four-digit secret is the wrong lock for it.
 */
export const OPERATOR_UNLOCK_PIN_LANES: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  QSR: Object.freeze(['QSR_WAITER']),
  SCHOOL: Object.freeze(['SCHOOL_TEACHER']),
});
/** Kept for readers of the original single-format rule. */
export const OPERATOR_UNLOCK_PIN_SERVICE_FORMAT = 'QSR';
export const OPERATOR_UNLOCK_PIN_LANE_CODE = 'QSR_WAITER';

export const OPERATOR_UNLOCK_PIN_PEPPER_ENV = 'POS_PIN_PEPPER';

/** What the refusal says — one sentence, both cases. */
export const OPERATOR_UNLOCK_PIN_NOT_ELIGIBLE_MESSAGE =
  'A quick-unlock PIN is only available to waiters at a QSR branch and to teachers at a school.';

/**
 * True for a lane the table above names at its branch's format. Checked when
 * the PIN is set *and* again on every unlock, so a lane change or a branch
 * format change disables a stored PIN immediately without a data migration.
 */
export function isPinEligibleLane(
  serviceFormat: string | null | undefined,
  laneCode: string | null | undefined,
): boolean {
  const format = String(serviceFormat || '')
    .trim()
    .toUpperCase();
  const lane = String(laneCode || '')
    .trim()
    .toUpperCase();
  return (OPERATOR_UNLOCK_PIN_LANES[format] || []).includes(lane);
}

/** Digits only, exact length. Returns null when the input is not a valid PIN. */
export function normalizeUnlockPin(raw: unknown): string | null {
  const pin = String(raw ?? '').trim();
  if (!new RegExp(`^\\d{${OPERATOR_UNLOCK_PIN_LENGTH}}$`).test(pin)) {
    return null;
  }
  return pin;
}

/**
 * Rejects the handful of PINs an attacker would try first: repeated digits
 * (0000, 7777) and runs in either direction (1234, 4321). That is ~30 of the
 * 10,000 combinations, so it costs the waiter almost nothing and removes the
 * cheapest guesses.
 */
export function isWeakUnlockPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) {
    return true;
  }

  const digits = pin.split('').map((d) => Number(d));
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);

  return ascending || descending;
}

/**
 * Deterministic, peppered HMAC of the PIN. Used *only* to enforce branch-wide
 * uniqueness via a unique index — bcrypt is salted and therefore unsearchable,
 * so uniqueness needs its own column. Verification still goes through bcrypt.
 *
 * The pepper lives in the environment, never in the database, so a database
 * dump on its own does not let anyone enumerate 10,000 fingerprints.
 */
export function buildUnlockPinFingerprint(
  pepper: string,
  branchId: number,
  pin: string,
): string {
  return createHmac('sha256', pepper)
    .update(`${branchId}:${OPERATOR_UNLOCK_PIN_LANE_CODE}:${pin}`)
    .digest('hex');
}
