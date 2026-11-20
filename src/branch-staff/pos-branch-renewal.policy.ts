import { POS_SELF_SERVE_TRIAL_PLAN_CODES } from '../retail/pos-self-serve-trial.policy';
import { TenantSubscriptionStatus } from '../retail/entities/tenant-subscription.entity';

/**
 * Renewal rules for a per-branch POS subscription paid by Ebirr.
 *
 * Ebirr is a push payment — the owner approves every charge on their phone and
 * there is no stored mandate — so a term can only continue if the owner is able
 * to pay for the next one BEFORE the current one runs out. These rules are what
 * make that possible without costing them the days they already paid for.
 */

/** How long before a paid term ends the owner may pay for the next one. */
export const POS_EARLY_RENEWAL_WINDOW_DAYS = 30;

/**
 * How long an unconfirmed Ebirr request blocks a second one for the same
 * branch. Long enough to cover a double tap and a slow PIN prompt; short enough
 * that a mistyped phone number does not strand the owner.
 */
export const POS_RENEWAL_OPEN_ATTEMPT_WINDOW_MS = 3 * 60 * 1000;

/**
 * Days a PAID branch keeps trading after its term ends, so a renewal that is a
 * day late does not stop a shop mid-service. Not free time: a renewal paid in
 * grace is counted from the day the old term ended. Free periods get none — a
 * free period simply stops. Override with POS_PAID_GRACE_DAYS (0 switches it off).
 */
export function getPosPaidGraceDays(): number {
  const raw = Number(process.env.POS_PAID_GRACE_DAYS);
  return Number.isFinite(raw) && raw >= 0 && raw <= 30 ? Math.floor(raw) : 3;
}

const DAY_MS = 86_400_000;
const TRIAL_PLAN_CODES: readonly string[] = POS_SELF_SERVE_TRIAL_PLAN_CODES;

export interface RenewableSubscriptionLike {
  planCode?: string | null;
  status?: TenantSubscriptionStatus | string | null;
  endsAt?: Date | string | null;
  metadata?: Record<string, any> | null;
}

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isFreePeriodRow(sub: RenewableSubscriptionLike): boolean {
  const planCode = String(sub.planCode || '');
  // Branch free-period codes, and the supplier one (`SUPPLIER_FREE_…`).
  return TRIAL_PLAN_CODES.includes(planCode) || /FREE|TRIAL/u.test(planCode);
}

/** A paid (or admin-granted) term that is still running. */
export function isLivePaidTerm(
  sub: RenewableSubscriptionLike | null | undefined,
  now: number,
): boolean {
  if (!sub || isFreePeriodRow(sub)) return false;
  if (sub.status !== TenantSubscriptionStatus.ACTIVE) return false;
  const endsAt = toTime(sub.endsAt);
  return endsAt != null && endsAt > now;
}

/**
 * A paid term that has ended but is inside its grace: the workspace still
 * trades and the owner is expected to pay now.
 */
export function isInPaidGrace(
  sub: RenewableSubscriptionLike | null | undefined,
  now: number,
  graceDays = 0,
): boolean {
  if (!sub || graceDays <= 0 || isFreePeriodRow(sub)) return false;
  if (sub.status !== TenantSubscriptionStatus.ACTIVE) return false;
  const endsAt = toTime(sub.endsAt);
  return endsAt != null && endsAt <= now && now < endsAt + graceDays * DAY_MS;
}

/** When grace runs out for this row; null when grace does not apply to it. */
export function resolveGraceEndsAt(
  sub: RenewableSubscriptionLike | null | undefined,
  graceDays = 0,
): Date | null {
  if (!sub || graceDays <= 0 || isFreePeriodRow(sub)) return null;
  const endsAt = toTime(sub.endsAt);
  return endsAt == null ? null : new Date(endsAt + graceDays * DAY_MS);
}

/**
 * May the next term be paid for now, while this one is still serving?
 *
 * A dated paid term inside the renewal window, or one in its grace. An
 * open-ended row has nothing to extend; a free period converts through its own
 * path.
 */
export function canRenewEarly(
  sub: RenewableSubscriptionLike | null | undefined,
  now: number,
  graceDays = 0,
): boolean {
  if (isInPaidGrace(sub, now, graceDays)) return true;
  if (!isLivePaidTerm(sub, now)) return false;
  const endsAt = toTime(sub.endsAt);
  return endsAt - now <= POS_EARLY_RENEWAL_WINDOW_DAYS * DAY_MS;
}

