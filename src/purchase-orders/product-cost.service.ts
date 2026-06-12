import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrderItem } from './entities/purchase-order.entity';

/**
 * Per-product weighted-average cost (WAC) derived from a branch's purchase-order
 * history. Shared so both the financial reports and the POS COGS posting use one
 * authoritative cost basis (`SUM(unitPrice * qty) / SUM(qty)` over received —
 * or, when not yet received, ordered — quantities).
 */
@Injectable()
export class ProductCostService {
  constructor(
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemsRepo: Repository<PurchaseOrderItem>,
  ) {}

  async weightedAverageCosts(
    branchId: number,
    productIds: number[],
  ): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    const ids = Array.from(
      new Set((productIds || []).filter((id) => Number.isFinite(id))),
    );
    if (!ids.length) return result;

    const rows: { productId: number; totalCost: string; totalQty: string }[] =
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
        .where('item.productId IN (:...ids)', { ids })
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
