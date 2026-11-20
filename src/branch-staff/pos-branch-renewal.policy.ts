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
  return TRIAL_PLAN_CODES.includes(String(sub.planCode || ''));
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
 * May the next term be paid for now, while this one is still running?
 *
 * Only a dated paid term inside the renewal window. An open-ended row has
 * nothing to extend; a free period converts through its own path.
 */
export function canRenewEarly(
  sub: RenewableSubscriptionLike | null | undefined,
  now: number,
): boolean {
  if (!isLivePaidTerm(sub, now)) return false;
  const endsAt = toTime(sub.endsAt);
  return endsAt - now <= POS_EARLY_RENEWAL_WINDOW_DAYS * DAY_MS;
}

/**
 * When a term bought now begins: at the end of a still-running paid term, so no
 * paid day is lost, otherwise immediately.
 */
export function resolveNextTermStart(
  sub: RenewableSubscriptionLike | null | undefined,
  now: Date,
): Date {
  if (isLivePaidTerm(sub, now.getTime())) {
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

/** `POSACT-<branchId>-<epoch ms>[-PERIOD]` → the epoch ms it was issued at. */
export function parseActivationReferenceIssuedAt(
  referenceId: string,
): number | null {
  const match = String(referenceId || '').match(/^POSACT-\d+-(\d{10,})/u);
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
