import { BranchFinancialReportsService } from './branch-financial-reports.service';
import {
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from '../pos-sync/entities/pos-checkout.entity';
import { PosRegisterSessionStatus } from '../pos-sync/entities/pos-register-session.entity';

function createBuilder(result: any[], raw = false) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(raw ? [] : result),
    getRawMany: jest.fn().mockResolvedValue(raw ? result : []),
  };
}

describe('BranchFinancialReportsService', () => {
  function createService() {
    const checkoutsRepo = {
      createQueryBuilder: jest.fn(),
    };
    const registerSessionsRepo = {
      createQueryBuilder: jest.fn(),
    };
    const inventoryRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const purchaseOrdersRepo = {
      createQueryBuilder: jest.fn(),
    };
    const purchaseOrderItemsRepo = {
      createQueryBuilder: jest.fn(),
    };
    const expensesRepo = {
      createQueryBuilder: jest.fn(),
    };
    const fixedAssetsRepo = {
      createQueryBuilder: jest.fn(),
    };
    const depreciationEntriesRepo = {
      createQueryBuilder: jest.fn(),
    };
    const accruedLiabilitiesRepo = {
      createQueryBuilder: jest.fn(),
    };
    const longTermDebtRepo = {
      createQueryBuilder: jest.fn(),
    };

    const service = new BranchFinancialReportsService(
      checkoutsRepo as any,
      registerSessionsRepo as any,
      inventoryRepo as any,
      purchaseOrdersRepo as any,
      purchaseOrderItemsRepo as any,
      expensesRepo as any,
      fixedAssetsRepo as any,
      depreciationEntriesRepo as any,
      accruedLiabilitiesRepo as any,
      longTermDebtRepo as any,
    );

    return {
      service,
      checkoutsRepo,
      registerSessionsRepo,
      inventoryRepo,
      purchaseOrdersRepo,
      purchaseOrderItemsRepo,
      expensesRepo,
      fixedAssetsRepo,
      depreciationEntriesRepo,
      accruedLiabilitiesRepo,
      longTermDebtRepo,
    };
  }

  it('carries register cash forward across sessions and separates non-cash tender clearing', async () => {
    const {
      service,
      checkoutsRepo,
      registerSessionsRepo,
      purchaseOrdersRepo,
      purchaseOrderItemsRepo,
      expensesRepo,
      fixedAssetsRepo,
      depreciationEntriesRepo,
      accruedLiabilitiesRepo,
      longTermDebtRepo,
    } = createService();

    checkoutsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          id: 1,
          currency: 'ETB',
          total: 100,
          status: PosCheckoutStatus.PROCESSED,
          transactionType: PosCheckoutTransactionType.SALE,
          registerSessionId: 1,
          tenders: [{ method: 'CASH', amount: 100 }],
          items: [],
        },
        {
          id: 2,
          currency: 'ETB',
          total: 50,
          status: PosCheckoutStatus.PROCESSED,
          transactionType: PosCheckoutTransactionType.SALE,
          registerSessionId: 2,
          tenders: [{ method: 'CASH', amount: 50 }],
          items: [],
        },
        {
          id: 3,
          currency: 'ETB',
          total: 200,
          status: PosCheckoutStatus.PROCESSED,
          transactionType: PosCheckoutTransactionType.SALE,
          registerSessionId: 2,
          tenders: [{ method: 'MOBILE_MONEY', amount: 200 }],
          items: [],
        },
        {
          id: 4,
          currency: 'ETB',
          total: 25,
          status: PosCheckoutStatus.PROCESSED,
          transactionType: PosCheckoutTransactionType.SALE,
          registerSessionId: 3,
          tenders: [{ method: 'CASH', amount: 25 }],
          items: [],
        },
        {
          id: 5,
          currency: 'ETB',
          total: 10,
          status: PosCheckoutStatus.PROCESSED,
          transactionType: PosCheckoutTransactionType.SALE,
          registerSessionId: null,
          tenders: [{ method: 'CASH', amount: 10 }],
          items: [],
        },
      ]),
    );
    registerSessionsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          id: 1,
          registerId: 'front-counter',
          status: PosRegisterSessionStatus.CLOSED,
          openedAt: new Date('2026-05-01T08:00:00.000Z'),
          closedAt: new Date('2026-05-01T10:00:00.000Z'),
          openingFloat: null,
          closingFloat: null,
        },
        {
          id: 2,
          registerId: 'front-counter',
          status: PosRegisterSessionStatus.CLOSED,
          openedAt: new Date('2026-05-01T10:15:00.000Z'),
          closedAt: new Date('2026-05-01T12:00:00.000Z'),
          openingFloat: null,
          closingFloat: null,
        },
        {
          id: 3,
          registerId: 'front-counter',
          status: PosRegisterSessionStatus.OPEN,
          openedAt: new Date('2026-05-01T13:00:00.000Z'),
          closedAt: null,
          openingFloat: null,
          closingFloat: null,
        },
      ]),
    );
    expensesRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          amount: 20,
          category: 'UTILITIES',
          occurredAt: new Date('2026-05-01T12:30:00.000Z'),
        },
      ]),
    );
    fixedAssetsRepo.createQueryBuilder.mockReturnValue(createBuilder([]));
    depreciationEntriesRepo.createQueryBuilder.mockReturnValue(
      createBuilder([]),
    );
    accruedLiabilitiesRepo.createQueryBuilder.mockReturnValue(
      createBuilder([]),
    );
    longTermDebtRepo.createQueryBuilder.mockReturnValue(createBuilder([]));
    purchaseOrdersRepo.createQueryBuilder.mockReturnValue(createBuilder([]));
    purchaseOrderItemsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([], true),
    );

    const report = await service.getBalanceSheet(44, {
      asOfAt: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(report.assets.cash).toBe(165);
    expect(report.assets.tenderClearing).toBe(200);
    expect(report.assets.total).toBe(365);
    expect(report.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('register sessions were estimated'),
        expect.stringContaining('Tender clearing includes non-cash tenders'),
        expect.stringContaining('linked register session'),
      ]),
    );
  });

  it('balances the trial balance with tender clearing and pre-earnings owner capital', async () => {
    const {
      service,
      checkoutsRepo,
      registerSessionsRepo,
      purchaseOrdersRepo,
      purchaseOrderItemsRepo,
      expensesRepo,
      fixedAssetsRepo,
      depreciationEntriesRepo,
      accruedLiabilitiesRepo,
      longTermDebtRepo,
    } = createService();

    checkoutsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          id: 1,
          currency: 'ETB',
          total: 100,
          status: PosCheckoutStatus.PROCESSED,
          transactionType: PosCheckoutTransactionType.SALE,
          registerSessionId: 1,
          tenders: [{ method: 'CASH', amount: 100 }],
          items: [],
        },
        {
          id: 2,
          currency: 'ETB',
          total: 200,
          status: PosCheckoutStatus.PROCESSED,
          transactionType: PosCheckoutTransactionType.SALE,
          registerSessionId: 1,
          tenders: [{ method: 'MOBILE_MONEY', amount: 200 }],
          items: [],
        },
      ]),
    );
    registerSessionsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          id: 1,
          registerId: 'front-counter',
          status: PosRegisterSessionStatus.CLOSED,
          openedAt: new Date('2026-05-01T08:00:00.000Z'),
          closedAt: new Date('2026-05-01T10:00:00.000Z'),
          openingFloat: null,
          closingFloat: null,
        },
      ]),
    );
    expensesRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          amount: 20,
          category: 'UTILITIES',
          occurredAt: new Date('2026-05-01T10:30:00.000Z'),
        },
      ]),
    );
    fixedAssetsRepo.createQueryBuilder.mockReturnValue(createBuilder([]));
    depreciationEntriesRepo.createQueryBuilder.mockReturnValue(
      createBuilder([]),
    );
    accruedLiabilitiesRepo.createQueryBuilder.mockReturnValue(
      createBuilder([]),
    );
    longTermDebtRepo.createQueryBuilder.mockReturnValue(createBuilder([]));
    purchaseOrdersRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          total: 30,
        },
      ]),
    );
    purchaseOrderItemsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([], true),
    );

    const report = await service.getTrialBalance(44, {
      asOfAt: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(report.balanced).toBe(true);
    expect(report.totals.debit).toBe(report.totals.credit);
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: 'Tender Clearing / Receivables',
          debit: 200,
          credit: 0,
        }),
        expect.objectContaining({
          account: 'Owner Capital / retained earnings',
          debit: 30,
          credit: 0,
        }),
      ]),
    );
  });

  it('separates checkout tax from earned revenue and carries it into tax payable', async () => {
    const {
      service,
      checkoutsRepo,
      registerSessionsRepo,
      purchaseOrdersRepo,
      purchaseOrderItemsRepo,
      expensesRepo,
      fixedAssetsRepo,
      depreciationEntriesRepo,
      accruedLiabilitiesRepo,
      longTermDebtRepo,
    } = createService();

    checkoutsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          id: 1,
          currency: 'ETB',
          subtotal: 100,
          discountAmount: 0,
          taxAmount: 15,
          total: 115,
          status: PosCheckoutStatus.PROCESSED,
          transactionType: PosCheckoutTransactionType.SALE,
          registerSessionId: 1,
          tenders: [{ method: 'CASH', amount: 115 }],
          items: [
            {
              productId: 9,
              quantity: 1,
              unitPrice: 100,
              taxAmount: 15,
              lineTotal: 115,
            },
          ],
        },
      ]),
    );
    registerSessionsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          id: 1,
          registerId: 'front-counter',
          status: PosRegisterSessionStatus.CLOSED,
          openedAt: new Date('2026-05-01T08:00:00.000Z'),
          closedAt: new Date('2026-05-01T10:00:00.000Z'),
          openingFloat: 0,
          closingFloat: 115,
        },
      ]),
    );
    expensesRepo.createQueryBuilder.mockReturnValue(createBuilder([]));
    fixedAssetsRepo.createQueryBuilder.mockReturnValue(createBuilder([]));
    depreciationEntriesRepo.createQueryBuilder.mockReturnValue(
      createBuilder([]),
    );
    accruedLiabilitiesRepo.createQueryBuilder.mockReturnValue(
      createBuilder([]),
    );
    longTermDebtRepo.createQueryBuilder.mockReturnValue(createBuilder([]));
    purchaseOrdersRepo.createQueryBuilder.mockReturnValue(createBuilder([]));
    purchaseOrderItemsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([], true),
    );

    const profitAndLoss = await service.getProfitAndLoss(44, {
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-05-01T18:00:00.000Z'),
    });
    const balanceSheet = await service.getBalanceSheet(44, {
      asOfAt: new Date('2026-05-01T18:00:00.000Z'),
    });
    const trialBalance = await service.getTrialBalance(44, {
      asOfAt: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(profitAndLoss.revenue.gross).toBe(115);
    expect(profitAndLoss.revenue.tax).toBe(15);
    expect(profitAndLoss.revenue.net).toBe(100);
    expect(balanceSheet.liabilities.taxPayable).toBe(15);
    expect(balanceSheet.equity).toBe(100);
    expect(trialBalance.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: 'Sales Tax Payable',
          debit: 0,
          credit: 15,
        }),
        expect.objectContaining({
          account: 'Sales Revenue',
          debit: 0,
          credit: 100,
        }),
      ]),
    );
  });

  it('classifies current and non-current assets and liabilities from the new accounting models', async () => {
    const {
      service,
      checkoutsRepo,
      registerSessionsRepo,
      purchaseOrdersRepo,
      purchaseOrderItemsRepo,
      expensesRepo,
      fixedAssetsRepo,
      depreciationEntriesRepo,
      accruedLiabilitiesRepo,
      longTermDebtRepo,
    } = createService();

    checkoutsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          id: 1,
          currency: 'ETB',
          taxAmount: 15,
          total: 115,
          status: PosCheckoutStatus.PROCESSED,
          transactionType: PosCheckoutTransactionType.SALE,
          registerSessionId: 1,
          tenders: [
            { method: 'CASH', amount: 15 },
            { method: 'MOBILE_MONEY', amount: 100 },
          ],
          items: [],
        },
      ]),
    );
    registerSessionsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          id: 1,
          registerId: 'front-counter',
          status: PosRegisterSessionStatus.CLOSED,
          openedAt: new Date('2026-05-01T08:00:00.000Z'),
          closedAt: new Date('2026-05-01T10:00:00.000Z'),
          openingFloat: 0,
          closingFloat: 15,
        },
      ]),
    );
    expensesRepo.createQueryBuilder.mockReturnValue(createBuilder([]));
    purchaseOrdersRepo.createQueryBuilder.mockReturnValue(
      createBuilder([{ total: 40 }]),
    );
    purchaseOrderItemsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([], true),
    );
    fixedAssetsRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          id: 31,
          capitalizationAmount: 1000,
          salvageValue: 100,
        },
      ]),
    );
    depreciationEntriesRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          fixedAssetId: 31,
          amount: 300,
        },
      ]),
    );
    accruedLiabilitiesRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          amount: 60,
          dueAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        {
          amount: 140,
          dueAt: new Date('2027-09-01T00:00:00.000Z'),
        },
      ]),
    );
    longTermDebtRepo.createQueryBuilder.mockReturnValue(
      createBuilder([
        {
          outstandingPrincipal: 500,
          currentPortionAmount: 120,
          maturityAt: new Date('2028-05-01T00:00:00.000Z'),
        },
      ]),
    );

    const balanceSheet = await service.getBalanceSheet(44, {
      asOfAt: new Date('2026-05-01T18:00:00.000Z'),
    });
    const trialBalance = await service.getTrialBalance(44, {
      asOfAt: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(balanceSheet.assets.current.total).toBe(115);
    expect(balanceSheet.assets.nonCurrent.fixedAssetsGross).toBe(1000);
    expect(balanceSheet.assets.nonCurrent.accumulatedDepreciation).toBe(300);
    expect(balanceSheet.assets.nonCurrent.fixedAssetsNet).toBe(700);
    expect(balanceSheet.assets.total).toBe(815);
    expect(balanceSheet.liabilities.current.total).toBe(235);
    expect(balanceSheet.liabilities.current.accruedLiabilities).toBe(60);
    expect(balanceSheet.liabilities.current.currentPortionLongTermDebt).toBe(
      120,
    );
    expect(balanceSheet.liabilities.nonCurrent.total).toBe(520);
    expect(balanceSheet.liabilities.nonCurrent.accruedLiabilities).toBe(140);
    expect(balanceSheet.liabilities.nonCurrent.longTermDebt).toBe(380);
    expect(balanceSheet.liabilities.total).toBe(755);
    expect(balanceSheet.equity).toBe(60);
    expect(trialBalance.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: 'Fixed Assets',
          debit: 1000,
          credit: 0,
        }),
        expect.objectContaining({
          account: 'Accumulated Depreciation',
          debit: 0,
          credit: 300,
        }),
        expect.objectContaining({
          account: 'Accrued Liabilities - Current',
          debit: 0,
          credit: 60,
        }),
        expect.objectContaining({
          account: 'Long-Term Debt',
          debit: 0,
          credit: 380,
        }),
      ]),
    );
  });
});
