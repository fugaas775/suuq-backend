/**
 * Split a set of tender rows into cash vs clearing (cards / mobile money / bank)
 * and normalize the two so they sum exactly to `total`. Shared by every service
 * that posts a payment to the ledger, so the cash/clearing debit always
 * reconciles to the amount being recognized.
 */
export interface TenderRow {
  method?: string | null;
  amount?: number | null;
}

export interface TenderSplit {
  cash: number;
  clearing: number;
}

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function splitTenders(
  rows: TenderRow[] | undefined | null,
  total: number,
): TenderSplit {
  const settled = round2(total);
  let cash = 0;
  let clearing = 0;
  for (const row of rows || []) {
    const amount = Number(row?.amount || 0);
    if (String(row?.method || '').toUpperCase() === 'CASH') {
      cash += amount;
    } else {
      clearing += amount;
    }
  }
  if (round2(cash + clearing) <= 0) {
    // No tender detail — treat the whole amount as cash.
    return { cash: settled, clearing: 0 };
  }
  const sum = round2(cash + clearing);
  if (sum !== settled) {
    const scale = settled / sum;
    cash = round2(cash * scale);
    clearing = round2(settled - cash);
  }
  return { cash: round2(cash), clearing: round2(clearing) };
}

export interface BadDebtExtraction {
  /** Sum of BAD_DEBT tender amounts — the manager-approved write-off. */
  badDebt: number;
  /** The collectable tenders (everything that is not BAD_DEBT). */
  collected: TenderRow[];
}

/**
 * Pull BAD_DEBT (manager-approved write-off) tenders out of a tender set. A
 * bad-debt tender is neither cash nor a clearing asset — it is a loss the caller
 * posts to BAD_DEBT_EXPENSE — so it must be separated BEFORE `splitTenders`, and
 * the split target reduced by the bad-debt amount. The caller then adds a single
 * Dr BAD_DEBT_EXPENSE line for `badDebt`, keeping the entry balanced (the loss
 * leg replaces the cash/clearing leg it would otherwise have inflated).
 */
export function extractBadDebt(
  rows: TenderRow[] | undefined | null,
): BadDebtExtraction {
  let badDebt = 0;
  const collected: TenderRow[] = [];
  for (const row of rows || []) {
    if (String(row?.method || '').toUpperCase() === 'BAD_DEBT') {
      badDebt += Number(row?.amount || 0);
    } else {
      collected.push(row);
    }
  }
  return { badDebt: round2(Math.max(0, badDebt)), collected };
}
