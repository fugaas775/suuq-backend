import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import { BranchFinancialReportsService } from '../billing/branch-financial-reports.service';
import {
  SupplierContext,
  SupplierStaffService,
} from '../suppliers/supplier-staff.service';
import {
  RECOGNISED_STATUSES,
  summarizeWholesale,
  WholesaleSummary,
} from './supplier-wholesale.aggregation';

export interface SupplierFinancialsActor {
  id?: number | null;
  roles?: string[] | null;
  /** Active supplier from the x-supplier-id header (multi-supplier / act-as). */
  supplierId?: number | null;
}

export interface DateRange {
  from?: Date | null;
  to?: Date | null;
}

const SALES_JOURNAL_MAX_LIMIT = 200;

/**
 * The supplier-scoped Financials + Reports engine. Resolves the acting supplier
 * from its context (owner / manager / operator, or SUPER_ADMIN act-as) — the
 * frontend never passes a branchId. The WHOLESALE half is aggregated from the
 * supplier's incoming purchase orders; the COUNTER half is delegated verbatim to
 * the existing branch financials engine, keyed on the supplier's provisioned
 * outlet branch (`outletBranchId`), which may be null (no counter yet).
 */
@Injectable()
export class SupplierFinancialsService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
    private readonly supplierStaff: SupplierStaffService,
    private readonly branchReports: BranchFinancialReportsService,
  ) {}

  private async resolveContext(
    actor: SupplierFinancialsActor,
  ): Promise<SupplierContext> {
    const context = await this.supplierStaff.getSupplierContextForUser({
      id: actor?.id,
      roles: actor?.roles ?? [],
      supplierId: actor?.supplierId ?? null,
    });
    if (!context) {
      throw new ForbiddenException('No supplier account for this user');
    }
    return context;
  }

  /** Load every incoming order for a supplier, with the relations the rollups need. */
  private loadOrders(supplierProfileId: number): Promise<PurchaseOrder[]> {
    return this.purchaseOrdersRepository.find({
      where: { supplierProfileId },
      relations: {
        branch: true,
        items: { product: true, supplierOffer: true },
      },
    });
  }

  private identity(context: SupplierContext) {
    return {
      supplierProfileId: context.supplierProfileId,
      companyName: context.companyName,
      activationStatus: context.activationStatus,
      onboardingStatus: context.onboardingStatus,
      hasCounter: Number(context.outletBranchId) > 0,
      outletBranchId: context.outletBranchId,
      outletBranchName: context.outletBranchName,
    };
  }

  // ---------------------------------------------------------------------------
  // Overview — unified KPI strip (wholesale + counter)
  // ---------------------------------------------------------------------------

  async getOverview(actor: SupplierFinancialsActor, range: DateRange) {
    const context = await this.resolveContext(actor);
    const orders = await this.loadOrders(context.supplierProfileId);
    const wholesale = summarizeWholesale(orders, range, Date.now());

    let counter: {
      netSales: number;
      netProfit: number;
      currency: string;
    } | null = null;
    if (Number(context.outletBranchId) > 0) {
      const pl = await this.branchReports.getProfitAndLoss(
        context.outletBranchId,
        range,
      );
      counter = {
        netSales: pl.revenue?.net ?? 0,
        netProfit: pl.netProfit ?? 0,
        currency: pl.currency ?? wholesale.currency,
      };
    }

    const combinedGross =
      wholesale.recognizedRevenue + (counter ? counter.netSales : 0);

    return {
      ...this.identity(context),
      range: serializeRange(range),
      currency: wholesale.currency,
      wholesale: {
        recognizedRevenue: wholesale.recognizedRevenue,
        recognizedCount: wholesale.recognizedCount,
        backlogValue: wholesale.backlogValue,
        backlogCount: wholesale.backlogCount,
        receivablesOutstanding: wholesale.receivablesOutstanding,
        receivablesCount: wholesale.receivablesCount,
        ordersInPeriod: wholesale.ordersInPeriod,
        averageOrderValue: wholesale.averageOrderValue,
      },
      counter,
      combinedGross: round2(combinedGross),
    };
  }

  // ---------------------------------------------------------------------------
  // Statements — counter outlet branch books (P&L / BS / TB)
  // ---------------------------------------------------------------------------

  async getProfitAndLoss(actor: SupplierFinancialsActor, range: DateRange) {
    const context = await this.resolveContext(actor);
    if (!(Number(context.outletBranchId) > 0)) {
      return this.noCounter(context);
    }
    const report = await this.branchReports.getProfitAndLoss(
      context.outletBranchId,
      range,
    );
    return { hasCounter: true, branchName: context.outletBranchName, report };
  }

  async getBalanceSheet(actor: SupplierFinancialsActor, asOfAt: Date | null) {
    const context = await this.resolveContext(actor);
    if (!(Number(context.outletBranchId) > 0)) {
      return this.noCounter(context);
    }
    const report = await this.branchReports.getBalanceSheet(
      context.outletBranchId,
      { asOfAt: asOfAt ?? undefined },
    );
    return { hasCounter: true, branchName: context.outletBranchName, report };
  }

  async getTrialBalance(actor: SupplierFinancialsActor, asOfAt: Date | null) {
    const context = await this.resolveContext(actor);
    if (!(Number(context.outletBranchId) > 0)) {
      return this.noCounter(context);
    }
    const report = await this.branchReports.getTrialBalance(
      context.outletBranchId,
      { asOfAt: asOfAt ?? undefined },
    );
    return { hasCounter: true, branchName: context.outletBranchName, report };
  }

  private noCounter(context: SupplierContext) {
    return {
      hasCounter: false,
      branchName: null,
      report: null,
      note: 'No Suuq POS counter is provisioned for this supplier yet.',
    };
  }

  // ---------------------------------------------------------------------------
  // Sales journal — wholesale recognised orders as journal lines (paginated)
  // ---------------------------------------------------------------------------

  async getSalesJournal(
    actor: SupplierFinancialsActor,
    range: DateRange,
    page = 1,
    limit = 50,
  ) {
    const context = await this.resolveContext(actor);
    const orders = await this.loadOrders(context.supplierProfileId);

    const fromMs = range.from ? range.from.getTime() : null;
    const toMs = range.to ? range.to.getTime() : null;
    const recognised = orders
      .filter((po) => RECOGNISED_STATUSES.includes(po.status))
      .map((po) => ({
        ...po,
        _recMs: po.receivedAt
          ? new Date(po.receivedAt).getTime()
          : po.reconciledAt
            ? new Date(po.reconciledAt).getTime()
            : null,
      }))
      .filter((po) => {
        if (po._recMs == null) return false;
        if (fromMs != null && po._recMs < fromMs) return false;
        if (toMs != null && po._recMs > toMs) return false;
        return true;
      })
      .sort((a, b) => (b._recMs ?? 0) - (a._recMs ?? 0));

    const safeLimit = Math.min(
      Math.max(1, Number(limit) || 50),
      SALES_JOURNAL_MAX_LIMIT,
    );
    const safePage = Math.max(1, Number(page) || 1);
    const total = recognised.length;
    const start = (safePage - 1) * safeLimit;
    const slice = recognised.slice(start, start + safeLimit);

    return {
      ...this.identity(context),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      items: slice.map((po) => ({
        id: po.id,
        orderNumber: po.orderNumber,
        status: po.status,
        currency: po.currency,
        total: po.total,
        buyerBranchId: po.branchId,
        buyerName: po.branch?.name ?? `Branch #${po.branchId}`,
        recognizedAt: po.receivedAt ?? po.reconciledAt ?? null,
        itemCount: (po.items ?? []).reduce(
          (n, it) =>
            n +
            (Number(it.receivedQuantity) || Number(it.orderedQuantity) || 0),
          0,
        ),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Cash & receivables — wholesale receivables aging + counter cash slice
  // ---------------------------------------------------------------------------

  async getCashReceivables(
    actor: SupplierFinancialsActor,
    asOfAt: Date | null,
  ) {
    const context = await this.resolveContext(actor);
    const orders = await this.loadOrders(context.supplierProfileId);
    const summary = summarizeWholesale(
      orders,
      { from: null, to: asOfAt },
      asOfAt ? asOfAt.getTime() : Date.now(),
    );

    let counter: {
      currency: string;
      currentAssets: number;
      accountsReceivable: number | null;
    } | null = null;
    if (Number(context.outletBranchId) > 0) {
      const bs = await this.branchReports.getBalanceSheet(
        context.outletBranchId,
        { asOfAt: asOfAt ?? undefined },
      );
      counter = {
        currency: bs.currency,
        currentAssets: bs.assets?.current?.total ?? 0,
        accountsReceivable: bs.assets?.current?.accountsReceivable ?? null,
      };
    }

    return {
      ...this.identity(context),
      currency: summary.currency,
      wholesale: {
        receivablesOutstanding: summary.receivablesOutstanding,
        receivablesCount: summary.receivablesCount,
        aging: summary.receivablesAging,
        byBuyer: summary.buyerBreakdown
          .filter((b) => b.openReceivables > 0)
          .map((b) => ({
            branchId: b.branchId,
            buyerName: b.buyerName,
            openReceivables: b.openReceivables,
          })),
      },
      counter,
    };
  }

  // ---------------------------------------------------------------------------
  // Reports — full wholesale analytics for the supplier Reports page
  // ---------------------------------------------------------------------------

  async getReports(actor: SupplierFinancialsActor, range: DateRange) {
    const context = await this.resolveContext(actor);
    const orders = await this.loadOrders(context.supplierProfileId);
    const summary: WholesaleSummary = summarizeWholesale(
      orders,
      range,
      Date.now(),
    );

    let counter: { netSales: number; currency: string } | null = null;
    if (Number(context.outletBranchId) > 0) {
      const pl = await this.branchReports.getProfitAndLoss(
        context.outletBranchId,
        range,
      );
      counter = { netSales: pl.revenue?.net ?? 0, currency: pl.currency };
    }

    return {
      ...this.identity(context),
      range: serializeRange(range),
      summary,
      counter,
    };
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function serializeRange(range: DateRange) {
  return {
    from: range.from ? range.from.toISOString() : null,
    to: range.to ? range.to.toISOString() : null,
  };
}
