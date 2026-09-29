/**
 * Pure helpers for parents' logins — no I/O, all spec'd.
 */

const text = (v: unknown) => String(v ?? '').trim();

/** Digits only; an Ethiopian +251 9xx… is folded to the local 09xx… form. */
export function normalizePhoneKey(value: unknown): string {
  const digits = text(value).replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('251') && digits.length === 12)
    return `0${digits.slice(3)}`;
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
 * The username the office is offered for a family: the guardian's phone
 * (digits, at least nine of them — what a parent already knows by heart),
 * otherwise their name. May still collide; the caller de-duplicates.
 */
export function suggestGuardianUsername({
  phone,
  guardianName,
}: {
  phone?: unknown;
  guardianName?: unknown;
}): string {
  const digits = normalizePhoneKey(phone);
  if (digits.length >= 9) return digits;
  const byName = usernameFromName(guardianName);
  return byName.length >= 3 ? byName : '';
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
    cartSnapshot[key] = value;
  }
  const stripBy = (list: unknown) =>
    Array.isArray(list)
      ? list.map((entry) =>
          entry && typeof entry === 'object'
            ? Object.fromEntries(
                Object.entries(entry as Record<string, unknown>).filter(
                  ([k]) => k !== 'by',
                ),
              )
            : entry,
        )
      : list;
  if ('schoolLeavingBills' in cartSnapshot) {
    cartSnapshot.schoolLeavingBills = stripBy(cartSnapshot.schoolLeavingBills);
  }
  if ('schoolClassHistory' in cartSnapshot) {
    cartSnapshot.schoolClassHistory = stripBy(cartSnapshot.schoolClassHistory);
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
