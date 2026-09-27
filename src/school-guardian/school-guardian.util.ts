/**
 * Pure helpers for parents' logins — no I/O, all spec'd.
 */

const text = (v: unknown) => String(v ?? '').trim();

/** Digits only; an Ethiopian +251 9xx… is folded to the local 09xx… form. */
export function normalizePhoneKey(value: unknown): string {
  const digits = text(value).replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('251') && digits.length === 12) return `0${digits.slice(3)}`;
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
  const chosen = parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : parts;
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
  const snap = (row?.cartSnapshot ?? {}) as Record<string, unknown>;
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
    leftOn: pupilStatus === 'INACTIVE' ? text(snap.schoolStatusOn) || null : null,
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
  const snap = (row?.cartSnapshot ?? {}) as Record<string, unknown>;
  const meta = (row?.metadata ?? {}) as Record<string, unknown>;
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
  const snap = (row?.cartSnapshot ?? {}) as Record<string, unknown>;
  const meta = (row?.metadata ?? {}) as Record<string, unknown>;
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
]);

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
  const snap = (row?.cartSnapshot ?? {}) as Record<string, unknown>;
  const meta = (row?.metadata ?? {}) as Record<string, unknown>;
  const cartSnapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snap)) {
    if (SNAPSHOT_DENYLIST.has(key)) continue;
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
