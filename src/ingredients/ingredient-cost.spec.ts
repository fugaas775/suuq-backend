import { summarizeIngredientCosts } from './ingredient-cost';

describe('summarizeIngredientCosts', () => {
  it('splits consumption from stocked run receipts', () => {
    const out = summarizeIngredientCosts([
      { movementType: 'CONSUMPTION', sourceType: 'POS_CHECKOUT', costDelta: -10 },
      { movementType: 'CONSUMPTION', sourceType: 'POS_CHECKOUT', costDelta: '-2.5' },
      { movementType: 'PURCHASE', sourceType: 'PURCHASE_RUN', costDelta: 1200 },
    ]);
    expect(out).toEqual({ consumptionCost: 12.5, stockedPurchaseCost: 1200 });
  });

  it('ignores VOID rows and the rows they reversed', () => {
    const out = summarizeIngredientCosts([
      {
        movementType: 'CONSUMPTION',
        sourceType: 'POS_CHECKOUT',
        costDelta: -10,
        reversedByMovementId: 9,
      },
      { movementType: 'VOID', sourceType: 'POS_CHECKOUT_VOID', costDelta: 10 },
      {
        movementType: 'PURCHASE',
        sourceType: 'PURCHASE_RUN',
        costDelta: 500,
        reversedByMovementId: 11,
      },
      { movementType: 'VOID', sourceType: 'PURCHASE_RUN_VOID', costDelta: -500 },
    ]);
    expect(out).toEqual({ consumptionCost: 0, stockedPurchaseCost: 0 });
  });

  it('does not net a manual receipt — no expense sits behind it', () => {
    const out = summarizeIngredientCosts([
      { movementType: 'PURCHASE', sourceType: 'MANUAL', costDelta: 300 },
      { movementType: 'OPENING', sourceType: 'MANUAL', costDelta: 2500 },
    ]);
    expect(out.stockedPurchaseCost).toBe(0);
  });

  it('lets a return reduce consumption, the sign revenue follows', () => {
    const out = summarizeIngredientCosts([
      { movementType: 'CONSUMPTION', sourceType: 'POS_CHECKOUT', costDelta: -10 },
      { movementType: 'CONSUMPTION', sourceType: 'POS_CHECKOUT', costDelta: 4 },
    ]);
    expect(out.consumptionCost).toBe(6);
  });

  it('tolerates nothing at all', () => {
    expect(summarizeIngredientCosts(null)).toEqual({
      consumptionCost: 0,
      stockedPurchaseCost: 0,
    });
  });
});
