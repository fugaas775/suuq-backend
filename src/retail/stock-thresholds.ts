/**
 * Service-format default stock thresholds (backend mirror of the pos-s frontend
 * `features/stock-health/stockThresholds.js`).
 *
 * A branch's reorder/at-risk signals key off per-SKU `safetyStock` /
 * `reorderPoint`. When a branch never configures those, the status engine can
 * only flag a SKU at 0/1 units, so every risk surface reads a falsely
 * reassuring "all healthy". These per-format defaults give an un-configured SKU
 * an estimated status so the operator (Stock Health), the cross-branch Network
 * summary, and the Home dashboard all agree.
 *
 * IMPORTANT: keep these numbers in lock-step with the frontend SSOT. Because
 * both sides apply the SAME defaults to the SAME raw fields, the computation is
 * idempotent — the frontend re-derivation of an already-estimated backend row
 * yields identical values.
 *
 * Relationship per format: safetyStock < reorderPoint < parLevel.
 */
export interface StockThresholdDefaults {
  safetyStock: number;
  reorderPoint: number;
  parLevel: number;
}

export const STOCK_THRESHOLD_DEFAULTS: Record<string, StockThresholdDefaults> =
  {
    RETAIL: { safetyStock: 3, reorderPoint: 6, parLevel: 12 },
    QSR: { safetyStock: 5, reorderPoint: 10, parLevel: 20 },
    CAFETERIA: { safetyStock: 5, reorderPoint: 10, parLevel: 20 }, // FSR
    BAKERY: { safetyStock: 5, reorderPoint: 10, parLevel: 20 },
    HOTEL: { safetyStock: 4, reorderPoint: 8, parLevel: 16 },
    LAUNDRY: { safetyStock: 3, reorderPoint: 6, parLevel: 12 },
    BARBER: { safetyStock: 3, reorderPoint: 6, parLevel: 12 },
    PROPERTY_RENTAL: { safetyStock: 2, reorderPoint: 4, parLevel: 8 },
    // Print shops hold bulk consumables (paper reels, ink, toner, vinyl) with
    // long supplier lead times, so they need deeper cover than a service
    // counter. Missing here until 2026-07-31 while the frontend already had it:
    // PRINTING_PRESS fell through to FALLBACK (3/6/12) on this side only, which
    // broke the idempotence the header above promises — the same un-configured
    // SKU at 8 units read HEALTHY from the backend estimate (Home dashboard,
    // Network summary) and LOW_STOCK once Stock Health re-derived it.
    PRINTING_PRESS: { safetyStock: 6, reorderPoint: 12, parLevel: 24 },
  };

export const FALLBACK_STOCK_THRESHOLDS: StockThresholdDefaults = {
  safetyStock: 3,
  reorderPoint: 6,
  parLevel: 12,
};

export function getDefaultStockThresholds(
  serviceFormat?: string | null,
): StockThresholdDefaults {
  const key = String(serviceFormat ?? '')
    .trim()
    .toUpperCase();
  return STOCK_THRESHOLD_DEFAULTS[key] ?? FALLBACK_STOCK_THRESHOLDS;
}

export type StockStatus =
  | 'HEALTHY'
  | 'LOW_STOCK'
  | 'REORDER_NOW'
  | 'OUT_OF_STOCK';

export interface EffectiveStockInput {
  quantityOnHand?: number | null;
  availableToSell?: number | null;
  safetyStock?: number | null;
  reorderPoint?: number | null;
}

export interface EffectiveStockSignal {
  stockStatus: StockStatus;
  shortageToSafetyStock: number;
  /** True when the status was estimated from a format default (a real risk flag, not configured). */
  estimated: boolean;
}

/**
 * Resolve a SKU's stock status + shortage.
 *
 * - Configured SKUs (safetyStock > 0 or reorderPoint > 0) use the legacy ladder
 *   (safety → REORDER_NOW, safety×2 → LOW_STOCK), unchanged.
 * - Un-configured SKUs use the format defaults ONLY when a `serviceFormat` is
 *   supplied — otherwise the legacy zero-threshold behaviour is preserved so
 *   callers that don't opt in (e.g. AI risk scoring) are unaffected.
 */
export function resolveEffectiveStockStatus(
  item: EffectiveStockInput,
  serviceFormat?: string | null,
): EffectiveStockSignal {
  const onHand = Number(item.quantityOnHand ?? 0);
  const available = Number(item.availableToSell ?? 0);
  const safety = Number(item.safetyStock ?? 0);
  const reorder = Number(item.reorderPoint ?? 0);
  const configured = safety > 0 || reorder > 0;

  if (onHand <= 0) {
    // Out-of-stock is threshold-independent — never an "estimated" flag.
    return {
      stockStatus: 'OUT_OF_STOCK',
      shortageToSafetyStock: Math.max(safety - available, 0),
      estimated: false,
    };
  }

  if (configured || serviceFormat == null) {
    // Legacy ladder on the configured (or unspecified) safety stock.
    let status: StockStatus;
    if (available <= safety) status = 'REORDER_NOW';
    else if (available <= Math.max(safety * 2, 1)) status = 'LOW_STOCK';
    else status = 'HEALTHY';
    return {
      stockStatus: status,
      shortageToSafetyStock: Math.max(safety - available, 0),
      estimated: false,
    };
  }

  // Un-configured + a known format: estimate from defaults.
  const def = getDefaultStockThresholds(serviceFormat);
  let status: StockStatus;
  if (available <= def.safetyStock) status = 'REORDER_NOW';
  else if (available <= def.reorderPoint) status = 'LOW_STOCK';
  else status = 'HEALTHY';
  return {
    stockStatus: status,
    shortageToSafetyStock: Math.max(def.safetyStock - available, 0),
    // Only REORDER_NOW / LOW_STOCK exist because of the default.
    estimated: status === 'REORDER_NOW' || status === 'LOW_STOCK',
  };
}
