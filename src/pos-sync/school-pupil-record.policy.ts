import { isSchoolOwner } from '../school/school-branch-owner.util';
/**
 * A pupil's own record is the office's — not the fee desk's.
 *
 * Owner 2026-10-18: "do not allow cashiers to edit the whole student list,
 * except login only." The till locks a pupil's details for a cashier, but a
 * folio is ONE document: the fee a cashier charges and the name on the folio
 * travel in the same PATCH, so the route alone cannot tell a fee from an
 * edit. This compares what was stored with what was sent and names the
 * pupil fields that changed; only the office (ENROL_STUDENT), a manager, the
 * branch owner or a platform admin may change them.
 *
 * What stays the fee desk's, and is NOT compared: the lines, the totals, the
 * paid / partial markers, the paid-through date (`hotelCheckOutAt` — billing a
 * month moves it), the waiver line's AMOUNT (it is a fraction of the bill and
 * moves with every charge) and everything else on the snapshot.
 *
 * Refused: a CHANGE to a value on file, and a scholarship granted or revoked.
 * Kept, silently: a blank field filled in, or a field left out — see
 * `pupilRecordDelta` for why a fee save must never be the thing refused.
 */

export const PUPIL_RECORD_FIELDS = [
  'hotelGuestName',
  'hotelRoomNumber',
  'schoolAdmissionNo',
  'schoolGuardianName',
  'hotelGuestPhone',
  'hotelCheckInAt',
  'hotelGuestNotes',
  'schoolBillingCycle',
  'schoolScholarshipRate',
  'schoolScholarshipAmount',
  'schoolScholarshipReason',
  'schoolStatus',
] as const;

const NUMERIC = new Set(['schoolScholarshipRate', 'schoolScholarshipAmount']);
const DATE_ONLY = new Set(['hotelCheckInAt']);
const FOLDED = new Set(['schoolBillingCycle', 'schoolStatus']);

type Snapshot = Record<string, unknown>;

/** One value as the comparison sees it: blank, null and absent are all ''. */
function norm(field: string, value: unknown): string {
  if (value == null) return '';
  if (NUMERIC.has(field)) {
    const n = Number(value);
    return Number.isFinite(n) && n !== 0
      ? String(Math.round(n * 10000) / 10000)
      : '';
  }
  if (typeof value === 'object') return JSON.stringify(value);
  let text = String(value).trim().replace(/\s+/g, ' ');
  if (DATE_ONLY.has(field)) text = text.slice(0, 10);
  if (FOLDED.has(field)) text = text.toUpperCase();
  return text;
}

const lines = (snap: Snapshot): Array<Record<string, any>> =>
  Array.isArray(snap?.cartLines)
    ? (snap.cartLines as Array<Record<string, any>>)
    : [];

/**
 * Whether the pupil holds a scholarship at all — a rate, an amount, or a
 * waiver line. Granting or revoking one is the office's. Deliberately not the
 * waiver line's own fields: its total moves with every charge, the till
 * rebuilds it (an older line gains metadata it never had), and a pupil whose
 * rate is on file gets their first waiver line with their first charge — all
 * fee work. The rate and amount are compared through the snapshot's own
 * scholarship fields above.
 */
function waiverTerms(snap: Snapshot): string {
  const granted =
    norm('schoolScholarshipRate', snap?.schoolScholarshipRate) !== '' ||
    norm('schoolScholarshipAmount', snap?.schoolScholarshipAmount) !== '' ||
    lines(snap).some((l) => l?.metadata?.schoolScholarship);
  return granted ? 'granted' : '';
}

/**
 * What this PATCH does to the pupil's own record, in three kinds:
 *
 *   - `changed`: a value already on file replaced by a different one (a
 *     rename, a class change, a new phone), or a scholarship granted or
 *     revoked. Refused to anyone who may not edit.
 *   - `filled`: a field that was blank on file, sent with a value.
 *   - `dropped`: a field on file that the caller left out of the snapshot.
 *
 * `filled` and `dropped` are NOT refused for someone who may not edit — the
 * stored value is kept instead (`keepStoredPupilRecord`). Both are what an
 * older or careless till does on a plain fee save, and a refusal there lands
 * AFTER the money is banked: the receipt prints and the folio still reads
 * the fee as owed. Only a change nobody makes by accident is refused.
 *
 * All three empty ⇒ nothing about the pupil moved, and the caller's rights
 * need not even be looked up.
 */
export function pupilRecordDelta(
  stored: Snapshot,
  incoming: Snapshot,
): { changed: string[]; filled: string[]; dropped: string[] } {
  const changed: string[] = [];
  const filled: string[] = [];
  const dropped: string[] = [];
  for (const field of PUPIL_RECORD_FIELDS) {
    const before = norm(field, stored?.[field]);
    if (!Object.prototype.hasOwnProperty.call(incoming ?? {}, field)) {
      if (before !== '') dropped.push(field);
      continue;
    }
    const after = norm(field, incoming[field]);
    if (before === after) continue;
    if (before === '') filled.push(field);
    else changed.push(field);
  }
  if (waiverTerms(stored) !== waiverTerms(incoming))
    changed.push('scholarship');
  return { changed, filled, dropped };
}

/** The incoming snapshot with the stored value of every `filled` or `dropped` field put back. */
export function keepStoredPupilRecord(
  stored: Snapshot,
  incoming: Snapshot,
  fields: string[],
): Snapshot {
  const out: Snapshot = { ...incoming };
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(stored ?? {}, field))
      out[field] = stored[field];
    else delete out[field];
  }
  return out;
}

