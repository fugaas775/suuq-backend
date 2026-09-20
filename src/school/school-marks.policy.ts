/**
 * Who may enter marks — by name, like the money and like withdrawal.
 *
 * The schools made rewriting a pupil's record owner-only in August. This is
 * the owner naming the teacher who may enter the marks for what they teach:
 * the branch's owner account, or a staff account the owner has granted
 * ENTER_MARKS. A MANAGER is not on the list by rank, which is the same rule
 * `canWithdrawStudent` and VIEW_SCHOOL_FINANCE follow.
 *
 * The scope is the second half: an OPERATOR holding the grant may write only
 * the subjects their own timetable puts them in front of, in the classes it
 * puts them in. The owner and a granted manager are not scoped — they may
 * correct anything, which is what an owner does at the end of a term.
 */
export const ENTER_MARKS_CAPABILITY = 'ENTER_MARKS';

export const SCHOOL_MARKS_REFUSED_MESSAGE =
  "Only the school's owner account, or a staff account the owner has granted ENTER_MARKS, can enter marks.";

const fold = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();

export function canEnterMarks({
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
  if (actorId == null) return false;
  if (ownerId != null && Number(ownerId) === Number(actorId)) return true;
  if (!assignment || assignment.isActive === false) return false;
  return (assignment.capabilities ?? [])
    .map((c) => String(c).trim().toUpperCase())
    .includes(ENTER_MARKS_CAPABILITY);
}

/**
 * Whether the scope applies: an operator is held to their timetable; the
 * owner and a manager are not.
 */
export function isScopedToTimetable({
  actorId,
  ownerId,
  assignment,
}: {
  actorId: number | null | undefined;
  ownerId: number | null | undefined;
  assignment?: { role?: string | null } | null;
}): boolean {
  if (ownerId != null && Number(ownerId) === Number(actorId)) return false;
  return String(assignment?.role ?? '').toUpperCase() !== 'MANAGER';
}

/** The (class, subject) pairs a timetable puts a teacher in front of. */
export function taughtPairs(
  slots:
    | Array<{ classCode?: string | null; subject?: string | null }>
    | null
    | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const slot of slots ?? []) {
    const cls = fold(slot?.classCode);
    const subject = fold(slot?.subject);
    if (cls && subject) out.add(`${cls}|${subject}`);
  }
  return out;
}

export function teachesSubjectIn(
  pairs: Set<string>,
  classCode: unknown,
  subject: unknown,
): boolean {
  return pairs.has(`${fold(classCode)}|${fold(subject)}`);
}
