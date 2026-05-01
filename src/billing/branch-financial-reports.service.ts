import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PosCheckout,
  PosCheckoutStatus,
} from '../pos-sync/entities/pos-checkout.entity';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import { BranchExpense } from '../billing/entities/branch-expense.entity';

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
  revenue: { gross: number; voided: number; net: number };
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
    cash: number;
    inventoryValue: number;
    total: number;
  };
  liabilities: {
    supplierPayables: number;
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
    @InjectRepository(BranchInventory)
    private readonly inventoryRepo: Repository<BranchInventory>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemsRepo: Repository<PurchaseOrderItem>,
    @InjectRepository(BranchExpense)
    private readonly expensesRepo: Repository<BranchExpense>,
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
    const itemsByProduct = new Map<number, number>();
    let currency = 'ETB';

    for (const checkout of checkouts) {
      currency = checkout.currency || currency;
      const total = Number(checkout.total) || 0;
      if (
        checkout.status === PosCheckoutStatus.VOIDED ||
        checkout.status === PosCheckoutStatus.FAILED
      ) {
        voided += total;
        continue;
      }
      gross += total;
      for (const item of checkout.items || []) {
        if (!item || item.productId == null) continue;
        const prev = itemsByProduct.get(item.productId) || 0;
        itemsByProduct.set(item.productId, prev + (Number(item.quantity) || 0));
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

    const grossProfit = gross - cogs;
    const netProfit = grossProfit - totalExpenses;

    const notes: string[] = [];
    if (!checkouts.length) notes.push('No POS checkouts in range.');
    if (!wacByProduct.size && itemsByProduct.size) {
      notes.push(
        'Cost-of-goods-sold is 0 because no purchase-order history was found for the items sold.',
      );
    }
    if (!expenses.length) notes.push('No branch expenses recorded in range.');

    return {
      branchId,
      range: { from, to },
      revenue: { gross, voided, net: gross },
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

    // Cash proxy: sum of CASH-tender amounts on non-voided checkouts up to asOfAt
    // minus expenses (best-effort lightweight figure).
    const checkouts = await this.findCheckouts(branchId, null, asOfAt);
    let cashIn = 0;
    let currency = 'ETB';
    for (const checkout of checkouts) {
      currency = checkout.currency || currency;
      if (
        checkout.status === PosCheckoutStatus.VOIDED ||
        checkout.status === PosCheckoutStatus.FAILED
      )
        continue;
      for (const tender of checkout.tenders || []) {
        if (!tender) continue;
        const method = String(tender.method || '').toUpperCase();
        if (method === 'CASH') {
          cashIn += Number(tender.amount) || 0;
        }
      }
    }
    const expenses = await this.findExpenses(branchId, null, asOfAt);
    const cashOut = expenses.reduce(
      (sum, exp) => sum + (Number(exp.amount) || 0),
      0,
    );
    const cash = Math.max(0, cashIn - cashOut);

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

    const totalAssets = cash + inventoryValue;
    const totalLiabilities = supplierPayables;
    const equity = totalAssets - totalLiabilities;

    const notes: string[] = [];
    notes.push(
      'Cash is a lightweight estimate (CASH tenders − recorded expenses). Connect a register-session reconciliation for stricter reporting.',
    );
    if (!inventory.length) notes.push('No inventory on hand for this branch.');
    if (!openPos.length) notes.push('No open supplier purchase orders.');

    return {
      branchId,
      asOfAt,
      assets: { cash, inventoryValue, total: totalAssets },
      liabilities: { supplierPayables, total: totalLiabilities },
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

    const lines = [
      { account: 'Cash', debit: bs.assets.cash, credit: 0 },
      { account: 'Inventory', debit: bs.assets.inventoryValue, credit: 0 },
      {
        account: 'Supplier Payables',
        debit: 0,
        credit: bs.liabilities.supplierPayables,
      },
      { account: 'Sales Revenue', debit: 0, credit: pl.revenue.net },
      { account: 'Cost of Goods Sold', debit: pl.cogs, credit: 0 },
      ...Object.entries(pl.expensesByCategory).map(([category, amount]) => ({
        account: `Expense: ${category}`,
        debit: amount,
        credit: 0,
      })),
      { account: 'Owner Equity (balancing)', debit: 0, credit: bs.equity },
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
