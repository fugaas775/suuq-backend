import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PosCheckout,
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from '../pos-sync/entities/pos-checkout.entity';
import {
  PosRegisterSession,
  PosRegisterSessionStatus,
} from '../pos-sync/entities/pos-register-session.entity';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import {
  BranchAccruedLiability,
  BranchAccruedLiabilityStatus,
} from './entities/branch-accrued-liability.entity';
import { BranchDepreciationEntry } from './entities/branch-depreciation-entry.entity';
import { BranchExpense } from '../billing/entities/branch-expense.entity';
import {
  BranchFixedAsset,
  BranchFixedAssetStatus,
} from './entities/branch-fixed-asset.entity';
import {
  BranchLongTermDebt,
  BranchLongTermDebtStatus,
} from './entities/branch-long-term-debt.entity';

interface ReportRange {
  from?: Date | null;
  to?: Date | null;
}

interface AsOfRange {
  asOfAt?: Date | null;
}

export interface ProfitAndLossReport {
  branchId: number;
  range: { from: Date | null; to: Date | null };
  revenue: { gross: number; voided: number; tax: number; net: number };
  cogs: number;
  grossProfit: number;
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  netProfit: number;
  currency: string;
  notes: string[];
}

export interface BalanceSheetReport {
  branchId: number;
  asOfAt: Date;
  assets: {
    current: {
      cash: number;
      tenderClearing: number;
      inventoryValue: number;
      total: number;
    };
    nonCurrent: {
      fixedAssetsGross: number;
      accumulatedDepreciation: number;
      fixedAssetsNet: number;
      total: number;
    };
    cash: number;
    tenderClearing: number;
    inventoryValue: number;
    fixedAssetsGross: number;
    accumulatedDepreciation: number;
    fixedAssetsNet: number;
    total: number;
  };
  liabilities: {
    current: {
      supplierPayables: number;
      taxPayable: number;
      accruedLiabilities: number;
      currentPortionLongTermDebt: number;
      total: number;
    };
    nonCurrent: {
      accruedLiabilities: number;
      longTermDebt: number;
      total: number;
    };
    supplierPayables: number;
    taxPayable: number;
    accruedLiabilities: number;
    currentPortionLongTermDebt: number;
    longTermDebt: number;
    total: number;
  };
  equity: number;
  currency: string;
  notes: string[];
}

export interface TrialBalanceReport {
  branchId: number;
  asOfAt: Date;
  lines: { account: string; debit: number; credit: number }[];
  totals: { debit: number; credit: number };
  balanced: boolean;
  currency: string;
}

@Injectable()
export class BranchFinancialReportsService {
  constructor(
    @InjectRepository(PosCheckout)
    private readonly checkoutsRepo: Repository<PosCheckout>,
    @InjectRepository(PosRegisterSession)
    private readonly registerSessionsRepo: Repository<PosRegisterSession>,
    @InjectRepository(BranchInventory)
    private readonly inventoryRepo: Repository<BranchInventory>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemsRepo: Repository<PurchaseOrderItem>,
    @InjectRepository(BranchExpense)
    private readonly expensesRepo: Repository<BranchExpense>,
    @InjectRepository(BranchFixedAsset)
    private readonly fixedAssetsRepo: Repository<BranchFixedAsset>,
    @InjectRepository(BranchDepreciationEntry)
    private readonly depreciationEntriesRepo: Repository<BranchDepreciationEntry>,
    @InjectRepository(BranchAccruedLiability)
    private readonly accruedLiabilitiesRepo: Repository<BranchAccruedLiability>,
    @InjectRepository(BranchLongTermDebt)
    private readonly longTermDebtRepo: Repository<BranchLongTermDebt>,
  ) {}

  // ---------------------------------------------------------------------------
  // Profit & Loss
  // ---------------------------------------------------------------------------

