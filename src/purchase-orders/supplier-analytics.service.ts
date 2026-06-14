import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from './entities/purchase-order.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

// Orders that represent committed spend (everything past DRAFT, excluding cancelled).
const COMMITTED_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.SUBMITTED,
  PurchaseOrderStatus.ACKNOWLEDGED,
  PurchaseOrderStatus.SHIPPED,
  PurchaseOrderStatus.RECEIVED,
  PurchaseOrderStatus.RECONCILED,
];
// Open payable = goods in transit / received but not yet reconciled (mirrors the
// supplierPayables definition in branch-financial-reports.service.ts).
const OPEN_PAYABLE_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.SHIPPED,
  PurchaseOrderStatus.RECEIVED,
];
// Completed = goods received; basis for delivery performance.
const COMPLETED_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.RECEIVED,
  PurchaseOrderStatus.RECONCILED,
];

type SupplierAccumulator = {
  supplierProfileId: number;
  supplierName: string;
  orderCount: number;
  totalSpend: number;
  openPayables: number;
  aging: { d0_30: number; d31_60: number; d61_90: number; d90_plus: number };
  completedCount: number;
  onTimeEligible: number;
  onTimeCount: number;
  receivedQtySum: number;
  damagedQtySum: number;
  leadActualSum: number;
  leadActualCount: number;
  leadQuotedSum: number;
  leadQuotedCount: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

@Injectable()
export class SupplierAnalyticsService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
  ) {}

  /**
   * Per-supplier procurement analytics derived entirely from existing
   * purchase-order data: committed spend, open payables with aging buckets, and
   * delivery performance (on-time rate, damage rate, actual vs quoted lead time).
   * Branch-scoped when a branchId is given; aggregates all branches otherwise.
   */
  async getSupplierAnalytics(
    scope: { branchId?: number } = {},
    nowMs: number = new Date().getTime(),
  ) {
    const purchaseOrders = await this.purchaseOrdersRepository.find({
      where: scope.branchId ? { branchId: scope.branchId } : undefined,
      relations: { supplierProfile: true, items: { supplierOffer: true } },
    });

    const bySupplier = new Map<number, SupplierAccumulator>();

    for (const po of purchaseOrders) {
      const acc = this.ensureAccumulator(bySupplier, po);
      const total = Number(po.total) || 0;

      if (COMMITTED_STATUSES.includes(po.status)) {
        acc.orderCount += 1;
        acc.totalSpend += total;
      }

      if (OPEN_PAYABLE_STATUSES.includes(po.status)) {
        acc.openPayables += total;
        this.addToAging(acc, po, total, nowMs);
      }

      if (COMPLETED_STATUSES.includes(po.status)) {
        this.accumulatePerformance(acc, po);
      }
    }

    const suppliers = Array.from(bySupplier.values())
      .map((acc) => this.finalizeSupplier(acc))
      .sort((a, b) => b.totalSpend - a.totalSpend);

    const totals = suppliers.reduce(
      (sum, s) => ({
        totalSpend: round2(sum.totalSpend + s.totalSpend),
        openPayables: round2(sum.openPayables + s.openPayables),
        orderCount: sum.orderCount + s.orderCount,
        supplierCount: sum.supplierCount + 1,
      }),
      { totalSpend: 0, openPayables: 0, orderCount: 0, supplierCount: 0 },
    );

    return { generatedAt: new Date(nowMs).toISOString(), totals, suppliers };
  }

  private ensureAccumulator(
    map: Map<number, SupplierAccumulator>,
    po: PurchaseOrder,
  ): SupplierAccumulator {
    let acc = map.get(po.supplierProfileId);
    if (!acc) {
      acc = {
        supplierProfileId: po.supplierProfileId,
        supplierName:
          po.supplierProfile?.companyName ||
          po.supplierProfile?.legalName ||
          `Supplier #${po.supplierProfileId}`,
        orderCount: 0,
        totalSpend: 0,
        openPayables: 0,
        aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
        completedCount: 0,
        onTimeEligible: 0,
        onTimeCount: 0,
        receivedQtySum: 0,
        damagedQtySum: 0,
        leadActualSum: 0,
        leadActualCount: 0,
        leadQuotedSum: 0,
        leadQuotedCount: 0,
      };
      map.set(po.supplierProfileId, acc);
    }
    return acc;
  }

  private addToAging(
    acc: SupplierAccumulator,
    po: PurchaseOrder,
    total: number,
    nowMs: number,
  ): void {
    const reference =
      po.shippedAt ??
      (po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate) : null) ??
      po.updatedAt ??
      null;
    const refMs = reference ? new Date(reference).getTime() : nowMs;
    const ageDays = Math.max(0, Math.floor((nowMs - refMs) / DAY_MS));
    if (ageDays <= 30) acc.aging.d0_30 += total;
    else if (ageDays <= 60) acc.aging.d31_60 += total;
    else if (ageDays <= 90) acc.aging.d61_90 += total;
    else acc.aging.d90_plus += total;
  }

  private accumulatePerformance(
    acc: SupplierAccumulator,
    po: PurchaseOrder,
  ): void {
    acc.completedCount += 1;

    // On-time: compare received calendar day to the expected delivery date.
    if (po.expectedDeliveryDate && po.receivedAt) {
      acc.onTimeEligible += 1;
      const receivedDay = new Date(po.receivedAt).toISOString().slice(0, 10);
      if (receivedDay <= po.expectedDeliveryDate) {
        acc.onTimeCount += 1;
      }
    }

    for (const item of po.items ?? []) {
      acc.receivedQtySum += Number(item.receivedQuantity) || 0;
      acc.damagedQtySum += Number(item.damagedQuantity) || 0;
      const quoted = item.supplierOffer?.leadTimeDays;
      if (quoted != null) {
        acc.leadQuotedSum += Number(quoted) || 0;
        acc.leadQuotedCount += 1;
      }
    }

    // Actual lead time = submitted → received, in days.
    if (po.submittedAt && po.receivedAt) {
      const days =
        (new Date(po.receivedAt).getTime() -
          new Date(po.submittedAt).getTime()) /
        DAY_MS;
      if (days >= 0) {
        acc.leadActualSum += days;
        acc.leadActualCount += 1;
      }
    }
  }

  private finalizeSupplier(acc: SupplierAccumulator) {
    return {
      supplierProfileId: acc.supplierProfileId,
      supplierName: acc.supplierName,
      orderCount: acc.orderCount,
      totalSpend: round2(acc.totalSpend),
      openPayables: round2(acc.openPayables),
      aging: {
        d0_30: round2(acc.aging.d0_30),
        d31_60: round2(acc.aging.d31_60),
        d61_90: round2(acc.aging.d61_90),
        d90_plus: round2(acc.aging.d90_plus),
      },
      performance: {
        completedOrders: acc.completedCount,
        onTimeRate: acc.onTimeEligible
          ? round4(acc.onTimeCount / acc.onTimeEligible)
          : null,
        damageRate: acc.receivedQtySum
          ? round4(acc.damagedQtySum / acc.receivedQtySum)
          : null,
        avgActualLeadTimeDays: acc.leadActualCount
          ? round2(acc.leadActualSum / acc.leadActualCount)
          : null,
        avgQuotedLeadTimeDays: acc.leadQuotedCount
          ? round2(acc.leadQuotedSum / acc.leadQuotedCount)
          : null,
      },
    };
  }
}
