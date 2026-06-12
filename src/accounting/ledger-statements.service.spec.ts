import { LedgerStatementsService } from './ledger-statements.service';
import { GlAccountCode } from './gl-accounts.constant';

describe('LedgerStatementsService', () => {
  let service: LedgerStatementsService;
  let balances: Record<string, number>;

  beforeEach(() => {
    balances = {};
    const ledger = {
      balance: jest.fn(
        async (_branchId: number, code: string) => balances[code] ?? 0,
      ),
    };
    service = new LedgerStatementsService(ledger as never);
  });

  it('computes a P&L from revenue, COGS and expense account balances', async () => {
    balances = {
      [GlAccountCode.SERVICE_REVENUE]: 8000,
      [GlAccountCode.RENTAL_REVENUE]: 2000,
      [GlAccountCode.COGS]: 3000,
      [GlAccountCode.COST_OF_SERVICES]: 500,
      [GlAccountCode.TAX_PAYABLE]: 150,
      [GlAccountCode.EXPENSE_RENT]: 1200,
      [GlAccountCode.EXPENSE_PAYROLL]: 800,
    };

    const pl = await service.getProfitAndLoss(7, {});
    expect(pl.revenueNet).toBe(10000);
    expect(pl.cogs).toBe(3500);
    expect(pl.grossProfit).toBe(6500);
    expect(pl.tax).toBe(150);
    expect(pl.expensesByCategory).toEqual({ RENT: 1200, PAYROLL: 800 });
    expect(pl.totalExpenses).toBe(2000);
    expect(pl.netProfit).toBe(4500);
  });

  it('computes a balanced balance sheet (assets = liabilities + equity)', async () => {
    balances = {
      [GlAccountCode.CASH]: 5000,
      [GlAccountCode.TENDER_CLEARING]: 1000,
      [GlAccountCode.ACCOUNTS_RECEIVABLE]: 600,
      [GlAccountCode.INVENTORY]: 2400,
      [GlAccountCode.FIXED_ASSETS]: 3000,
      [GlAccountCode.ACCUMULATED_DEPRECIATION]: 1000,
      [GlAccountCode.SUPPLIER_PAYABLES]: 800,
      [GlAccountCode.TAX_PAYABLE]: 150,
      [GlAccountCode.CUSTOMER_DEPOSITS]: 1200,
      [GlAccountCode.DEFERRED_REVENUE]: 500,
      [GlAccountCode.LONG_TERM_DEBT]: 2000,
      [GlAccountCode.OWNER_EQUITY]: 3500,
      // retained earnings: revenue 6000 − (cogs 2000 + expenses 1150) = 2850
      [GlAccountCode.SERVICE_REVENUE]: 6000,
      [GlAccountCode.COGS]: 2000,
      [GlAccountCode.EXPENSE_RENT]: 1150,
    };

    const bs = await service.getBalanceSheet(
      7,
      new Date('2026-06-12T00:00:00Z'),
    );

    expect(bs.assets.fixedAssetsNet).toBe(2000); // 3000 − 1000
    expect(bs.assets.total).toBe(11000); // 5000+1000+600+2400+2000
    expect(bs.liabilities.total).toBe(4650); // 800+150+1200+500+2000 (+0 tips/accrued)
    expect(bs.equity).toBe(6350); // owner 3500 + retained 2850
    // The accounting identity holds for internally-consistent balances.
    expect(bs.assets.total).toBeCloseTo(bs.liabilities.total + bs.equity, 2);
  });
});