  async getProfitAndLoss(
    branchId: number,
    range: ReportRange = {},
  ): Promise<ProfitAndLossReport> {
    const from = range.from ?? null;
    const to = range.to ?? null;

    const checkouts = await this.findCheckouts(branchId, from, to);
    let gross = 0;
    let voided = 0;
    let tax = 0;
    const itemsByProduct = new Map<number, number>();
    let currency = 'ETB';

    for (const checkout of checkouts) {
      currency = checkout.currency || currency;
      const total = Number(checkout.total) || 0;
      const taxAmount = this.getCheckoutTaxAmount(checkout);
      const sign = this.getCheckoutSign(checkout);
      if (
        checkout.status === PosCheckoutStatus.VOIDED ||
        checkout.status === PosCheckoutStatus.FAILED
      ) {
        voided += total;
        continue;
      }
      gross += sign * total;
      tax += sign * taxAmount;
      for (const item of checkout.items || []) {
        if (!item || item.productId == null) continue;
        const prev = itemsByProduct.get(item.productId) || 0;
        itemsByProduct.set(
          item.productId,
          prev + sign * (Number(item.quantity) || 0),
        );
      }
    }

    const wacByProduct = await this.computeWeightedAverageCosts(
      branchId,
      Array.from(itemsByProduct.keys()),
    );
    let cogs = 0;
    for (const [productId, qty] of itemsByProduct) {
      const wac = wacByProduct.get(productId) || 0;
      cogs += wac * qty;
    }

    const expenses = await this.findExpenses(branchId, from, to);
    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;
    for (const exp of expenses) {
      const amount = Number(exp.amount) || 0;
      expensesByCategory[exp.category] =
        (expensesByCategory[exp.category] || 0) + amount;
      totalExpenses += amount;
    }

    const netRevenue = gross - tax;
    const grossProfit = netRevenue - cogs;
    const netProfit = grossProfit - totalExpenses;

    const notes: string[] = [];
    if (!checkouts.length) notes.push('No POS checkouts in range.');
    if (!wacByProduct.size && itemsByProduct.size) {
      notes.push(
        'Cost-of-goods-sold is 0 because no purchase-order history was found for the items sold.',
      );
    }
    if (!expenses.length) notes.push('No branch expenses recorded in range.');
    if (Math.abs(tax) >= 0.01) {
      notes.push(
        'Sales tax is shown separately from sales revenue so the branch can distinguish tax collected on behalf of the government from earned revenue.',
      );
    }

    return {
      branchId,
      range: { from, to },
      revenue: { gross, voided, tax, net: netRevenue },
      cogs,
      grossProfit,
      expensesByCategory,
      totalExpenses,
      netProfit,
      currency,
      notes,
    };
  }

  // ---------------------------------------------------------------------------
  // Balance Sheet
  // ---------------------------------------------------------------------------

