import { Branch } from '../branches/entities/branch.entity';

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * The branch's tax (VAT) rate as a fraction, or 0 when it does not charge tax.
 *
 * The rate is stored as a fraction end to end — 0.15 is 15% — and a branch with
 * the toggle off keeps whatever rate is pre-filled, so `taxEnabled` is the gate
 * and the rate alone must never be read.
 */
export function resolveBranchTaxRate(
  branch: Pick<Branch, 'taxEnabled' | 'taxRate'> | undefined | null,
): number {
  if (!branch?.taxEnabled) {
    return 0;
  }
  const rate = Number(branch.taxRate ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

/**
 * Splits a GROSS amount into the revenue net of tax and the tax inside it.
 *
 * Every figure a hospitality booking or folio stores is gross — that is the
 * register's invariant (raw cart lines stay net, the stored folio total is
 * gross), and it is what the guest actually owed. Extraction is therefore the
 * same arithmetic in both tax modes: an exclusive branch grossed the price up
 * before storing it, an inclusive branch's price already contained the tax, and
 * either way `tax = gross − gross / (1 + rate)`.
 *
 * That identity is exactly why these ledger paths need no `taxInclusive` flag —
 * see the Branch entity, which documents it as the property both modes satisfy.
 *
 * The net is derived first and the tax taken as the remainder, so `net + tax`
 * is always exactly the gross that was passed in. A journal entry built from
 * both legs balances against a debit of the gross with no rounding drift.
 */
export function splitGrossTax(
  gross: number,
  rate: number,
): { net: number; tax: number } {
  const total = round2(Number(gross) || 0);
  const r = Number(rate) || 0;
  if (r <= 0) {
    return { net: total, tax: 0 };
  }
  const net = round2(total / (1 + r));
  return { net, tax: round2(total - net) };
}
