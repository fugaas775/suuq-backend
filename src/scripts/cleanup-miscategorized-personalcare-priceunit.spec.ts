import {
  hasAreaStylePriceUnit,
  hasAreaUnitTextSignal,
  isPersonalCareLike,
  parseCli,
  ProductProbeSource,
  stripInvalidAreaUnits,
} from '../../scripts/cleanup-miscategorized-personalcare-priceunit';

describe('cleanup-miscategorized-personalcare-priceunit regression', () => {
  it('detects personal-care listing with area-style unit signals', () => {
    const product: ProductProbeSource = {
      name: 'Rexona Men Deodorant',
      description: 'Long-lasting fragrance body spray',
      attributes: {
        brand: 'Rexona',
        priceUnit: '/m2',
        priceText: '250 ETB / m2',
      },
    };

    expect(isPersonalCareLike(product)).toBe(true);
    expect(hasAreaStylePriceUnit(product.attributes)).toBe(true);
    expect(hasAreaUnitTextSignal(product)).toBe(true);
  });

  it('strips only area-style unit keys and preserves other attributes', () => {
    const stripped = stripInvalidAreaUnits({
      priceUnit: 'm2',
      price_unit: 'sqft',
      brand: 'Nivea',
      size: '150ml',
    });

    expect(stripped.removed).toBe(true);
    expect(stripped.next).toEqual({
      brand: 'Nivea',
      size: '150ml',
    });
  });

  it('keeps non-area units out of cleanup scope', () => {
    expect(hasAreaStylePriceUnit({ priceUnit: 'pcs' })).toBe(false);
    expect(hasAreaStylePriceUnit({ price_unit: 'ml' })).toBe(false);
  });

  it('parses CLI execution flags safely', () => {
    const options = parseCli([
      '--execute',
      '--batch-size',
      '500',
      '--limit',
      '25',
    ]);

    expect(options.execute).toBe(true);
    expect(options.batchSize).toBe(500);
    expect(options.limit).toBe(25);
    expect(options.diagnostic).toBe(false);
  });
});