  async getBalanceSheet(
    branchId: number,
    range: AsOfRange = {},
  ): Promise<BalanceSheetReport> {
    const asOfAt = range.asOfAt ?? new Date();

    const checkouts = await this.findCheckouts(branchId, null, asOfAt);
    let currency = 'ETB';
    let taxPayable = 0;
    checkouts.forEach((checkout) => {
      currency = checkout.currency || currency;
      if (
        checkout.status === PosCheckoutStatus.VOIDED ||
        checkout.status === PosCheckoutStatus.FAILED
      ) {
        return;
      }

      taxPayable +=
        this.getCheckoutSign(checkout) * this.getCheckoutTaxAmount(checkout);
    });

    const {
      cashOnHand,
      tenderClearing,
      notes: cashNotes,
    } = await this.computeLiquidAssetBalances(branchId, asOfAt, checkouts);

    const expenses = await this.findExpenses(branchId, null, asOfAt);
    const cashOut = expenses.reduce(
      (sum, exp) => sum + (Number(exp.amount) || 0),
      0,
    );
    const cash = Math.max(0, cashOnHand - cashOut);

    // Inventory value: sum(quantityOnHand × WAC) for current branch_inventory.
    const inventory = await this.inventoryRepo.find({
      where: { branchId } as any,
    });
    const productIds = inventory.map((row) => row.productId);
    const wacByProduct = await this.computeWeightedAverageCosts(
      branchId,
      productIds,
    );
    let inventoryValue = 0;
    for (const row of inventory) {
      const wac = wacByProduct.get(row.productId) || 0;
      inventoryValue += wac * (Number(row.quantityOnHand) || 0);
    }

    const fixedAssetSnapshot = await this.computeFixedAssetSnapshot(
      branchId,
      asOfAt,
    );

    // Supplier payables: open POs (SHIPPED or RECEIVED) totals.
    const openPos = await this.purchaseOrdersRepo
      .createQueryBuilder('po')
      .where('po.branchId = :branchId', { branchId })
      .andWhere('po.status IN (:...statuses)', {
        statuses: [PurchaseOrderStatus.SHIPPED, PurchaseOrderStatus.RECEIVED],
      })
      .andWhere('po.createdAt <= :asOfAt', { asOfAt })
      .getMany();
    const supplierPayables = openPos.reduce(
      (sum, po) => sum + (Number(po.total) || 0),
      0,
    );

    const accruedLiabilitySnapshot = await this.computeAccruedLiabilitySnapshot(
      branchId,
      asOfAt,
    );
    const longTermDebtSnapshot = await this.computeLongTermDebtSnapshot(
      branchId,
      asOfAt,
    );

    const currentAssetsTotal = cash + tenderClearing + inventoryValue;
    const nonCurrentAssetsTotal = fixedAssetSnapshot.fixedAssetsNet;
    const totalAssets = currentAssetsTotal + nonCurrentAssetsTotal;
    const normalizedTaxPayable = Math.max(0, taxPayable);
    const currentLiabilitiesTotal =
      supplierPayables +
      normalizedTaxPayable +
      accruedLiabilitySnapshot.current +
      longTermDebtSnapshot.currentPortion;
    const nonCurrentLiabilitiesTotal =
      accruedLiabilitySnapshot.nonCurrent + longTermDebtSnapshot.nonCurrent;
    const totalLiabilities =
      currentLiabilitiesTotal + nonCurrentLiabilitiesTotal;
    const equity = totalAssets - totalLiabilities;

    const notes: string[] = [...cashNotes];
    notes.push(
      'Cash chains register-session floats forward per register and then subtracts recorded branch expenses; tender clearing holds non-cash tenders until treasury settlement is modeled separately.',
    );
    if (normalizedTaxPayable > 0) {
      notes.push(
        'Tax payable reflects checkout tax collected up to the snapshot date and is kept separate from sales revenue.',
      );
    }
    if (fixedAssetSnapshot.fixedAssetsNet > 0) {
      notes.push(
        'Non-current assets are shown at net book value: capitalization amount less recorded depreciation through the snapshot date.',
      );
    }
    if (
      accruedLiabilitySnapshot.current > 0 ||
      accruedLiabilitySnapshot.nonCurrent > 0 ||
      longTermDebtSnapshot.total > 0
    ) {
      notes.push(
        'Liabilities are split between current and non-current based on due dates and the current portion recorded against each long-term debt.',
      );
    }
    if (!inventory.length) notes.push('No inventory on hand for this branch.');
    if (!openPos.length) notes.push('No open supplier purchase orders.');

    return {
      branchId,
      asOfAt,
      assets: {
        current: {
          cash,
          tenderClearing,
          inventoryValue,
          total: currentAssetsTotal,
        },
        nonCurrent: {
          fixedAssetsGross: fixedAssetSnapshot.fixedAssetsGross,
          accumulatedDepreciation: fixedAssetSnapshot.accumulatedDepreciation,
          fixedAssetsNet: fixedAssetSnapshot.fixedAssetsNet,
          total: nonCurrentAssetsTotal,
        },
        cash,
        tenderClearing,
        inventoryValue,
        fixedAssetsGross: fixedAssetSnapshot.fixedAssetsGross,
        accumulatedDepreciation: fixedAssetSnapshot.accumulatedDepreciation,
        fixedAssetsNet: fixedAssetSnapshot.fixedAssetsNet,
        total: totalAssets,
      },
      liabilities: {
        current: {
          supplierPayables,
          taxPayable: normalizedTaxPayable,
          accruedLiabilities: accruedLiabilitySnapshot.current,
          currentPortionLongTermDebt: longTermDebtSnapshot.currentPortion,
          total: currentLiabilitiesTotal,
        },
        nonCurrent: {
          accruedLiabilities: accruedLiabilitySnapshot.nonCurrent,
          longTermDebt: longTermDebtSnapshot.nonCurrent,
          total: nonCurrentLiabilitiesTotal,
        },
        supplierPayables,
        taxPayable: normalizedTaxPayable,
        accruedLiabilities:
          accruedLiabilitySnapshot.current +
          accruedLiabilitySnapshot.nonCurrent,
        currentPortionLongTermDebt: longTermDebtSnapshot.currentPortion,
        longTermDebt: longTermDebtSnapshot.total,
        total: totalLiabilities,
      },
      equity,
      currency,
      notes,
    };
  }

