import {
  buildOpeningBalanceLines,
  reconcileStatements,
  LegacyBalanceSheet,
} from './reconciliation.util';
import { GlAccountCode } from './gl-accounts.constant';

const legacyBS: LegacyBalanceSheet = {
  assets: {
    cash: 1000,
    tenderClearing: 200,
    inventoryValue: 500,
    fixedAssetsGross: 3000,
    accumulatedDepreciation: 1000,
    fixedAssetsNet: 2000,
    total: 3700,
  },
  liabilities: {
    supplierPayables: 400,
    taxPayable: 100,
    accruedLiabilities: 300,
    currentPortionLongTermDebt: 150,
    longTermDebt: 850,
    total: 1800,
  },
  equity: 1900,
};

describe('buildOpeningBalanceLines', () => {
  it('produces a balanced opening entry plugged to owner equity', () => {
    const lines = buildOpeningBalanceLines(legacyBS);
    const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    expect(debit).toBe(credit);
    expect(debit).toBe(4700); // cash+tender+inv+fixedGross

    const find = (code: string) => lines.find((l) => l.accountCode === code);
    expect(find(GlAccountCode.OWNER_EQUITY)?.credit).toBe(1900);
    // Long-term debt opens at current portion + non-current.
    expect(find(GlAccountCode.LONG_TERM_DEBT)?.credit).toBe(1000);
    expect(find(GlAccountCode.ACCUMULATED_DEPRECIATION)?.credit).toBe(1000);
  });

  it('drops zero legs', () => {
    const flat = buildOpeningBalanceLines({
      ...legacyBS,
      assets: { ...legacyBS.assets, tenderClearing: 0 },
    });
    expect(
      flat.find((l) => l.accountCode === GlAccountCode.TENDER_CLEARING),
    ).toBeUndefined();
  });
});

describe('reconcileStatements', () => {
  const ledgerBS = {
    assets: {
      cash: 950, // diverges (exempt)
      tenderClearing: 200,
      accountsReceivable: 0,
      inventoryValue: 500,
      fixedAssetsGross: 3000,
      accumulatedDepreciation: 1000,
      fixedAssetsNet: 2000,
      total: 3650,
    },
    liabilities: {
      supplierPayables: 400,
      taxPayable: 100,
      tipsPayable: 0,
      customerDeposits: 0,
      deferredRevenue: 0,
      accruedLiabilities: 300,
      longTermDebt: 1000,
      total: 1800,
    },
    equity: 1850,
  };
  const legacyPL = {
    revenue: { net: 5000, tax: 0 },
    cogs: 2000,
    totalExpenses: 1000,
    netProfit: 2000,
  };
  const ledgerPL = {
    revenueNet: 5000,
    tax: 0,
    cogs: 2000,
    grossProfit: 3000,
    expensesByCategory: { RENT: 1000 },
    totalExpenses: 1000,
    netProfit: 2000,
  };

  it('matches when only the exempt cash/equity lines diverge', () => {
    const result = reconcileStatements({
      legacyBS,
      ledgerBS,
      legacyPL,
      ledgerPL,
    });
    expect(result.matched).toBe(true);
    expect(result.discrepancies).toHaveLength(0);
    // cash is reported but exempt.
    const cash = result.lines.find((l) => l.line === 'cash');
    expect(cash?.exempt).toBe(true);
    expect(cash?.diff).toBe(50);
  });

  it('flags a non-exempt line that diverges beyond tolerance', () => {
    const result = reconcileStatements({
      legacyBS,
      ledgerBS: {
        ...ledgerBS,
        liabilities: { ...ledgerBS.liabilities, supplierPayables: 350 },
      },
      legacyPL,
      ledgerPL,
    });
    expect(result.matched).toBe(false);
    expect(result.discrepancies.map((d) => d.line)).toContain(
      'supplierPayables',
    );
  });

  it('flags a P&L divergence (net profit)', () => {
    const result = reconcileStatements({
      legacyBS,
      ledgerBS,
      legacyPL,
      ledgerPL: { ...ledgerPL, netProfit: 1800 },
    });
    expect(result.matched).toBe(false);
    expect(result.discrepancies.map((d) => d.line)).toContain('netProfit');
  });
});
