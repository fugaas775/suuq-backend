import { ProductCostService } from './product-cost.service';

function makeService(
  poRows: Array<{ productId: number; totalCost: string; totalQty: string }>,
  products: Array<{ id: number; costPrice: number | null }>,
) {
  const qb: any = {
    innerJoin: () => qb,
    select: () => qb,
    addSelect: () => qb,
    where: () => qb,
    groupBy: () => qb,
    getRawMany: jest.fn().mockResolvedValue(poRows),
  };
  const poItemsRepo: any = { createQueryBuilder: jest.fn(() => qb) };
  const productsRepo: any = { find: jest.fn().mockResolvedValue(products) };
  return new ProductCostService(poItemsRepo, productsRepo);
}

describe('ProductCostService — manual cost fallback', () => {
  it('uses Product.costPrice when there is no purchase-order history', async () => {
    const svc = makeService([], [{ id: 5, costPrice: 30 }]);
    const costs = await svc.weightedAverageCosts(92, [5]);
    expect(costs.get(5)).toBe(30);
  });

  it('prefers the PO weighted-average over the manual cost', async () => {
    const svc = makeService(
      [{ productId: 5, totalCost: '200', totalQty: '4' }],
      [{ id: 5, costPrice: 99 }],
    );
    const costs = await svc.weightedAverageCosts(92, [5]);
    expect(costs.get(5)).toBe(50); // 200 / 4, not the manual 99
  });

  it('skips products with neither PO history nor a manual cost', async () => {
    const svc = makeService([], [{ id: 5, costPrice: null }]);
    const costs = await svc.weightedAverageCosts(92, [5]);
    expect(costs.has(5)).toBe(false);
  });
});
