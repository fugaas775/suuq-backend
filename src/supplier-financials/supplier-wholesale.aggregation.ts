import { PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';

/**
 * Pure, framework-free aggregation of a supplier's INCOMING purchase orders into
 * the wholesale half of the supplier Financials hub + Reports page. The buyer-
 * facing SupplierAnalyticsService groups POs by supplier (a buyer's procurement
 * view); this is the inverted, supplier-scoped analog — one supplier, every order
 * addressed to them — with the money relabelled from buyer "payables" to supplier
 * "receivables".
 *
 * Kept side-effect-free (no repo, no clock) so it is unit-testable and so the
 * service can feed it already-loaded rows + an explicit `nowMs`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
// East Africa Time (UTC+3). The frontend windows everything in EAT and sends
// EAT-aware ISO bounds; we bucket recognition days in EAT too so wholesale daily
// totals line up with the counter's EAT day buckets (the backend has no shared
// EAT helper — this local constant mirrors financialsAggregation.js).
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

// Orders past DRAFT and not cancelled — committed business.
export const COMMITTED_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.SUBMITTED,
  PurchaseOrderStatus.ACKNOWLEDGED,
  PurchaseOrderStatus.SHIPPED,
  PurchaseOrderStatus.RECEIVED,
  PurchaseOrderStatus.RECONCILED,
];
// Backlog = ordered but not yet delivered (revenue not yet recognised).
export const BACKLOG_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.SUBMITTED,
  PurchaseOrderStatus.ACKNOWLEDGED,
  PurchaseOrderStatus.SHIPPED,
];
// Recognised supplier revenue = goods delivered (received or reconciled).
export const RECOGNISED_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.RECEIVED,
  PurchaseOrderStatus.RECONCILED,
];
// Open receivable = shipped/received but not yet reconciled (paid). This is the
// supplier-side mirror of the buyer's "open payable".
export const RECEIVABLE_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.SHIPPED,
  PurchaseOrderStatus.RECEIVED,
];

export interface WholesaleWindow {
  /** ISO string or Date; null/undefined = open-ended. */
  from?: string | Date | null;
  to?: string | Date | null;
}

