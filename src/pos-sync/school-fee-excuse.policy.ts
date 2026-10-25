/**
 * Who may excuse a pupil from the teachers' "School fee not paid" list.
 *
 * pos-s stamps `cartSnapshot.schoolFeeExcuse = { before, reason, by, at }`
 * (pos-s register/schoolFeeExcuse.js) when a family has pledged to pay: the
 * teacher's red list leaves the child off for the months ended so far, and the
 * fee is still owed. The owner asked for it to be theirs alone (2026-10-25:
 * "These Excuse should only be for School Owners") — the branch's owner or the
 * tenant's owner (`isSchoolOwner`), no capability, no manager, no platform
 * admin.
 *
 * The excuse rides the ordinary PATCH of the pupil's snapshot, so the rule is
 * applied to that write rather than refused on it: from anyone but the owner,
 * the STORED excuse is kept whatever was sent. That is also what a till needs —
 * a fee payment laid from a copy read before the owner excused (or lifted) the
 * child must not undo the owner's decision. A write that leaves the key out
 * keeps the stored value too, from anyone.
 */
export const SCHOOL_FEE_EXCUSE_KEY = 'schoolFeeExcuse';

const own = (o: Record<string, unknown>, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);

/** The excuse as a comparable value: absent and null are both "none". */
function excuseOf(snap: Record<string, unknown>): string {
  const raw = snap[SCHOOL_FEE_EXCUSE_KEY];
  return raw && typeof raw === 'object' ? JSON.stringify(raw) : '';
}

/** Does `incoming` set or lift a different excuse from the stored one? */
export function feeExcuseChanged(
  stored: Record<string, unknown>,
  incoming: Record<string, unknown>,
): boolean {
  return (
    own(incoming, SCHOOL_FEE_EXCUSE_KEY) &&
    excuseOf(stored) !== excuseOf(incoming)
  );
}

/**
 * `incoming` with the stored excuse in place of whatever it carried — the
 * stored key, or no key when the record has none.
 */
export function keepStoredFeeExcuse(
  stored: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const rest = { ...incoming };
  delete rest[SCHOOL_FEE_EXCUSE_KEY];
  return own(stored, SCHOOL_FEE_EXCUSE_KEY)
    ? { ...rest, [SCHOOL_FEE_EXCUSE_KEY]: stored[SCHOOL_FEE_EXCUSE_KEY] }
    : rest;
}
