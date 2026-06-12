import { Injectable } from '@nestjs/common';
import { GeneralLedgerService } from './general-ledger.service';
import { GlAccountCode, GL_ACCOUNT_SEED } from './gl-accounts.constant';

export interface LedgerProfitAndLoss {
  revenueNet: number;
  tax: number;
  cogs: number;
  grossProfit: number;
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  netProfit: number;
}

export interface LedgerTrialBalanceLine {
  account: string;
  debit: number;
  credit: number;
}

export interface LedgerTrialBalance {
  lines: LedgerTrialBalanceLine[];
  totals: { debit: number; credit: number };
  balanced: boolean;
}

export interface LedgerBalanceSheet {
  assets: {
    cash: number;
    tenderClearing: number;
    accountsReceivable: number;
    inventoryValue: number;
    fixedAssetsGross: number;
    accumulatedDepreciation: number;
    fixedAssetsNet: number;
    total: number;
  };
  liabilities: {
    supplierPayables: number;
    taxPayable: number;
    tipsPayable: number;
    customerDeposits: number;
    deferredRevenue: number;
    accruedLiabilities: number;
    longTermDebt: number;
    total: number;
  };
  equity: number;
}

/** Operating-expense accounts and the P&L category label each maps to. */
const EXPENSE_ACCOUNTS: ReadonlyArray<[GlAccountCode, string]> = [
  [GlAccountCode.EXPENSE_RENT, 'RENT'],
  [GlAccountCode.EXPENSE_UTILITIES, 'UTILITIES'],
  [GlAccountCode.EXPENSE_PAYROLL, 'PAYROLL'],
  [GlAccountCode.EXPENSE_SUPPLIES, 'SUPPLIES'],
  [GlAccountCode.EXPENSE_MARKETING, 'MARKETING'],
  [GlAccountCode.EXPENSE_MAINTENANCE, 'MAINTENANCE'],
  [GlAccountCode.EXPENSE_TAXES, 'TAXES'],
  [GlAccountCode.EXPENSE_DEPRECIATION, 'DEPRECIATION'],
  [GlAccountCode.EXPENSE_INTEREST, 'INTEREST'],
  [GlAccountCode.EXPENSE_OTHER, 'OTHER'],
];

const REVENUE_ACCOUNTS = [
  GlAccountCode.SERVICE_REVENUE,
  GlAccountCode.RENTAL_REVENUE,
];
const COGS_ACCOUNTS = [GlAccountCode.COGS, GlAccountCode.COST_OF_SERVICES];

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Computes financial statements directly from general-ledger account balances —
 * the ledger-backed counterpart to the (legacy) derived BranchFinancialReports.
 * Used by the reconciliation harness now and, once reconciled, by the reports
 * endpoints (behind the ACCOUNTING_LEDGER_ENABLED flag) in a later phase.
 */
@Injectable()
export class LedgerStatementsService {
  constructor(private readonly ledger: GeneralLedgerService) {}

  async getProfitAndLoss(
    branchId: number,
    range: { from?: Date | null; to?: Date | null } = {},
  ): Promise<LedgerProfitAndLoss> {
    const period = { from: range.from ?? null, to: range.to ?? null };

    let revenueNet = 0;
    for (const code of REVENUE_ACCOUNTS) {
      revenueNet += await this.ledger.balance(branchId, code, period);
    }
    let cogs = 0;
    for (const code of COGS_ACCOUNTS) {
      cogs += await this.ledger.balance(branchId, code, period);
    }
    // Net tax arising in the period (sales credits minus return debits). This
    // matches the legacy signed tax figure today; when tax remittance is added
    // it MUST post to a separate settlement path (not net here) or this will
    // understate period tax — the reconciliation harness guards that.
    const tax = await this.ledger.balance(
      branchId,
      GlAccountCode.TAX_PAYABLE,
      period,
    );

    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;
    for (const [code, label] of EXPENSE_ACCOUNTS) {
      const amount = round2(await this.ledger.balance(branchId, code, period));
      if (amount !== 0) {
        expensesByCategory[label] = amount;
        totalExpenses += amount;
      }
    }

    revenueNet = round2(revenueNet);
    cogs = round2(cogs);
    totalExpenses = round2(totalExpenses);
    const grossProfit = round2(revenueNet - cogs);
    return {
      revenueNet,
      tax: round2(tax),
      cogs,
      grossProfit,
      expensesByCategory,
      totalExpenses,
      netProfit: round2(grossProfit - totalExpenses),
    };
  }

