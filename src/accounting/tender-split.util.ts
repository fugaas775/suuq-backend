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
