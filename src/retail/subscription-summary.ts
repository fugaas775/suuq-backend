import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';

/**
 * The shape both tenant (branch) and supplier subscriptions share — enough to
 * decide which row is current and what it is worth per month.
 */
export interface SubscriptionLike {
  id: number;
  planCode: string;
  status: TenantSubscriptionStatus;
  billingInterval: TenantBillingInterval;
  amount?: number | string | null;
  amountTotal?: number | string | null;
  periodMonths?: number | null;
  currency?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
}

export interface SubscriptionSummary {
  id: number;
  planCode: string;
  status: TenantSubscriptionStatus;
  billingInterval: TenantBillingInterval;
  currency: string;
  monthlyAmount: number;
  startsAt: Date;
  endsAt: Date | null;
  /** Whole days until endsAt; negative once lapsed; null when open-ended. */
  daysRemaining: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const INTERVAL_MONTHS: Partial<Record<TenantBillingInterval, number>> = {
  [TenantBillingInterval.MONTHLY]: 1,
  [TenantBillingInterval.SIX_MONTHS]: 6,
  [TenantBillingInterval.YEARLY]: 12,
  [TenantBillingInterval.ONE_YEAR]: 12,
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * What the subscription is worth per month. Per-branch period rows carry an
 * explicit amountTotal over periodMonths; legacy rows carry a per-interval
 * `amount` that is spread across the interval's length. A CUSTOM interval
 * without a period length cannot be normalised and counts as zero rather than
 * being guessed at.
 */
export function monthlyEquivalent(sub: SubscriptionLike): number {
  const total = toNumber(sub.amountTotal);
  const months =
    sub.periodMonths && sub.periodMonths > 0 ? sub.periodMonths : null;
  if (total !== null && months) return round2(total / months);

  const amount = toNumber(sub.amount);
  if (amount === null) return 0;
  const intervalMonths = months ?? INTERVAL_MONTHS[sub.billingInterval] ?? null;
  if (!intervalMonths) return 0;
  return round2(amount / intervalMonths);
}

/**
 * The subscription that currently describes an account: the one that started
 * most recently, ties broken by the newer row. Renewals and plan changes both
 * write a later-starting row, so this tracks what the owner is on today.
 */
export function pickCurrentSubscription<T extends SubscriptionLike>(
  subs: T[],
): T | null {
  let current: T | null = null;
  for (const sub of subs) {
    if (
      !current ||
      sub.startsAt.getTime() > current.startsAt.getTime() ||
      (sub.startsAt.getTime() === current.startsAt.getTime() &&
        sub.id > current.id)
    ) {
      current = sub;
    }
  }
  return current;
}

/**
 * True when the subscription is billable right now: ACTIVE or PAST_DUE (still
 * owed and still serving) and not past its end date.
 */
export function isPayingNow(sub: SubscriptionLike, now: Date): boolean {
  if (
    sub.status !== TenantSubscriptionStatus.ACTIVE &&
    sub.status !== TenantSubscriptionStatus.PAST_DUE
  ) {
    return false;
  }
  return !sub.endsAt || sub.endsAt.getTime() > now.getTime();
}

export function summarizeSubscription(
  sub: SubscriptionLike,
  now: Date,
): SubscriptionSummary {
  const endsAt = sub.endsAt ?? null;
  return {
    id: sub.id,
    planCode: sub.planCode,
    status: sub.status,
    billingInterval: sub.billingInterval,
    currency: sub.currency || 'ETB',
    monthlyAmount: monthlyEquivalent(sub),
    startsAt: sub.startsAt,
    endsAt,
    daysRemaining: endsAt
      ? Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS)
      : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Where an account stands commercially, collapsed from its current
 * subscription: PAYING (active or past-due and still inside its period),
 * TRIAL, LAPSED (ended, expired or cancelled) or NONE (never subscribed).
 */
export type BillingState = 'PAYING' | 'TRIAL' | 'LAPSED' | 'NONE';

export function billingStateOf(
  sub: SubscriptionLike | null,
  now: Date,
): BillingState {
  if (!sub) return 'NONE';
  if (isPayingNow(sub, now)) return 'PAYING';
  const ended = !!sub.endsAt && sub.endsAt.getTime() <= now.getTime();
  if (sub.status === TenantSubscriptionStatus.TRIAL && !ended) return 'TRIAL';
  return 'LAPSED';
}
