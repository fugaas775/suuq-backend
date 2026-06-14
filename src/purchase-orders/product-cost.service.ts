import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { PurchaseOrderItem } from './entities/purchase-order.entity';

/**
 * Per-product weighted-average cost (WAC) derived from a branch's purchase-order
 * history. Shared so both the financial reports and the POS COGS posting use one
 * authoritative cost basis (`SUM(unitPrice * qty) / SUM(qty)` over received —
 * or, when not yet received, ordered — quantities).
 *
 * When a product has no purchase-order history yet, it falls back to the
 * product's manually-entered `costPrice` so gross profit / COGS is meaningful
 * before any PO or supplier exists.
 */
@Injectable()
export class ProductCostService {
  constructor(
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemsRepo: Repository<PurchaseOrderItem>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
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

    // Fall back to the manually-entered product cost for anything without PO
    // history (or whose PO history nets to zero quantity).
    const missing = ids.filter((id) => !result.has(id));
    if (missing.length) {
      const products = await this.productsRepo.find({
        where: { id: In(missing) },
        select: ['id', 'costPrice'],
      });
      for (const product of products) {
        const cost = Number(product.costPrice);
        if (Number.isFinite(cost) && cost > 0) {
          result.set(product.id, cost);
        }
      }
    }
    return result;
  }
}
