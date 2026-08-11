import {
  getDefaultStockThresholds,
  resolveEffectiveStockStatus,
  FALLBACK_STOCK_THRESHOLDS,
  STOCK_THRESHOLD_DEFAULTS,
} from './stock-thresholds';
import { SellerBranchServiceFormat } from '../seller-workspace/dto/create-seller-branch-workspace.dto';

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

/**
 * Drift guard for the frontend mirror.
 *
 * PRINTING_PRESS shipped with bespoke thresholds on the frontend and NO entry
 * here, so it silently fell through to FALLBACK on this side — invisible to
 * every existing test because falling back is also the correct behaviour for a
 * genuinely unknown format. There is no way to import the frontend SSOT from
 * this repo, so the invariant is enforced against the service-format enum
 * instead: every format POS-S can create must be a DELIBERATE choice here,
 * either bespoke or explicitly listed as intentionally-fallback.
 *
 * Adding a format to the enum without touching this file now fails the suite.
 * When it does: check pos-s `src/features/stock-health/stockThresholds.js` and
 * either mirror its numbers or add the format to INTENTIONALLY_FALLBACK below.
 */
const INTENTIONALLY_FALLBACK: ReadonlySet<string> = new Set([
  // Retail-shaped formats that share RETAIL's 3/6/12 — the fallback IS their
  // value, and the frontend map likewise gives them no bespoke entry.
  'PHARMACY',
  'GROCERY',
  'BUTCHERY',
  'GAS_STATION',
  'ELECTRONICS',
]);

describe('stock threshold defaults mirror the frontend SSOT', () => {
  it('gives every POS-S service format a deliberate threshold', () => {
    const undecided = Object.values(SellerBranchServiceFormat).filter(
      (format) =>
        !STOCK_THRESHOLD_DEFAULTS[format] &&
        !INTENTIONALLY_FALLBACK.has(format),
    );
    expect(undecided).toEqual([]);
  });

  it('pins the numbers the frontend applies to the same raw fields', () => {
    // Hand-mirrored from pos-s STOCK_THRESHOLD_DEFAULTS. If a value here is
    // edited without editing the frontend (or vice versa) the two sides stop
    // agreeing on an un-configured SKU's status and the surfaces contradict.
    expect(STOCK_THRESHOLD_DEFAULTS).toEqual({
      RETAIL: { safetyStock: 3, reorderPoint: 6, parLevel: 12 },
      QSR: { safetyStock: 5, reorderPoint: 10, parLevel: 20 },
      CAFETERIA: { safetyStock: 5, reorderPoint: 10, parLevel: 20 },
      BAKERY: { safetyStock: 5, reorderPoint: 10, parLevel: 20 },
      HOTEL: { safetyStock: 4, reorderPoint: 8, parLevel: 16 },
      LAUNDRY: { safetyStock: 3, reorderPoint: 6, parLevel: 12 },
      BARBER: { safetyStock: 3, reorderPoint: 6, parLevel: 12 },
      PROPERTY_RENTAL: { safetyStock: 2, reorderPoint: 4, parLevel: 8 },
      PRINTING_PRESS: { safetyStock: 6, reorderPoint: 12, parLevel: 24 },
      SCHOOL: { safetyStock: 3, reorderPoint: 6, parLevel: 12 },
    });
  });

  it('estimates a print shop on the deeper band, not the retail fallback', () => {
    // 8 reels: HEALTHY under the old fallback (reorder 6), LOW_STOCK now —
    // matching what Stock Health already showed the operator.
    const sig = resolveEffectiveStockStatus(
      {
        quantityOnHand: 8,
        availableToSell: 8,
        safetyStock: 0,
        reorderPoint: 0,
      },
      'PRINTING_PRESS',
    );
    expect(sig).toMatchObject({ stockStatus: 'LOW_STOCK', estimated: true });
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