/** Does a term bought now continue from this row's end rather than from today? */
export function continuesFromTermEnd(
  sub: RenewableSubscriptionLike | null | undefined,
  now: number,
  graceDays = 0,
): boolean {
  return isLivePaidTerm(sub, now) || isInPaidGrace(sub, now, graceDays);
}

/**
 * When a term bought now begins: at the end of a paid term that is still
 * running or in grace — no paid day lost, no grace day free — otherwise now.
 */
export function resolveNextTermStart(
  sub: RenewableSubscriptionLike | null | undefined,
  now: Date,
  graceDays = 0,
): Date {
  if (continuesFromTermEnd(sub, now.getTime(), graceDays)) {
    return new Date(toTime(sub.endsAt));
  }
  return now;
}

/** Does this row record a term someone paid for or was granted by an admin? */
export function recordsSettledTerm(
  sub: RenewableSubscriptionLike | null | undefined,
): boolean {
  const meta = sub?.metadata || {};
  return Boolean(meta.lastActivationReferenceId || meta.manualExtension);
}

/**
 * `<PREFIX>-<id>-<epoch ms>[-PERIOD]` → the epoch ms it was issued at. Branch
 * (POSACT) and supplier (SUPACT) references share the shape.
 */
export function parseActivationReferenceIssuedAt(
  referenceId: string,
): number | null {
  const match = String(referenceId || '').match(/^[A-Z]+-\d+-(\d{10,})/u);
  if (!match?.[1]) return null;
  const issuedAt = Number(match[1]);
  return Number.isFinite(issuedAt) ? issuedAt : null;
}

/** `POSACT-<branchId>-<epoch ms>-<PERIOD>` → `PERIOD`, when present. */
export function parseActivationReferencePeriod(
  referenceId: string,
): string | null {
  const match = String(referenceId || '').match(/^POSACT-\d+-\d+-([A-Z_]+)$/u);
  return match?.[1] ?? null;
}

/** Every payment reference already turned into a term on these rows. */
export function collectAppliedActivationReferences(
  rows: RenewableSubscriptionLike[],
): Set<string> {
  const applied = new Set<string>();
  for (const row of rows) {
    const meta = row?.metadata || {};
    if (typeof meta.lastActivationReferenceId === 'string') {
      applied.add(meta.lastActivationReferenceId);
    }
    // An admin who settles a stray payment by hand quotes its reference as the
    // reason for the extension — that term is the payment's term, so the
    // reference is spent and must not buy a second one if it is ever replayed.
    const manualReason = meta.manualExtension?.reason;
    if (typeof manualReason === 'string') {
      for (const ref of manualReason.match(/POSACT-\d+-\d+(?:-[A-Z_]+)?/gu) ??
        []) {
        applied.add(ref);
      }
    }
    if (Array.isArray(meta.appliedActivationReferences)) {
      for (const ref of meta.appliedActivationReferences) {
        if (typeof ref === 'string') applied.add(ref);
      }
    }
  }
  return applied;
}

/**
 * Has this payment reference already bought its term?
 *
 * The provider re-sends a confirmation, and the return URL confirms the same
 * payment the webhook did, so completion runs more than once per payment. The
 * answer has to come from the reference, never from "is the branch active": a
 * branch can be active and still be owed the term it just paid for.
 *
 * Rows written before references were tracked only remember their LAST one, so
 * for those an older reference is taken as already applied.
 */
export function isActivationReferenceApplied(
  referenceId: string,
  rows: RenewableSubscriptionLike[],
): boolean {
  if (collectAppliedActivationReferences(rows).has(referenceId)) return true;

  const issuedAt = parseActivationReferenceIssuedAt(referenceId);
  if (issuedAt == null) return false;
  let legacyWatermark: number | null = null;
  for (const row of rows) {
    const meta = row?.metadata || {};
    if (Array.isArray(meta.appliedActivationReferences)) continue;
    const activatedAt = toTime(meta.lastActivatedAt);
    if (activatedAt != null && activatedAt > (legacyWatermark ?? 0)) {
      legacyWatermark = activatedAt;
    }
  }
  return legacyWatermark != null && issuedAt <= legacyWatermark;
}
