import { roundMoney } from './ingredient-units';

/**
 * The two numbers the P&L takes from the ingredient ledger, from rows somebody
 * else has already fetched. Pure so BillingModule can call it without
 * importing the module (which would close a cycle).
 *
 * Reversed rows and VOID rows are both skipped: a voided sale's consumption
 * did not happen, and the VOID that undid it is the undoing, not a cost.
 *
 *   consumptionCost  — what recipes used, valued at the average of the moment.
 *                      A sale's CONSUMPTION row carries a negative costDelta,
 *                      so the sum is negated; a RETURN's positive row reduces
 *                      it, the same sign the revenue line follows.
 *   stockedPurchaseCost — run receipts that went INTO ingredient stock. Their
 *                      money was posted as an INGREDIENTS expense when the run
 *                      was signed off, so the P&L nets this out of "goods
 *                      purchased": the sugar is charged when it is used, not
 *                      when it is bought. A manual receipt has no expense
 *                      behind it and is not netted.
 */
export interface IngredientCostRow {
  movementType: string;
  sourceType: string;
  costDelta: number | string | null | undefined;
  reversedByMovementId?: number | null;
}

export interface IngredientCostSummary {
  consumptionCost: number;
  stockedPurchaseCost: number;
}

export function summarizeIngredientCosts(
  rows: IngredientCostRow[] | null | undefined,
): IngredientCostSummary {
  let consumption = 0;
  let stocked = 0;
  for (const row of rows || []) {
    if (!row || row.reversedByMovementId != null) continue;
    const cost = Number(row.costDelta) || 0;
    if (row.movementType === 'CONSUMPTION') {
      consumption -= cost;
    } else if (
      row.movementType === 'PURCHASE' &&
      row.sourceType === 'PURCHASE_RUN'
    ) {
      stocked += cost;
    }
  }
  return {
    consumptionCost: roundMoney(consumption),
    stockedPurchaseCost: roundMoney(stocked),
  };
}
