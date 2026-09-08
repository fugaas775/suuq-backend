import type { PosSuspendedCart } from './entities/pos-suspended-cart.entity';

/**
 * Who may take a pupil off a school's roll.
 *
 * A withdrawal is the one write that destroys the folio the roll remembers a
 * child by, so the school asked for it to be held by named accounts rather than
 * by role: the owner of the school, and any staff account the owner has
 * explicitly granted it — the WITHDRAW_STUDENT capability on that account's
 * assignment at that branch. A manager's role, a cashier's permissions and a
 * platform admin's global roles do not reach it on their own.
 *
 * The rule lives here, pure, because two callers must agree on it exactly:
 * the discard route enforces it, and pos-s reads the same capability off the
 * session to decide who is offered the button at all.
 */
export const WITHDRAW_STUDENT_CAPABILITY = 'WITHDRAW_STUDENT';

export const SCHOOL_WITHDRAWAL_REFUSED_MESSAGE =
  "Only the school's owner account, or a staff account the owner has granted WITHDRAW_STUDENT, can take a pupil off the roll.";

/** A SCHOOL folio that carries a pupil — an empty school basket is not one. */
export function isSchoolPupilFolio(
  cart: Pick<PosSuspendedCart, 'cartSnapshot'> | null | undefined,
): boolean {
  const snap = (cart?.cartSnapshot ?? {}) as Record<string, unknown>;
  if (
    String(snap.serviceFormat ?? '')
      .trim()
      .toUpperCase() !== 'SCHOOL'
  ) {
    return false;
  }
  return String(snap.hotelGuestName ?? '').trim().length > 0;
}

export function canWithdrawStudent({
  actorId,
  ownerId,
  assignment,
}: {
  actorId: number | null | undefined;
  ownerId: number | null | undefined;
  assignment?: {
    isActive?: boolean;
    capabilities?: string[] | null;
  } | null;
}): boolean {
  if (actorId == null) {
    return false;
  }
  if (ownerId != null && Number(ownerId) === Number(actorId)) {
    return true;
  }
  if (!assignment || assignment.isActive === false) {
    return false;
  }
  return (assignment.capabilities ?? [])
    .map((c) => String(c).trim().toUpperCase())
    .includes(WITHDRAW_STUDENT_CAPABILITY);
}
