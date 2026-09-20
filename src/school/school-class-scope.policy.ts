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
  } | null;
}): boolean {
  if (actorId == null) return true;
  if (ownerId != null && Number(ownerId) === Number(actorId)) return false;
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
