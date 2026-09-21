/**
 * Which classes a person may manage — take the register, hand out books.
 *
 * Owner 2026-09-20: "Teachers should only manage assigned grade only." A
 * teacher's classes are the ones the school assigned them: the home room
 * the registry names them on and any
 * `SCHOOL_CLASS:<code>` capability the office wrote on their login. The
 * owner, a manager, and the office (whoever holds ENROL_STUDENT, the
 * permission that defines classes) are not scoped — the office covers for
 * an absent teacher. A teacher assigned nothing may manage nothing, and is
 * told so by name rather than shown the whole school.
 *
 * Pure: the resolver reads the rows, this decides. Mirrors school-marks.policy.
 */
export const SCHOOL_CLASS_CAPABILITY_PREFIX = 'SCHOOL_CLASS:';
const OFFICE_PERMISSION = 'ENROL_STUDENT';
const TEACHER_LANE = 'SCHOOL_TEACHER';
const UNSCOPED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'POS_MANAGER'];

const fold = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();

export type ClassScope = {
  scoped: boolean;
  /** Lowercased class codes; null when unscoped. */
  codes: Set<string> | null;
  /** The name to stamp on what this person records. */
  recordedBy: string;
};

export function isClassScoped({
  actorId,
  ownerId,
  roles,
  assignment,
}: {
  actorId: number | null | undefined;
  ownerId: number | null | undefined;
  roles?: string[] | null;
  assignment?: {
    role?: string | null;
    isActive?: boolean;
    permissions?: string[] | null;
    posExperienceProfileCode?: string | null;
  } | null;
}): boolean {
  if (actorId == null) return true;
  if (ownerId != null && Number(ownerId) === Number(actorId)) return false;
  // The Teacher lane is the office's own statement that this login is a
  // teacher — scoped whatever permissions were ticked beside it.
  if (
    assignment?.isActive !== false &&
    String(assignment?.posExperienceProfileCode ?? '')
      .trim()
      .toUpperCase() === TEACHER_LANE
  )
    return true;
  if (
    (roles ?? []).some((r) => UNSCOPED_ROLES.includes(String(r).toUpperCase()))
  )
    return false;
  if (!assignment || assignment.isActive === false) return true;
  if (String(assignment.role ?? '').toUpperCase() === 'MANAGER') return false;
  return !(assignment.permissions ?? [])
    .map((p) => String(p).trim().toUpperCase())
    .includes(OFFICE_PERMISSION);
}

/**
 * Home room ∪ SCHOOL_CLASS capabilities, lowercased. ASSIGNED means assigned
 * by the office — the timetable is a schedule, not an assignment: a
 * Mathematics teacher takes eight classes and the owner does not want
 * eight registers in their hands ("teacher should only see assigned class").
 * Marks stay held to the timetable's (class, subject) pairs on top of this.
 */
export function assignedClassCodes({
  homeroomCodes,
  capabilities,
}: {
  homeroomCodes?: Array<string | null | undefined> | null;
  capabilities?: string[] | null;
}): Set<string> {
  const out = new Set<string>();
  for (const code of homeroomCodes ?? []) if (fold(code)) out.add(fold(code));
  for (const cap of capabilities ?? []) {
    const c = String(cap ?? '').trim();
    if (c.toUpperCase().startsWith(SCHOOL_CLASS_CAPABILITY_PREFIX)) {
      const code = fold(c.slice(SCHOOL_CLASS_CAPABILITY_PREFIX.length));
      if (code) out.add(code);
    }
  }
  return out;
}

export function classInScope(
  scope: ClassScope | null | undefined,
  classCode: unknown,
): boolean {
  if (!scope || !scope.scoped || !scope.codes) return true;
  return scope.codes.has(fold(classCode));
}

/** One sentence, naming the class and the classes the person does have. */
export function classScopeRefusal(
  scope: ClassScope,
  classCode: unknown,
): string {
  const own = [...(scope.codes ?? [])];
  const cls = String(classCode ?? '').trim() || 'this class';
  return own.length
    ? `${cls} is not one of your classes (${own.join(', ')}). Ask the office to take its register.`
    : 'No class is assigned to you yet — the office assigns your home room and timetable in Branch Staff.';
}

/**
 * Pupils whose folio sits in a DIFFERENT class from the register being
 * written. A register is (class, day); a mark for a pupil who is not in that
 * class is a tap that crossed over from another sheet — a client that kept
 * one draft across a class switch did exactly that — and it is refused by
 * name, before any row is written. A folio not found at all passes: a child
 * withdrawn since the morning was on that register, and an older client may
 * carry ids the branch no longer lists. A folio with no class passes too.
 */
export function pupilsOutsideClass(
  carts: Array<{
    id: number | string;
    cartSnapshot?: Record<string, unknown> | null;
  }>,
  classCode: unknown,
): Array<{ id: string; name: string; classCode: string }> {
  const want = fold(classCode);
  if (!want) return [];
  const out: Array<{ id: string; name: string; classCode: string }> = [];
  for (const cart of carts ?? []) {
    const snap = cart?.cartSnapshot ?? {};
    const have = fold(snap.hotelRoomNumber);
    if (!have || have === want) continue;
    out.push({
      id: String(cart.id),
      name: String(snap.hotelGuestName ?? '').trim() || `folio ${cart.id}`,
      classCode: String(snap.hotelRoomNumber ?? '').trim(),
    });
  }
  return out;
}

/** One sentence naming the pupils and the class they are in. */
export function pupilClassRefusal(
  classCode: unknown,
  outside: Array<{ name: string; classCode: string }>,
): string {
  const cls = String(classCode ?? '').trim() || 'this class';
  const named = outside
    .slice(0, 3)
    .map((p) => `${p.name} (${p.classCode})`)
    .join(', ');
  const more = outside.length > 3 ? ` and ${outside.length - 3} more` : '';
  return `${named}${more} ${outside.length === 1 ? 'is' : 'are'} not in ${cls} — this register cannot carry them.`;
}
