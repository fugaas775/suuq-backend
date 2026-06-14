import { computeVariantKey } from './variant-key.util';

describe('computeVariantKey', () => {
  it('is order-independent', () => {
    expect(
      computeVariantKey({ size: 'M', color: 'Red', material: 'Cotton' }),
    ).toBe(computeVariantKey({ material: 'Cotton', color: 'Red', size: 'M' }));
  });

  it('is case-insensitive on keys and values', () => {
    expect(computeVariantKey({ Size: 'm', COLOR: 'red' })).toBe(
      computeVariantKey({ size: 'M', color: 'Red' }),
    );
  });

  it('produces a stable key:value|... format sorted by key', () => {
    expect(computeVariantKey({ size: 'M', color: 'Red' })).toBe(
      'color:red|size:m',
    );
  });

  it('trims and skips blank values', () => {
    expect(computeVariantKey({ size: '  L  ', color: '' })).toBe('size:l');
  });

  it('returns empty string for empty/invalid input', () => {
    expect(computeVariantKey({})).toBe('');
    expect(computeVariantKey(null)).toBe('');
    expect(computeVariantKey(undefined)).toBe('');
  });

  it('distinguishes different combinations', () => {
    const redM = computeVariantKey({ size: 'M', color: 'Red' });
    const blueM = computeVariantKey({ size: 'M', color: 'Blue' });
    expect(redM).not.toBe(blueM);
  });
});