// Not POS_MANAGER — every vendor holds it; the owner is found by ownership.
const PUPIL_EDITORS_GLOBAL = ['SUPER_ADMIN', 'ADMIN'];

/**
 * May this actor change a pupil's own record? The branch owner, a platform
 * admin, a MANAGER on the branch, or the office (ENROL_STUDENT) — read off
 * the staff ROSTER, not the token, so a cashier moved off ENROL_STUDENT is
 * refused at once rather than when their PIN token next expires.
 */
export function canEditPupilRecord({
  actorId,
  ownerId,
  tenantOwnerId = null,
  roles,
  assignment,
}: {
  actorId: number | null | undefined;
  ownerId: number | null | undefined;
  tenantOwnerId?: number | null;
  roles?: string[] | null;
  assignment?: {
    isActive?: boolean;
    role?: string | null;
    permissions?: string[] | null;
  } | null;
}): boolean {
  const global = (roles ?? []).map((r) => String(r).trim().toUpperCase());
  if (global.some((r) => PUPIL_EDITORS_GLOBAL.includes(r))) return true;
  if (actorId == null) return false;
  if (isSchoolOwner(actorId, ownerId, tenantOwnerId)) return true;
  if (!assignment || assignment.isActive === false) return false;
  if (String(assignment.role ?? '').toUpperCase() === 'MANAGER') return true;
  return (assignment.permissions ?? [])
    .map((p) => String(p).trim().toUpperCase())
    .includes('ENROL_STUDENT');
}

const FIELD_WORDS: Record<string, string> = {
  hotelGuestName: 'name',
  hotelRoomNumber: 'class',
  schoolAdmissionNo: 'admission number',
  schoolGuardianName: 'guardian',
  hotelGuestPhone: 'phone',
  hotelCheckInAt: 'enrolment date',
  hotelGuestNotes: 'notes',
  schoolBillingCycle: 'fee cadence',
  schoolScholarshipRate: 'scholarship',
  schoolScholarshipAmount: 'scholarship',
  schoolScholarshipReason: 'scholarship',
  schoolStatus: 'status',
  scholarship: 'scholarship',
};

export const PUPIL_RECORD_REFUSED_CODE = 'SCHOOL_PUPIL_RECORD_OFFICE_ONLY';

/** The refusal, naming what was changed in the school's words. */
export function pupilRecordRefusal(fields: string[]): string {
  const words = [...new Set(fields.map((f) => FIELD_WORDS[f] || f))];
  return `Only the school office can change a student's details (${words.join(', ')}). Fees can still be charged and taken, and the parent's phone can be set from the logins desk.`;
}

/**
 * The guardian's phone is the one pupil field the LOGIN desk may write.
 *
 * Owner 2026-10-18, after the cashier was held to logins: "Cashier must also
 * be allowed to add or update parent phone and/or to group parent students to
 * their respective parent." A family's login, the roll's "families without a
 * login" and the absence message all key on the phone on the pupil's record,
 * so whoever hands out parents' logins (MANAGE_SCHOOL_LOGINS) must be able to
 * put it there. Every other pupil field stays the office's.
 */
export const GUARDIAN_PHONE_FIELD = 'hotelGuestPhone';

export type PupilEditScope = 'ALL' | 'GUARDIAN_PHONE' | 'NONE';

/** How much of a pupil's own record this actor may change. */
export function pupilEditScope(
  args: Parameters<typeof canEditPupilRecord>[0],
): PupilEditScope {
  if (canEditPupilRecord(args)) return 'ALL';
  const a = args.assignment;
  if (!a || a.isActive === false) return 'NONE';
  return (a.permissions ?? [])
    .map((p) => String(p).trim().toUpperCase())
    .includes('MANAGE_SCHOOL_LOGINS')
    ? 'GUARDIAN_PHONE'
    : 'NONE';
}

/**
 * The delta with what this scope MAY do taken out: for GUARDIAN_PHONE, a
 * changed or newly filled phone is theirs to write (a phone left out is still
 * kept — clearing one is not "add or update"). ALL owes nothing; NONE keeps
 * the delta whole.
 */
export function deltaBeyondScope(
  delta: { changed: string[]; filled: string[]; dropped: string[] },
  scope: PupilEditScope,
): { changed: string[]; filled: string[]; dropped: string[] } {
  if (scope === 'ALL') return { changed: [], filled: [], dropped: [] };
  if (scope === 'NONE') return delta;
  const notPhone = (f: string) => f !== GUARDIAN_PHONE_FIELD;
  return {
    changed: delta.changed.filter(notPhone),
    filled: delta.filled.filter(notPhone),
    dropped: delta.dropped,
  };
}

/**
 * May this actor put a NEW pupil on the roll? Whoever may edit a pupil's
 * record, and the roster importer (IMPORT_STUDENT_ROSTER) — an import IS a
 * batch of enrolments. Never the fee desk: the cashier hands out logins and
 * takes fees, and the till gives them no way to enrol (owner 2026-10-18).
 */
export function canCreatePupilRecord(
  args: Parameters<typeof canEditPupilRecord>[0],
): boolean {
  if (canEditPupilRecord(args)) return true;
  const a = args.assignment;
  if (!a || a.isActive === false) return false;
  return (a.permissions ?? [])
    .map((p) => String(p).trim().toUpperCase())
    .includes('IMPORT_STUDENT_ROSTER');
}

export const PUPIL_CREATE_REFUSED_MESSAGE =
  'Only the school office can enrol a student. Fees can still be charged and taken on the students already enrolled.';
