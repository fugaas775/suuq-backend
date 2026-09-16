import { isSchoolPupilFolio } from './school-withdrawal.policy';

/**
 * What a SCHOOL folio must look like before it may join the roll.
 *
 * A pupil is a suspended cart wearing hotel field names — `hotelGuestName` is
 * the child, `hotelRoomNumber` the class, `schoolAdmissionNo` the number the
 * school knows them by — and nothing server-side knew a child from a room.
 * Every client-side guard on enrolment (the double-submit ref, the roster
 * importer's dedupe, the "already on the roll" warning) has been bypassed at
 * least once in production: two schools carried an admission number three
 * times over, and one carried a folio with no name, no class and no lines.
 *
 * These are the three rules a students table would have enforced for free.
 * Pure, so the create path and the update path apply exactly the same ones,
 * and so they can be tested without a database.
 */

export function normalizeAdmissionNo(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function snapOf(
  cart: { cartSnapshot?: Record<string, unknown> | null } | null | undefined,
): Record<string, unknown> {
  return cart?.cartSnapshot ?? {};
}

function isSchoolSnapshot(snap: Record<string, unknown>): boolean {
  return (
    String(snap.serviceFormat ?? '')
      .trim()
      .toUpperCase() === 'SCHOOL'
  );
}

/**
 * A SCHOOL basket that is nothing at all: no pupil, no lines, and not an
 * application from the public form (those carry `consumerOrder`). There is
 * nothing in it worth a row, and one such row was found live on a school's
 * roll, created by a stray park. Refused rather than tolerated.
 */
export function isEmptySchoolBasket(
  cart: { cartSnapshot?: Record<string, unknown> | null } | null | undefined,
): boolean {
  const snap = snapOf(cart);
  if (!isSchoolSnapshot(snap)) return false;
  if (snap.consumerOrder === true) return false;
  if (String(snap.hotelGuestName ?? '').trim()) return false;
  const lines = Array.isArray(snap.cartLines) ? snap.cartLines : [];
  return lines.length === 0;
}

/**
 * The one shape rule a pupil folio carries: a child must be in a class. Every
 * SCHOOL reader keys on the class — the board, the register, the mark sheet,
 * the fee roll — so a pupil without one is on the roll and visible nowhere.
 *
 * Returns the refusal, or null when the folio is fine. An application from
 * the public form is not a pupil and is left alone.
 */
export function schoolPupilShapeProblem(
  cart: { cartSnapshot?: Record<string, unknown> | null } | null | undefined,
): string | null {
  const snap = snapOf(cart);
  if (!isSchoolPupilFolio({ cartSnapshot: snap })) return null;
  if (snap.consumerOrder === true) return null;
  if (!String(snap.hotelRoomNumber ?? '').trim()) {
    return `${String(snap.hotelGuestName).trim()} has no class. A pupil must be enrolled into a class.`;
  }
  return null;
}

/** The admission number a live-roll collision is checked on, or '' when none. */
export function schoolAdmissionNoOf(
  cart: { cartSnapshot?: Record<string, unknown> | null } | null | undefined,
): string {
  const snap = snapOf(cart);
  if (!isSchoolPupilFolio({ cartSnapshot: snap })) return '';
  if (snap.consumerOrder === true) return '';
  return normalizeAdmissionNo(snap.schoolAdmissionNo);
}
