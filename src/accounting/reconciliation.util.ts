import { JournalLineInput } from './general-ledger.service';
import { GlAccountCode } from './gl-accounts.constant';
import {
  LedgerBalanceSheet,
  LedgerProfitAndLoss,
} from './ledger-statements.service';

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Minimal shape of the legacy derived balance sheet / P&L this module reads.
 * (Matches the relevant fields of billing's BalanceSheetReport / ProfitAndLossReport.)
 */
export interface LegacyBalanceSheet {
  assets: {
    cash: number;
    tenderClearing: number;
    inventoryValue: number;
    fixedAssetsGross: number;
    accumulatedDepreciation: number;
    fixedAssetsNet: number;
    total: number;
  };
  liabilities: {
    supplierPayables: number;
    taxPayable: number;
    accruedLiabilities: number;
    currentPortionLongTermDebt: number;
    longTermDebt: number; // non-current portion
    total: number;
  };
  equity: number;
}

export interface LegacyProfitAndLoss {
  revenue: { net: number; tax: number };
  cogs: number;
  totalExpenses: number;
  netProfit: number;
}

/**
 * Build the OPENING_BALANCE journal lines that set every control account to its
 * legacy-derived balance at the cutover, plugging owner equity so the entry
 * balances. Seed this once per branch BEFORE live posting begins; thereafter the
 * ledger carries the books forward and the reports can be cut over.
 *
 * Accounts receivable opens at zero — the legacy model has no AR balance to
 * carry, so all receivables are born from post-cutover on-account sales.
 */
export function buildOpeningBalanceLines(
  bs: LegacyBalanceSheet,
): JournalLineInput[] {
  const accruedTotal = round2(bs.liabilities.accruedLiabilities);
  const longTermTotal = round2(
    bs.liabilities.currentPortionLongTermDebt + bs.liabilities.longTermDebt,
  );
  const lines: JournalLineInput[] = [
    { accountCode: GlAccountCode.CASH, debit: round2(bs.assets.cash) },
    {
      accountCode: GlAccountCode.TENDER_CLEARING,
      debit: round2(bs.assets.tenderClearing),
    },
    {
      accountCode: GlAccountCode.INVENTORY,
      debit: round2(bs.assets.inventoryValue),
    },
    {
      accountCode: GlAccountCode.FIXED_ASSETS,
      debit: round2(bs.assets.fixedAssetsGross),
    },
    {
      accountCode: GlAccountCode.ACCUMULATED_DEPRECIATION,
      credit: round2(bs.assets.accumulatedDepreciation),
    },
    {
      accountCode: GlAccountCode.SUPPLIER_PAYABLES,
      credit: round2(bs.liabilities.supplierPayables),
    },
    {
      accountCode: GlAccountCode.TAX_PAYABLE,
      credit: round2(bs.liabilities.taxPayable),
    },
    { accountCode: GlAccountCode.ACCRUED_LIABILITIES, credit: accruedTotal },
    { accountCode: GlAccountCode.LONG_TERM_DEBT, credit: longTermTotal },
    { accountCode: GlAccountCode.OWNER_EQUITY, credit: round2(bs.equity) },
  ];
  // Drop zero legs so the entry stays compact.
  return lines.filter(
    (line) => Number(line.debit || 0) > 0 || Number(line.credit || 0) > 0,
  );
}

export interface ReconciliationLine {
  line: string;
  legacy: number;
  ledger: number;
  diff: number;
  /** true when this line is allowed to diverge (documented), e.g. cash. */
  exempt: boolean;
}

export interface ReconciliationResult {
  matched: boolean;
  tolerance: number;
  /** Non-exempt lines whose |diff| exceeds the tolerance. */
  discrepancies: ReconciliationLine[];
  /** Every compared line (including exempt + within-tolerance), for reporting. */
  lines: ReconciliationLine[];
}

const DEFAULT_TOLERANCE = 0.01;

/**
 * Compare the legacy-derived statements against the ledger-computed statements.
 * `cash` and `equity` are exempt by default: the ledger tracks true cash flow
 * whereas the legacy model estimates cash from register floats, and equity
 * absorbs that documented difference.
 */
export function reconcileStatements(
  input: {
    legacyBS: LegacyBalanceSheet;
    ledgerBS: LedgerBalanceSheet;
    legacyPL: LegacyProfitAndLoss;
    ledgerPL: LedgerProfitAndLoss;
  },
  opts: { tolerance?: number; exemptLines?: string[] } = {},
): ReconciliationResult {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const exemptSet = new Set(opts.exemptLines ?? ['cash', 'equity']);
  const { legacyBS, ledgerBS, legacyPL, ledgerPL } = input;

  const pairs: Array<[string, number, number]> = [
    // Balance sheet
    ['cash', legacyBS.assets.cash, ledgerBS.assets.cash],
    [
      'tenderClearing',
      legacyBS.assets.tenderClearing,
      ledgerBS.assets.tenderClearing,
    ],
    [
      'inventoryValue',
      legacyBS.assets.inventoryValue,
      ledgerBS.assets.inventoryValue,
    ],
    [
      'fixedAssetsNet',
      legacyBS.assets.fixedAssetsNet,
      ledgerBS.assets.fixedAssetsNet,
    ],
    [
      'supplierPayables',
      legacyBS.liabilities.supplierPayables,
      ledgerBS.liabilities.supplierPayables,
    ],
    [
      'taxPayable',
      legacyBS.liabilities.taxPayable,
      ledgerBS.liabilities.taxPayable,
    ],
    [
      'accruedLiabilities',
      legacyBS.liabilities.accruedLiabilities,
      ledgerBS.liabilities.accruedLiabilities,
    ],
    [
      'longTermDebt',
      round2(
        legacyBS.liabilities.currentPortionLongTermDebt +
          legacyBS.liabilities.longTermDebt,
      ),
      ledgerBS.liabilities.longTermDebt,
    ],
    ['equity', legacyBS.equity, ledgerBS.equity],
    // Profit & loss
    ['revenueNet', legacyPL.revenue.net, ledgerPL.revenueNet],
    ['tax', legacyPL.revenue.tax, ledgerPL.tax],
    ['cogs', legacyPL.cogs, ledgerPL.cogs],
    ['totalExpenses', legacyPL.totalExpenses, ledgerPL.totalExpenses],
    ['netProfit', legacyPL.netProfit, ledgerPL.netProfit],
  ];

  const lines: ReconciliationLine[] = pairs.map(([line, legacy, ledger]) => ({
    line,
    legacy: round2(legacy),
    ledger: round2(ledger),
    diff: round2(legacy - ledger),
    exempt: exemptSet.has(line),
  }));

  const discrepancies = lines.filter(
    (l) => !l.exempt && Math.abs(l.diff) > tolerance,
  );
  return {
    matched: discrepancies.length === 0,
    tolerance,
    discrepancies,
    lines,
  };
}