  // ---------------------------------------------------------------------------
  // Trial Balance (derived from P&L + BS — pseudo double-entry)
  // ---------------------------------------------------------------------------

  async getTrialBalance(
    branchId: number,
    range: AsOfRange = {},
  ): Promise<TrialBalanceReport> {
    const asOfAt = range.asOfAt ?? new Date();
    const pl = await this.getProfitAndLoss(branchId, {
      from: null,
      to: asOfAt,
    });
    const bs = await this.getBalanceSheet(branchId, { asOfAt });

    const ownerCapitalBase = bs.equity - pl.netProfit;
    const lines = [
      { account: 'Cash', debit: bs.assets.cash, credit: 0 },
      {
        account: 'Tender Clearing / Receivables',
        debit: bs.assets.tenderClearing,
        credit: 0,
      },
      { account: 'Inventory', debit: bs.assets.inventoryValue, credit: 0 },
      {
        account: 'Supplier Payables',
        debit: 0,
        credit: bs.liabilities.supplierPayables,
      },
      {
        account: 'Sales Tax Payable',
        debit: 0,
        credit: bs.liabilities.taxPayable,
      },
      {
        account: 'Accrued Liabilities - Current',
        debit: 0,
        credit: bs.liabilities.current.accruedLiabilities,
      },
      {
        account: 'Current Portion of Long-Term Debt',
        debit: 0,
        credit: bs.liabilities.current.currentPortionLongTermDebt,
      },
      {
        account: 'Fixed Assets',
        debit: bs.assets.fixedAssetsGross,
        credit: 0,
      },
      {
        account: 'Accumulated Depreciation',
        debit: 0,
        credit: bs.assets.accumulatedDepreciation,
      },
      {
        account: 'Accrued Liabilities - Non-current',
        debit: 0,
        credit: bs.liabilities.nonCurrent.accruedLiabilities,
      },
      {
        account: 'Long-Term Debt',
        debit: 0,
        credit: bs.liabilities.nonCurrent.longTermDebt,
      },
      { account: 'Sales Revenue', debit: 0, credit: pl.revenue.net },
      { account: 'Cost of Goods Sold', debit: pl.cogs, credit: 0 },
      ...Object.entries(pl.expensesByCategory).map(([category, amount]) => ({
        account: `Expense: ${category}`,
        debit: amount,
        credit: 0,
      })),
      {
        account: 'Owner Capital / retained earnings',
        debit: ownerCapitalBase < 0 ? Math.abs(ownerCapitalBase) : 0,
        credit: ownerCapitalBase > 0 ? ownerCapitalBase : 0,
      },
    ];

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    return {
      branchId,
      asOfAt,
      lines,
      totals: { debit: totalDebit, credit: totalCredit },
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      currency: bs.currency,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findCheckouts(
    branchId: number,
    from: Date | null,
    to: Date | null,
  ): Promise<PosCheckout[]> {
    const qb = this.checkoutsRepo
      .createQueryBuilder('c')
      .where('c.branchId = :branchId', { branchId })
      .orderBy('c.occurredAt', 'ASC');
    if (from) qb.andWhere('c.occurredAt >= :from', { from });
    if (to) qb.andWhere('c.occurredAt <= :to', { to });
    return qb.getMany();
  }

  private async findExpenses(
    branchId: number,
    from: Date | null,
    to: Date | null,
  ): Promise<BranchExpense[]> {
    const qb = this.expensesRepo
      .createQueryBuilder('e')
      .where('e.branchId = :branchId', { branchId });
    if (from) qb.andWhere('e.occurredAt >= :from', { from });
    if (to) qb.andWhere('e.occurredAt <= :to', { to });
    return qb.orderBy('e.occurredAt', 'ASC').getMany();
  }

  private async findRegisterSessions(
    branchId: number,
    asOfAt: Date,
  ): Promise<PosRegisterSession[]> {
    return this.registerSessionsRepo
      .createQueryBuilder('s')
      .where('s.branchId = :branchId', { branchId })
      .andWhere('s.openedAt <= :asOfAt', { asOfAt })
      .orderBy('s.openedAt', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .getMany();
  }

  private async computeLiquidAssetBalances(
    branchId: number,
    asOfAt: Date,
    checkouts: PosCheckout[],
  ): Promise<{
    cashOnHand: number;
    tenderClearing: number;
    notes: string[];
  }> {
    const sessions = await this.findRegisterSessions(branchId, asOfAt);
    const sessionIds = new Set(sessions.map((session) => Number(session.id)));
    const cashBySessionId = new Map<number, number>();
    let orphanCash = 0;
    let tenderClearing = 0;

    for (const checkout of checkouts) {
      if (
        checkout.status === PosCheckoutStatus.VOIDED ||
        checkout.status === PosCheckoutStatus.FAILED
      ) {
        continue;
      }

      const cashAmount = this.sumTenderAmount(checkout, true);
      const nonCashAmount = this.sumTenderAmount(checkout, false);
      tenderClearing += nonCashAmount;

      if (Math.abs(cashAmount) < 0.0001) {
        continue;
      }

      const sessionId = Number(checkout.registerSessionId || 0);
      if (sessionId && sessionIds.has(sessionId)) {
        cashBySessionId.set(
          sessionId,
          (cashBySessionId.get(sessionId) || 0) + cashAmount,
        );
        continue;
      }

      orphanCash += cashAmount;
    }

    const carryByRegister = new Map<string, number>();
    let estimatedCarryForwardCount = 0;

    for (const session of sessions) {
      const registerKey = String(session.registerId || `session-${session.id}`);
      const carriedOpening = carryByRegister.get(registerKey) || 0;
      const openingFloat =
        session.openingFloat != null
          ? Number(session.openingFloat) || 0
          : carriedOpening;
      const expectedCash =
        openingFloat + (cashBySessionId.get(Number(session.id)) || 0);
      const closedByAsOf =
        session.status === PosRegisterSessionStatus.CLOSED &&
        session.closedAt != null &&
        session.closedAt <= asOfAt;
      const closingFloat =
        closedByAsOf && session.closingFloat != null
          ? Number(session.closingFloat) || 0
          : expectedCash;

      if (
        session.openingFloat == null ||
        (closedByAsOf && session.closingFloat == null)
      ) {
        estimatedCarryForwardCount += 1;
      }

      carryByRegister.set(registerKey, closingFloat);
    }

    const cashOnHand =
      Array.from(carryByRegister.values()).reduce(
        (sum, value) => sum + value,
        0,
      ) + orphanCash;

    const notes: string[] = [];
    if (estimatedCarryForwardCount > 0) {
      notes.push(
        'Some register sessions were estimated from opening float plus session cash because a starting or closing drawer count was not recorded.',
      );
    }
    if (Math.abs(orphanCash) >= 0.01) {
      notes.push(
        'Cash checkouts without a linked register session are added directly to the branch cash estimate.',
      );
    }
    if (Math.abs(tenderClearing) >= 0.01) {
      notes.push(
        'Tender clearing includes non-cash tenders such as mobile money, card, and on-account activity that is not yet mapped to a treasury settlement account.',
      );
    }

    return {
      cashOnHand,
      tenderClearing: Math.max(0, tenderClearing),
      notes,
    };
  }

  private sumTenderAmount(checkout: PosCheckout, cashOnly: boolean): number {
    const sign = this.getCheckoutSign(checkout);

    return (checkout.tenders || []).reduce((sum, tender) => {
      if (!tender) {
        return sum;
      }

      const method = String(tender.method || '').toUpperCase();
      const isCash = method.includes('CASH');
      if (cashOnly ? !isCash : isCash) {
        return sum;
      }

      return sum + sign * (Number(tender.amount) || 0);
    }, 0);
  }

  private getCheckoutSign(checkout: PosCheckout): number {
    return checkout.transactionType === PosCheckoutTransactionType.RETURN
      ? -1
      : 1;
  }

  private getCheckoutTaxAmount(checkout: PosCheckout): number {
    const checkoutTax = Number(checkout.taxAmount) || 0;
    if (checkoutTax > 0) {
      return checkoutTax;
    }

    return (checkout.items || []).reduce(
      (sum, item) => sum + (Number(item?.taxAmount) || 0),
      0,
    );
  }

  private async computeFixedAssetSnapshot(
    branchId: number,
    asOfAt: Date,
  ): Promise<{
    fixedAssetsGross: number;
    accumulatedDepreciation: number;
    fixedAssetsNet: number;
  }> {
    const fixedAssets = await this.fixedAssetsRepo
      .createQueryBuilder('fa')
      .where('fa.branchId = :branchId', { branchId })
      .andWhere('fa.acquiredAt <= :asOfAt', { asOfAt })
      .andWhere(
        '(fa.status = :activeStatus OR (fa.disposedAt IS NOT NULL AND fa.disposedAt > :asOfAt))',
        {
          activeStatus: BranchFixedAssetStatus.ACTIVE,
          asOfAt,
        },
      )
      .orderBy('fa.acquiredAt', 'ASC')
      .getMany();

    if (!fixedAssets.length) {
      return {
        fixedAssetsGross: 0,
        accumulatedDepreciation: 0,
        fixedAssetsNet: 0,
      };
    }

    const assetIds = fixedAssets.map((asset) => Number(asset.id));
    const depreciationEntries = await this.depreciationEntriesRepo
      .createQueryBuilder('dep')
      .where('dep.branchId = :branchId', { branchId })
      .andWhere('dep.fixedAssetId IN (:...assetIds)', { assetIds })
      .andWhere('dep.occurredAt <= :asOfAt', { asOfAt })
      .orderBy('dep.occurredAt', 'ASC')
      .getMany();

    const depreciationByAssetId = new Map<number, number>();
    depreciationEntries.forEach((entry) => {
      const fixedAssetId = Number(entry.fixedAssetId);
      depreciationByAssetId.set(
        fixedAssetId,
        (depreciationByAssetId.get(fixedAssetId) || 0) +
          (Number(entry.amount) || 0),
      );
    });

    let fixedAssetsGross = 0;
    let accumulatedDepreciation = 0;
    let fixedAssetsNet = 0;

    fixedAssets.forEach((asset) => {
      const capitalizationAmount = Number(asset.capitalizationAmount) || 0;
      const salvageValue = Number(asset.salvageValue) || 0;
      const maxDepreciation = Math.max(0, capitalizationAmount - salvageValue);
      const postedDepreciation =
        depreciationByAssetId.get(Number(asset.id)) || 0;
      const effectiveDepreciation = Math.min(
        maxDepreciation,
        postedDepreciation,
      );
      const netBookValue = Math.max(
        salvageValue,
        capitalizationAmount - effectiveDepreciation,
      );

      fixedAssetsGross += capitalizationAmount;
      accumulatedDepreciation += effectiveDepreciation;
      fixedAssetsNet += netBookValue;
    });

    return {
      fixedAssetsGross,
      accumulatedDepreciation,
      fixedAssetsNet,
    };
  }

  private async computeAccruedLiabilitySnapshot(
    branchId: number,
    asOfAt: Date,
  ): Promise<{ current: number; nonCurrent: number }> {
    const liabilities = await this.accruedLiabilitiesRepo
      .createQueryBuilder('al')
      .where('al.branchId = :branchId', { branchId })
      .andWhere('al.accruedAt <= :asOfAt', { asOfAt })
      .andWhere('al.status = :status', {
        status: BranchAccruedLiabilityStatus.OPEN,
      })
      .andWhere('(al.settledAt IS NULL OR al.settledAt > :asOfAt)', { asOfAt })
      .orderBy('al.accruedAt', 'ASC')
      .getMany();

    const currentBoundary = new Date(asOfAt);
    currentBoundary.setFullYear(currentBoundary.getFullYear() + 1);

    return liabilities.reduce(
      (snapshot, liability) => {
        const amount = Number(liability.amount) || 0;
        const dueAt = liability.dueAt ? new Date(liability.dueAt) : null;
        if (!dueAt || dueAt <= currentBoundary) {
          snapshot.current += amount;
        } else {
          snapshot.nonCurrent += amount;
        }
        return snapshot;
      },
      { current: 0, nonCurrent: 0 },
    );
  }

  private async computeLongTermDebtSnapshot(
    branchId: number,
    asOfAt: Date,
  ): Promise<{ currentPortion: number; nonCurrent: number; total: number }> {
    const debts = await this.longTermDebtRepo
      .createQueryBuilder('debt')
      .where('debt.branchId = :branchId', { branchId })
      .andWhere('debt.issuedAt <= :asOfAt', { asOfAt })
      .andWhere('debt.status = :status', {
        status: BranchLongTermDebtStatus.ACTIVE,
      })
      .andWhere('(debt.settledAt IS NULL OR debt.settledAt > :asOfAt)', {
        asOfAt,
      })
      .orderBy('debt.issuedAt', 'ASC')
      .getMany();

    const currentBoundary = new Date(asOfAt);
    currentBoundary.setFullYear(currentBoundary.getFullYear() + 1);

    return debts.reduce(
      (snapshot, debt) => {
        const outstandingPrincipal = Number(debt.outstandingPrincipal) || 0;
        const configuredCurrentPortion = Number(debt.currentPortionAmount) || 0;
        const maturesWithinYear =
          debt.maturityAt != null &&
          new Date(debt.maturityAt) <= currentBoundary;
        const currentPortion = Math.min(
          outstandingPrincipal,
          configuredCurrentPortion > 0
            ? configuredCurrentPortion
            : maturesWithinYear
              ? outstandingPrincipal
              : 0,
        );
        const nonCurrent = Math.max(0, outstandingPrincipal - currentPortion);

        snapshot.currentPortion += currentPortion;
        snapshot.nonCurrent += nonCurrent;
        snapshot.total += outstandingPrincipal;
        return snapshot;
      },
      { currentPortion: 0, nonCurrent: 0, total: 0 },
    );
  }

  /**
   * Weighted average cost per product, derived from purchase-order items received
   * for this branch. Falls back to 0 for products with no PO history.
   */
  private async computeWeightedAverageCosts(
    branchId: number,
    productIds: number[],
  ): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (!productIds.length) return result;

    const rows: { productId: number; cost: string }[] =
      await this.purchaseOrderItemsRepo
        .createQueryBuilder('item')
        .innerJoin('item.purchaseOrder', 'po', 'po.branchId = :branchId', {
          branchId,
        })
        .select('item.productId', 'productId')
        .addSelect(
          'SUM(item.unitPrice * GREATEST(item.receivedQuantity, item.orderedQuantity))',
          'totalCost',
        )
        .addSelect(
          'SUM(GREATEST(item.receivedQuantity, item.orderedQuantity))',
          'totalQty',
        )
        .where('item.productId IN (:...productIds)', { productIds })
        .groupBy('item.productId')
        .getRawMany();

    for (const row of rows as any[]) {
      const productId = Number(row.productId);
      const totalCost = Number(row.totalCost) || 0;
      const totalQty = Number(row.totalQty) || 0;
      if (totalQty > 0) {
        result.set(productId, totalCost / totalQty);
      }
    }
    return result;
  }
}