/** Minimal shape consumed from a loaded PurchaseOrder (+ relations). */
export interface WholesaleOrderLike {
  id: number;
  status: PurchaseOrderStatus;
  currency?: string | null;
  total?: number | string | null;
  subtotal?: number | string | null;
  branchId: number;
  supplierProfileId?: number;
  expectedDeliveryDate?: string | null;
  submittedAt?: Date | string | null;
  acknowledgedAt?: Date | string | null;
  shippedAt?: Date | string | null;
  receivedAt?: Date | string | null;
  reconciledAt?: Date | string | null;
  branch?: { id?: number; name?: string | null } | null;
  items?: Array<{
    productId?: number | null;
    orderedQuantity?: number | null;
    receivedQuantity?: number | null;
    damagedQuantity?: number | null;
    unitPrice?: number | string | null;
    product?: { name?: string | null; sku?: string | null } | null;
    supplierOffer?: { leadTimeDays?: number | null } | null;
  }> | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

const toMs = (v?: Date | string | null): number | null => {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** Recognition instant for an order: when the goods were delivered. */
function recognitionMs(po: WholesaleOrderLike): number | null {
  return toMs(po.receivedAt) ?? toMs(po.reconciledAt) ?? null;
}

/** EAT calendar day (YYYY-MM-DD) for an instant — mirrors frontend toEatDateStr. */
function eatDayKey(ms: number): string {
  return new Date(ms + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

function inWindow(ms: number | null, window: WholesaleWindow): boolean {
  if (ms == null) return false;
  const fromMs = toMs(window.from ?? null);
  const toMsBound = toMs(window.to ?? null);
  if (fromMs != null && ms < fromMs) return false;
  if (toMsBound != null && ms > toMsBound) return false;
  return true;
}

export interface WholesaleSummary {
  currency: string;
  /** Goods delivered within the window (status ∈ recognised, recognised in range). */
  recognizedRevenue: number;
  recognizedCount: number;
  /** Point-in-time snapshots (NOT windowed) — current open book. */
  backlogValue: number;
  backlogCount: number;
  receivablesOutstanding: number;
  receivablesCount: number;
  receivablesAging: {
    d0_30: number;
    d31_60: number;
    d61_90: number;
    d90_plus: number;
  };
  /** Committed orders submitted within the window. */
  ordersInPeriod: number;
  grossOrderValue: number;
  averageOrderValue: number;
  dailyTotals: Array<{ dayKey: string; recognized: number; count: number }>;
  statusFunnel: Array<{
    status: PurchaseOrderStatus;
    count: number;
    value: number;
  }>;
  topOffers: Array<{
    key: string;
    name: string;
    sku: string | null;
    quantity: number;
    revenue: number;
  }>;
  buyerBreakdown: Array<{
    branchId: number;
    buyerName: string;
    orderCount: number;
    recognizedRevenue: number;
    openReceivables: number;
  }>;
  fulfillment: {
    completedOrders: number;
    onTimeRate: number | null;
    damageRate: number | null;
    avgActualLeadTimeDays: number | null;
    avgQuotedLeadTimeDays: number | null;
  };
}

type BuyerAcc = {
  branchId: number;
  buyerName: string;
  orderCount: number;
  recognizedRevenue: number;
  openReceivables: number;
};

/**
 * Roll a supplier's incoming orders into the wholesale summary. Recognised
 * revenue + order counts + top offers + buyer breakdown are scoped to the window
 * (by recognition / submission date); backlog + receivables are current
 * snapshots of the open book regardless of window, since they describe money
 * owed/expected right now.
 */
export function summarizeWholesale(
  orders: WholesaleOrderLike[],
  window: WholesaleWindow = {},
  nowMs: number = Date.now(),
): WholesaleSummary {
  let currency = '';
  let recognizedRevenue = 0;
  let recognizedCount = 0;
  let backlogValue = 0;
  let backlogCount = 0;
  let receivablesOutstanding = 0;
  let receivablesCount = 0;
  const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  let ordersInPeriod = 0;
  let grossOrderValue = 0;

  const daily = new Map<string, { recognized: number; count: number }>();
  const funnel = new Map<
    PurchaseOrderStatus,
    { count: number; value: number }
  >();
  const offers = new Map<
    string,
    { name: string; sku: string | null; quantity: number; revenue: number }
  >();
  const buyers = new Map<number, BuyerAcc>();

  // Fulfillment accumulators.
  let completedOrders = 0;
  let onTimeEligible = 0;
  let onTimeCount = 0;
  let receivedQtySum = 0;
  let damagedQtySum = 0;
  let leadActualSum = 0;
  let leadActualCount = 0;
  let leadQuotedSum = 0;
  let leadQuotedCount = 0;

  for (const po of orders) {
    if (!currency && po.currency) currency = po.currency;
    if (
      po.status === PurchaseOrderStatus.CANCELLED ||
      po.status === PurchaseOrderStatus.DRAFT
    ) {
      // Funnel still records cancelled/draft for the status overview.
      bumpFunnel(funnel, po.status, num(po.total));
      continue;
    }

    const total = num(po.total);
    bumpFunnel(funnel, po.status, total);

    // Committed orders submitted within the window → period order volume.
    if (
      COMMITTED_STATUSES.includes(po.status) &&
      inWindow(toMs(po.submittedAt), window)
    ) {
      ordersInPeriod += 1;
      grossOrderValue += total;
    }

    // Backlog snapshot (current open orders, not windowed).
    if (BACKLOG_STATUSES.includes(po.status)) {
      backlogValue += total;
      backlogCount += 1;
    }

    // Receivables snapshot (current, not windowed) + aging.
    if (RECEIVABLE_STATUSES.includes(po.status)) {
      receivablesOutstanding += total;
      receivablesCount += 1;
      addToAging(aging, po, total, nowMs);
      const buyer = ensureBuyer(buyers, po);
      buyer.openReceivables += total;
    }

    // Recognised revenue (windowed by recognition date).
    const recMs = recognitionMs(po);
    if (
      RECOGNISED_STATUSES.includes(po.status) &&
      inWindow(recMs, window) &&
      recMs != null
    ) {
      recognizedRevenue += total;
      recognizedCount += 1;

      const key = eatDayKey(recMs);
      const bucket = daily.get(key) || { recognized: 0, count: 0 };
      bucket.recognized += total;
      bucket.count += 1;
      daily.set(key, bucket);

      const buyer = ensureBuyer(buyers, po);
      buyer.orderCount += 1;
      buyer.recognizedRevenue += total;

      for (const item of po.items ?? []) {
        const productId = item?.productId;
        const offerKey =
          productId != null
            ? `p${productId}`
            : `n${(item?.product?.name || 'item').toLowerCase()}`;
        const entry = offers.get(offerKey) || {
          name: item?.product?.name || `Product #${productId ?? '—'}`,
          sku: item?.product?.sku ?? null,
          quantity: 0,
          revenue: 0,
        };
        const qty = num(item?.receivedQuantity) || num(item?.orderedQuantity);
        entry.quantity += qty;
        entry.revenue += qty * num(item?.unitPrice);
        offers.set(offerKey, entry);
      }

      // Fulfillment (completed orders recognised in window).
      completedOrders += 1;
      if (po.expectedDeliveryDate && po.receivedAt) {
        onTimeEligible += 1;
        const receivedDay = new Date(po.receivedAt).toISOString().slice(0, 10);
        if (receivedDay <= po.expectedDeliveryDate) onTimeCount += 1;
      }
      for (const item of po.items ?? []) {
        receivedQtySum += num(item?.receivedQuantity);
        damagedQtySum += num(item?.damagedQuantity);
        const quoted = item?.supplierOffer?.leadTimeDays;
        if (quoted != null) {
          leadQuotedSum += num(quoted);
          leadQuotedCount += 1;
        }
      }
      if (po.submittedAt && po.receivedAt) {
        const days =
          (new Date(po.receivedAt).getTime() -
            new Date(po.submittedAt).getTime()) /
          DAY_MS;
        if (days >= 0) {
          leadActualSum += days;
          leadActualCount += 1;
        }
      }
    }
  }

  const dailyTotals = Array.from(daily.entries())
    .map(([dayKey, v]) => ({
      dayKey,
      recognized: round2(v.recognized),
      count: v.count,
    }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  const statusFunnel = Array.from(funnel.entries()).map(([status, v]) => ({
    status,
    count: v.count,
    value: round2(v.value),
  }));

  const topOffers = Array.from(offers.entries())
    .map(([key, v]) => ({
      key,
      name: v.name,
      sku: v.sku,
      quantity: v.quantity,
      revenue: round2(v.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  const buyerBreakdown = Array.from(buyers.values())
    .map((b) => ({
      branchId: b.branchId,
      buyerName: b.buyerName,
      orderCount: b.orderCount,
      recognizedRevenue: round2(b.recognizedRevenue),
      openReceivables: round2(b.openReceivables),
    }))
    .sort((a, b) => b.recognizedRevenue - a.recognizedRevenue);

  return {
    currency: currency || 'ETB',
    recognizedRevenue: round2(recognizedRevenue),
    recognizedCount,
    backlogValue: round2(backlogValue),
    backlogCount,
    receivablesOutstanding: round2(receivablesOutstanding),
    receivablesCount,
    receivablesAging: {
      d0_30: round2(aging.d0_30),
      d31_60: round2(aging.d31_60),
      d61_90: round2(aging.d61_90),
      d90_plus: round2(aging.d90_plus),
    },
    ordersInPeriod,
    grossOrderValue: round2(grossOrderValue),
    averageOrderValue: ordersInPeriod
      ? round2(grossOrderValue / ordersInPeriod)
      : 0,
    dailyTotals,
    statusFunnel,
    topOffers,
    buyerBreakdown,
    fulfillment: {
      completedOrders,
      onTimeRate: onTimeEligible ? round4(onTimeCount / onTimeEligible) : null,
      damageRate: receivedQtySum
        ? round4(damagedQtySum / receivedQtySum)
        : null,
      avgActualLeadTimeDays: leadActualCount
        ? round2(leadActualSum / leadActualCount)
        : null,
      avgQuotedLeadTimeDays: leadQuotedCount
        ? round2(leadQuotedSum / leadQuotedCount)
        : null,
    },
  };
}

function bumpFunnel(
  funnel: Map<PurchaseOrderStatus, { count: number; value: number }>,
  status: PurchaseOrderStatus,
  value: number,
): void {
  const entry = funnel.get(status) || { count: 0, value: 0 };
  entry.count += 1;
  entry.value += value;
  funnel.set(status, entry);
}

function ensureBuyer(
  map: Map<number, BuyerAcc>,
  po: WholesaleOrderLike,
): BuyerAcc {
  let acc = map.get(po.branchId);
  if (!acc) {
    acc = {
      branchId: po.branchId,
      buyerName: po.branch?.name || `Branch #${po.branchId}`,
      orderCount: 0,
      recognizedRevenue: 0,
      openReceivables: 0,
    };
    map.set(po.branchId, acc);
  }
  return acc;
}

function addToAging(
  aging: { d0_30: number; d31_60: number; d61_90: number; d90_plus: number },
  po: WholesaleOrderLike,
  total: number,
  nowMs: number,
): void {
  const reference =
    toMs(po.shippedAt) ??
    (po.expectedDeliveryDate
      ? new Date(po.expectedDeliveryDate).getTime()
      : null) ??
    nowMs;
  const ageDays = Math.max(0, Math.floor((nowMs - reference) / DAY_MS));
  if (ageDays <= 30) aging.d0_30 += total;
  else if (ageDays <= 60) aging.d31_60 += total;
  else if (ageDays <= 90) aging.d61_90 += total;
  else aging.d90_plus += total;
}
