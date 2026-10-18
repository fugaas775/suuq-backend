/**
 * Pure helpers for parents' logins — no I/O, all spec'd.
 */

const text = (v: unknown) => String(v ?? '').trim();

/**
 * Digits only, an Ethiopian mobile folded to its local 09…/07… form — however
 * it was written: +251 9…, 00251 9…, +251 0 9…, or the bare nine digits
 * 9…. Folding only "+251" split one family into two: a sibling recorded as
 * 911234567 and another as 0911234567 were two families, two logins.
 * Mirrored in the till's SchoolGuardianDesk (phoneKey).
 */
export function normalizePhoneKey(value: unknown): string {
  let digits = text(value).replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('251')) {
    const local = digits.slice(3).replace(/^0/, '');
    if (local.length === 9) return `0${local}`;
  }
  if (digits.length === 9 && /^[79]/.test(digits)) return `0${digits}`;
  return digits;
}

/** A guardian's name as a username: `abdi.ali`, like the staff suggestion. */
export function usernameFromName(fullName: unknown): string {
  const parts = text(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  const chosen =
    parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : parts;
  return chosen.join('.').replace(/[^a-z0-9._-]/g, '');
}

/**
 * A family's username IS its phone (owner 2026-10-18: "Phone number and
 * username of the parents should be one and same"): digits, +251 folded to
 * 09…, at least nine of them. '' when the phone is not one — the caller
 * refuses rather than inventing a name-based or `.2` variant, because one
 * phone is one family and a second login for it splits the children.
 */
export function guardianUsernameFromPhone(phone: unknown): string {
  const digits = normalizePhoneKey(phone);
  return digits.length >= 9 ? digits : '';
}

/** The username offered for a family — its phone, and only its phone. */
export function suggestGuardianUsername({
  phone,
}: {
  phone?: unknown;
  guardianName?: unknown;
}): string {
  return guardianUsernameFromPhone(phone);
}

/** `base`, then `base.2`, `base.3`… — the first one `taken` does not hold. */
export function dedupeUsername(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}.${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}.${Date.now()}`;
}

/** Reads a pupil folio row the way every SCHOOL reader on the FE does. */
export function pupilOf(row: {
  id: number;
  status?: string | null;
  cartSnapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const snap = row?.cartSnapshot ?? {};
  const status = text(row?.status).toUpperCase();
  const pupilStatus = text(snap.schoolStatus).toUpperCase();
  return {
    folioId: Number(row.id),
    name: text(snap.hotelGuestName),
    classCode: text(snap.hotelRoomNumber),
    admissionNo: text(snap.schoolAdmissionNo),
    guardianName: text(snap.schoolGuardianName),
    guardianPhone: text(snap.hotelGuestPhone),
    enrolledAt: text(snap.hotelCheckInAt).slice(0, 10) || null,
    status:
      status === 'DISCARDED'
        ? 'WITHDRAWN'
        : pupilStatus === 'INACTIVE'
          ? 'INACTIVE'
          : 'ACTIVE',
    leftOn:
      pupilStatus === 'INACTIVE' ? text(snap.schoolStatusOn) || null : null,
  };
}

/**
 * Mirrors the FE's `studentFolioMoney` (registerSchoolHelpers.js): `||`
 * rather than `??` on purpose, and a `paid: true` folio has paid its total.
 */
export function folioMoney(row: {
  total?: unknown;
  cartSnapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const snap = row?.cartSnapshot ?? {};
  const meta = row?.metadata ?? {};
  const total = Number(row?.total || snap.total || 0) || 0;
  const paidTotal =
    snap.paid === true
      ? total
      : Number(meta.partialPaidAmount || snap.partialPaidAmount || 0) || 0;
  return {
    total,
    paidTotal,
    outstanding: Math.max(0, total - paidTotal),
    credit: Math.round(Math.max(0, paidTotal - total) * 100) / 100,
  };
}

/** Is this SUSPENDED-cart row a SCHOOL pupil (and not a family's application)? */
export function isPupilRecord(row: {
  cartSnapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  const snap = row?.cartSnapshot ?? {};
  const meta = row?.metadata ?? {};
  if (text(snap.serviceFormat).toUpperCase() !== 'SCHOOL') return false;
  if (!text(snap.hotelGuestName)) return false;
  if (snap.paid === 'voided') return false;
  const fromStorefront =
    meta.consumerSource === 'SUUQS' || snap.consumerOrder === true;
  if (fromStorefront && text(meta.orderMode).toUpperCase() === 'QUOTE') {
    return false;
  }
  return true;
}

const SNAPSHOT_DENYLIST = new Set([
  // Who at the office did what: not the family's business.
  'schoolStatusBy',
  'schoolStatusHistory',
  // The till's actor stamps — the cashier who settled, opened, merged, voided.
  'settledBy',
  'paidBy',
  'openedBy',
  'mergedBy',
  'voidedBy',
  'createdBy',
]);

/** A key that names WHO did something at the till: `xxxByName`, `xxxByUserId`. */
const ACTOR_STAMP = /By(Name|UserId)$/;

function isActorStamp(key: string): boolean {
  return SNAPSHOT_DENYLIST.has(key) || ACTOR_STAMP.test(key);
}

/**
 * Actor stamps that sit INSIDE the snapshot's lists and objects — the cashier
 * on a fee refund (`schoolFeeRefunds[].refundedBy`), `by` on a leaving bill
 * or a class move, any `…ByName` / `…ByUserId` on a line. The top-level sweep
 * above never reached them. Deliberately narrow: `recordedBy` on a report is
 * the teacher's name the report card prints, and stays.
 */
const NESTED_ACTOR_KEYS = new Set(['by', 'refundedBy']);

function scrubNestedActors(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value))
    return value.map((entry) => scrubNestedActors(entry, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (NESTED_ACTOR_KEYS.has(key) || ACTOR_STAMP.test(key)) continue;
    out[key] = scrubNestedActors(inner, depth + 1);
  }
  return out;
}

/**
 * A register row as a family reads it — the day, the mark, the note — and
 * not which member of staff took it (their user id and name).
 */
export function withoutRecorder<T extends Record<string, unknown>>(
  row: T,
): Omit<T, 'recordedByUserId' | 'recordedByName'> {
  const { recordedByUserId: _id, recordedByName: _name, ...rest } = row;
  void _id;
  void _name;
  return rest;
}

/**
 * Does a notice reach a family whose children sit in `classCodes`?
 * ALL reaches everyone; CLASSES reaches a family with a child in any named
 * class (codes folded, as every class reader folds them).
 */
export function noticeReaches(
  notice: { audience?: string | null; classCodes?: string[] | null },
  classCodes: Iterable<string>,
): boolean {
  if (String(notice?.audience ?? 'ALL').toUpperCase() !== 'CLASSES')
    return true;
  const wanted = new Set(
    [...classCodes].map((c) => text(c).toLowerCase()).filter(Boolean),
  );
  return (notice.classCodes ?? []).some((c) =>
    wanted.has(text(c).toLowerCase()),
  );
}

/** Is a notice live today? Active, and not past its last day. */
export function noticeIsLive(
  notice: { isActive?: boolean; expiresAt?: string | null },
  today: string,
): boolean {
  if (notice.isActive === false) return false;
  const until = text(notice.expiresAt).slice(0, 10);
  return !until || until >= today;
}

/**
 * The pupil's record as the family may read it: the folio the FE money and
 * statement helpers already understand (so the parent's figures are the
 * office's figures), minus the office's own bookkeeping of who did what.
 */
export function guardianFolioView(row: {
  id: number;
  branchId: number;
  label?: string | null;
  status?: string | null;
  currency?: string | null;
  itemCount?: number | null;
  total?: unknown;
  cartSnapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}) {
  const snap = row?.cartSnapshot ?? {};
  const meta = row?.metadata ?? {};
  const cartSnapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snap)) {
    if (isActorStamp(key)) continue;
    // Every list and object under it too: leaving bills, class moves, fee
    // refunds, lines.
    cartSnapshot[key] = scrubNestedActors(value);
  }
  return {
    id: Number(row.id),
    branchId: Number(row.branchId),
    label: row.label ?? null,
    status: row.status ?? null,
    currency: row.currency ?? null,
    itemCount: row.itemCount ?? null,
    total: row.total ?? null,
    metadata: {
      partialPaidAmount: meta.partialPaidAmount ?? null,
      paidReceiptNumber: meta.paidReceiptNumber ?? null,
    },
    cartSnapshot,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

/** A receipt as the family may read it — no cashier ids, no register internals. */
export function guardianReceiptView(co: Record<string, any>) {
  const meta = (co?.metadata ?? {}) as Record<string, any>;
  const returnContext = (meta.returnContext ?? {}) as Record<string, any>;
  return {
    id: Number(co.id),
    receiptNumber: co.receiptNumber ?? null,
    transactionType: co.transactionType ?? null,
    status: co.status ?? null,
    currency: co.currency ?? null,
    total: co.total ?? 0,
    paidAmount: co.paidAmount ?? 0,
    changeDue: co.changeDue ?? 0,
    occurredAt: co.occurredAt ?? null,
    processedAt: co.processedAt ?? null,
    createdAt: co.createdAt ?? null,
    suspendedCartId: co.suspendedCartId ?? null,
    sourceReceiptNumber: returnContext.sourceReceiptNumber ?? null,
    refundMethod: returnContext.refundMethod ?? null,
    voidedAt: co.voidedAt ?? null,
    tenders: (Array.isArray(co.tenders) ? co.tenders : []).map(
      (t: Record<string, any>) => ({
        method: t?.method ?? null,
        amount: t?.amount ?? 0,
      }),
    ),
    items: (Array.isArray(co.items) ? co.items : []).map(
      (it: Record<string, any>) => ({
        title: it?.title ?? null,
        sku: it?.sku ?? null,
        quantity: it?.quantity ?? 0,
        unitPrice: it?.unitPrice ?? 0,
        lineTotal: it?.lineTotal ?? 0,
        metadata: it?.metadata?.schoolClass
          ? { schoolClass: it.metadata.schoolClass }
          : null,
      }),
    ),
    metadata: {
      folioId: meta.folioId ?? null,
      backendFolioId: meta.backendFolioId ?? null,
      roomNumber: meta.roomNumber ?? null,
      guestName: meta.guestName ?? null,
      returnContext: returnContext.sourceReceiptNumber
        ? { sourceReceiptNumber: returnContext.sourceReceiptNumber }
        : null,
    },
  };
}

/* ── class position, computed the way the office's result sheet computes it ── */

type ReportSubject = { subject: string; total: number | null; outOf: number };
type Report = { term: string; position: string; subjects: ReportSubject[] };

const parseScore = (v: unknown): number | null => {
  const raw = text(v).replace(',', '.');
  if (!raw || raw === '-' || raw === '—' || raw === '/') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** The marks on a pupil's record, normalised as the FE's `readAcademicRecord` reads them. */
export function readReports(row: {
  cartSnapshot?: Record<string, unknown> | null;
}): Report[] {
  const raw = (row?.cartSnapshot as Record<string, any> | undefined)
    ?.schoolAcademicRecord;
  const reports = Array.isArray(raw?.reports) ? raw.reports : [];
  const out: Report[] = [];
  for (const report of reports) {
    const term = text(report?.term);
    if (!term) continue;
    const subjects: ReportSubject[] = [];
    for (const s of Array.isArray(report?.subjects) ? report.subjects : []) {
      const name = text(s?.subject);
      if (!name) continue;
      const outOf = parseScore(s?.outOf);
      subjects.push({
        subject: name,
        total: parseScore(s?.total),
        outOf: outOf && outOf > 0 ? outOf : 100,
      });
    }
    out.push({ term, position: text(report?.position), subjects });
  }
  out.sort((a, b) => b.term.localeCompare(a.term));
  return out;
}

const roundPercent = (n: number) => Math.round(n * 10) / 10;
const foldSubject = (name: string) =>
  text(name).replace(/\s+/g, ' ').toLowerCase();

/** One term's average as the report card prints it, or null with nothing marked. */
export function reportPercent(report: Report): number | null {
  const marked = report.subjects.filter((s) => s.total !== null);
  if (!marked.length) return null;
  const sum = marked.reduce(
    (acc, s) => acc + (s.total / (s.outOf || 100)) * 100,
    0,
  );
  return roundPercent(sum / marked.length);
}

export type ClassRank = {
  position: number;
  of: number;
  percent: number;
  complete: boolean;
  subjectsMarked: number;
  subjectsInClass: number;
};

/**
 * Where each pupil stands in the class for one term — a port of the FE's
 * `rankClassByTerm` (schoolAcademicRecord.js), which the office's result
 * sheet and report cards use, so the family reads the same place the office
 * prints. Ties share a place (1, 2, 2, 4); only a COMPLETE set of marks —
 * every subject any classmate is marked in — competes for first place, and
 * incomplete pupils rank after all complete ones. Not stored: it is wrong the
 * moment the next pupil's marks arrive.
 */
export function rankClassByTerm(
  rows: Array<{ id: number; cartSnapshot?: Record<string, unknown> | null }>,
  term: string,
): Map<number, ClassRank> {
  const want = text(term);
  const scored: Array<{ id: number; percent: number; marked: Set<string> }> =
    [];
  const classSubjects = new Set<string>();
  for (const row of rows) {
    const report = readReports(row).find((r) => r.term === want);
    if (!report) continue;
    const percent = reportPercent(report);
    if (percent === null) continue;
    const marked = new Set(
      report.subjects
        .filter((s) => s.total !== null)
        .map((s) => foldSubject(s.subject)),
    );
    marked.forEach((n) => classSubjects.add(n));
    scored.push({ id: Number(row.id), percent, marked });
  }
  const inClass = classSubjects.size;
  const complete = scored
    .filter((e) => e.marked.size >= inClass)
    .sort((a, b) => b.percent - a.percent);
  const incomplete = scored
    .filter((e) => e.marked.size < inClass)
    .sort((a, b) => b.percent - a.percent);
  const ranks = new Map<number, ClassRank>();
  const place = (group: typeof scored, offset: number, isComplete: boolean) => {
    let position = 0;
    let previous: number | null = null;
    group.forEach((entry, index) => {
      if (previous === null || entry.percent !== previous)
        position = offset + index + 1;
      previous = entry.percent;
      ranks.set(entry.id, {
        position,
        of: scored.length,
        percent: entry.percent,
        complete: isComplete,
        subjectsMarked: entry.marked.size,
        subjectsInClass: inClass,
      });
    });
  };
  place(complete, 0, true);
  place(incomplete, complete.length, false);
  return ranks;
}

/** Today as YYYY-MM-DD in a time zone (the school's), falling back to UTC. */
export function localDayIn(
  timeZone: string | null | undefined,
  now = new Date(),
): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: text(timeZone) || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The zone a school's clock runs on: its own, else Ethiopia's for an Ethiopian school, else UTC. */
export function schoolTimeZone(branch: {
  timezone?: string | null;
  country?: string | null;
}): string {
  if (text(branch?.timezone)) return text(branch.timezone);
  const country = text(branch?.country).toUpperCase();
  if (country === 'ET' || country === 'ETHIOPIA') return 'Africa/Addis_Ababa';
  return 'UTC';
}

/* ── pupils' own logins ──────────────────────────────────────────────────── */

/**
 * The username the office is offered for a pupil: the admission number
 * (`SMAG-0127` → `smag-0127` — what is printed on every card the school
 * already hands them), otherwise their name. May still collide; the caller
 * de-duplicates.
 */
/**
 * A username that reads as a phone: nine or more digits and nothing else. A family's username IS its phone, so these are the families' — a
 * pupil's login holding 0915333513 left that family unable to get one (the
 * phone "already has a login", which no family login was).
 */
export function isPhoneShaped(username: unknown): boolean {
  const u = text(username);
  return /^\+?\d+$/.test(u) && guardianUsernameFromPhone(u) !== '';
}

export function suggestStudentUsername({
  admissionNo,
  name,
}: {
  admissionNo?: unknown;
  name?: unknown;
}): string {
  const fromNo = text(admissionNo)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .replace(/[._-]{2,}/g, '-');
  if (fromNo.length >= 3 && /^[a-z0-9]/.test(fromNo) && !isPhoneShaped(fromNo))
    return fromNo;
  const byName = usernameFromName(name);
  return byName.length >= 3 ? byName : '';
}

// No 0/O, 1/l/I: a pupil types this off a printed card. The same alphabet
// the office desk draws from in the browser.
const ISSUED_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Eight unambiguous lowercase letters and digits, e.g. "k7mp3wqa". */
export function generateIssuedPassword(length = 8): string {
  // Dynamic require keeps this file free of a top-level node import for the
  // pure helpers' sake; `crypto` is always there on Node.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomInt } = require('crypto') as typeof import('crypto');
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ISSUED_PASSWORD_ALPHABET[randomInt(ISSUED_PASSWORD_ALPHABET.length)];
  }
  return out;
}

/**
 * The grade a class code names: its leading number, after an optional word
 * for "grade" in the languages the schools write it in — "7th", "8aad",
 * "3aad B", "Grade 7", "G7", "Fasalka 9", "10th". A nursery or KG code has
 * no number and belongs to no grade's shelf.
 */
export function gradeNumberOf(code: unknown): number | null {
  const s = text(code);
  if (!s) return null;
  const m = s.match(
    /^(?:grade|gr|g|class|fasalka|fasal|kutaa|kifil|std|standard|form)?\s*[-.]?\s*(\d{1,2})(?!\d)/i,
  );
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 14 ? n : null;
}

/**
 * Pupils get their OWN login from this grade up (owner 2026-10-16: "Students
 * from Grade 6+ should have usernames"; 2026-10-18: the younger ones are not
 * to be offered one at all). A KG or nursery class names no grade, so it is
 * below the line. Logins already made are left alone.
 */
export const STUDENT_LOGIN_MIN_GRADE = 6;

export function studentLoginGradeAllowed(
  classCode: unknown,
  registryGrade?: unknown,
): boolean {
  // The class registry's grade first, as the pupil's own page reads it — a
  // class named "Bilal" whose registry grade is "Grade 8" is Grade 8 — else
  // the class code's leading number.
  const grade = gradeNumberOf(registryGrade) ?? gradeNumberOf(classCode);
  return grade != null && grade >= STUDENT_LOGIN_MIN_GRADE;
}

/**
 * Whether the login's owner chose their own password after the office last
 * issued one — the logins sheet then prints "their own", not the issued
 * password that no longer opens it.
 */
export function choseOwnPassword(row: {
  passwordIssuedAt?: Date | string | null;
  passwordChangedAt?: Date | string | null;
}): boolean {
  const changed = row.passwordChangedAt
    ? new Date(row.passwordChangedAt).getTime()
    : 0;
  if (!changed) return false;
  const issued = row.passwordIssuedAt
    ? new Date(row.passwordIssuedAt).getTime()
    : 0;
  return changed >= issued;
}