  /**
   * A real trial balance: every account's net balance presented in its natural
   * column. Debits equal credits because every journal entry balances.
   */
  async getTrialBalance(
    branchId: number,
    asOfAt: Date,
  ): Promise<LedgerTrialBalance> {
    const totals = await this.ledger.accountTotals(branchId, { to: asOfAt });
    const lines: LedgerTrialBalanceLine[] = [];
    let totalDebit = 0;
    let totalCredit = 0;
    for (const account of GL_ACCOUNT_SEED) {
      const t = totals.get(account.code) ?? { debit: 0, credit: 0 };
      const net = round2(t.debit - t.credit);
      if (net === 0) continue;
      const debit = net > 0 ? net : 0;
      const credit = net < 0 ? round2(-net) : 0;
      lines.push({ account: account.name, debit, credit });
      totalDebit = round2(totalDebit + debit);
      totalCredit = round2(totalCredit + credit);
    }
    return {
      lines,
      totals: { debit: totalDebit, credit: totalCredit },
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  }

  async getBalanceSheet(
    branchId: number,
    asOfAt: Date,
  ): Promise<LedgerBalanceSheet> {
    const to = { to: asOfAt };
    const bal = (code: GlAccountCode) =>
      this.ledger.balance(branchId, code, to);

    const cash = round2(await bal(GlAccountCode.CASH));
    const tenderClearing = round2(await bal(GlAccountCode.TENDER_CLEARING));
    const accountsReceivable = round2(
      await bal(GlAccountCode.ACCOUNTS_RECEIVABLE),
    );
    const inventoryValue = round2(await bal(GlAccountCode.INVENTORY));
    const fixedAssetsGross = round2(await bal(GlAccountCode.FIXED_ASSETS));
    const accumulatedDepreciation = round2(
      await bal(GlAccountCode.ACCUMULATED_DEPRECIATION),
    );
    const fixedAssetsNet = round2(fixedAssetsGross - accumulatedDepreciation);
    const assetsTotal = round2(
      cash +
        tenderClearing +
        accountsReceivable +
        inventoryValue +
        fixedAssetsNet,
    );

    const supplierPayables = round2(await bal(GlAccountCode.SUPPLIER_PAYABLES));
    const taxPayable = round2(await bal(GlAccountCode.TAX_PAYABLE));
    const tipsPayable = round2(await bal(GlAccountCode.TIPS_PAYABLE));
    const customerDeposits = round2(await bal(GlAccountCode.CUSTOMER_DEPOSITS));
    const deferredRevenue = round2(await bal(GlAccountCode.DEFERRED_REVENUE));
    const accruedLiabilities = round2(
      await bal(GlAccountCode.ACCRUED_LIABILITIES),
    );
    const longTermDebt = round2(await bal(GlAccountCode.LONG_TERM_DEBT));
    const liabilitiesTotal = round2(
      supplierPayables +
        taxPayable +
        tipsPayable +
        customerDeposits +
        deferredRevenue +
        accruedLiabilities +
        longTermDebt,
    );

    // Equity = booked owner capital + retained earnings (net P&L since inception).
    const ownerEquity = round2(await bal(GlAccountCode.OWNER_EQUITY));
    let revenueToDate = 0;
    for (const code of REVENUE_ACCOUNTS) revenueToDate += await bal(code);
    let costToDate = 0;
    for (const code of COGS_ACCOUNTS) costToDate += await bal(code);
    for (const [code] of EXPENSE_ACCOUNTS) costToDate += await bal(code);
    const retainedEarnings = round2(revenueToDate - costToDate);
    const equity = round2(ownerEquity + retainedEarnings);

    return {
      assets: {
        cash,
        tenderClearing,
        accountsReceivable,
        inventoryValue,
        fixedAssetsGross,
        accumulatedDepreciation,
        fixedAssetsNet,
        total: assetsTotal,
      },
      liabilities: {
        supplierPayables,
        taxPayable,
        tipsPayable,
        customerDeposits,
        deferredRevenue,
        accruedLiabilities,
        longTermDebt,
        total: liabilitiesTotal,
      },
      equity,
    };
  }
}
