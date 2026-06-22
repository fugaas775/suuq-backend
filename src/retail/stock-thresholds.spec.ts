import {
  getDefaultStockThresholds,
  resolveEffectiveStockStatus,
  FALLBACK_STOCK_THRESHOLDS,
} from './stock-thresholds';

describe('getDefaultStockThresholds', () => {
  it('returns bespoke defaults per format (case-insensitive)', () => {
    expect(getDefaultStockThresholds('RETAIL')).toMatchObject({
      safetyStock: 3,
      reorderPoint: 6,
    });
    expect(getDefaultStockThresholds('hotel')).toMatchObject({
      safetyStock: 4,
      reorderPoint: 8,
    });
  });

  it('falls back for unknown / empty formats', () => {
    expect(getDefaultStockThresholds('NOPE')).toEqual(
      FALLBACK_STOCK_THRESHOLDS,
    );
    expect(getDefaultStockThresholds(null)).toEqual(FALLBACK_STOCK_THRESHOLDS);
  });
});

describe('resolveEffectiveStockStatus', () => {
  it('preserves legacy behaviour when no serviceFormat is supplied', () => {
    // Un-configured, qty 2: legacy ladder → safety 0 so available(2) > max(0,1) → HEALTHY.
    const sig = resolveEffectiveStockStatus({
      quantityOnHand: 2,
      availableToSell: 2,
      safetyStock: 0,
      reorderPoint: 0,
    });
    expect(sig).toEqual({
      stockStatus: 'HEALTHY',
      shortageToSafetyStock: 0,
      estimated: false,
    });
  });

  it('keeps configured SKUs on the legacy ladder even with a format', () => {
    const sig = resolveEffectiveStockStatus(
      {
        quantityOnHand: 4,
        availableToSell: 4,
        safetyStock: 5,
        reorderPoint: 8,
      },
      'RETAIL',
    );
    expect(sig).toMatchObject({ stockStatus: 'REORDER_NOW', estimated: false });
  });

  it('estimates un-configured SKUs from the format default', () => {
    // RETAIL default safety 3 → available 2 is REORDER_NOW.
    const reorder = resolveEffectiveStockStatus(
      {
        quantityOnHand: 2,
        availableToSell: 2,
        safetyStock: 0,
        reorderPoint: 0,
      },
      'RETAIL',
    );
    expect(reorder).toEqual({
      stockStatus: 'REORDER_NOW',
      shortageToSafetyStock: 1,
      estimated: true,
    });
    // available 5 sits in the LOW_STOCK band (<= reorder 6, > safety 3).
    const low = resolveEffectiveStockStatus(
      {
        quantityOnHand: 5,
        availableToSell: 5,
        safetyStock: 0,
        reorderPoint: 0,
      },
      'RETAIL',
    );
    expect(low).toMatchObject({ stockStatus: 'LOW_STOCK', estimated: true });
    // well stocked stays HEALTHY (used default, not flagged).
    const healthy = resolveEffectiveStockStatus(
      {
        quantityOnHand: 20,
        availableToSell: 20,
        safetyStock: 0,
        reorderPoint: 0,
      },
      'RETAIL',
    );
    expect(healthy).toMatchObject({ stockStatus: 'HEALTHY', estimated: false });
  });

  it('always flags zero on-hand as OUT_OF_STOCK', () => {
    const sig = resolveEffectiveStockStatus(
      {
        quantityOnHand: 0,
        availableToSell: 0,
        safetyStock: 0,
        reorderPoint: 0,
      },
      'HOTEL',
    );
    expect(sig.stockStatus).toBe('OUT_OF_STOCK');
    expect(sig.estimated).toBe(false);
  });

  it('applies the format-specific band (HOTEL safety 4)', () => {
    const sig = resolveEffectiveStockStatus(
      {
        quantityOnHand: 4,
        availableToSell: 4,
        safetyStock: 0,
        reorderPoint: 0,
      },
      'HOTEL',
    );
    expect(sig.stockStatus).toBe('REORDER_NOW');
  });
});
