/**
 * The name to stamp on what a member of staff records, when nobody on the
 * staff list is joined to their login.
 *
 * A login made on the staff desk carries an internal address —
 * `pos.m.<username>@sys.internal` — and an owner signs in with their own
 * e-mail. Either used to be stamped as the person's NAME: on the register
 * they took, on the leave they decided ("pos.m.guuleed.shukri@sys.internal"
 * in the Decision column), and as the sender of a message a family reads.
 * An address is not a name, and a sign-in identifier is not something to
 * hand a parent. Of an internal address the username is kept; of a real one,
 * the part before the @.
 */
const INTERNAL_LOGIN = /^pos\.[a-z]\.(.+)@sys\.internal$/i;

export function actorNameFromEmail(email: unknown): string {
  const raw = String(email ?? '').trim();
  if (!raw) return '';
  const internal = INTERNAL_LOGIN.exec(raw);
  if (internal) return internal[1];
  const at = raw.indexOf('@');
  return at > 0 ? raw.slice(0, at) : raw;
}
