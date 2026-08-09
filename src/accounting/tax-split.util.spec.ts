import { resolveBranchTaxRate, splitGrossTax } from './tax-split.util';

describe('resolveBranchTaxRate', () => {
  it('is zero while the branch has tax switched off, whatever rate is stored', () => {
    // Every branch carries a pre-filled 15% it is not charging. Reading the rate
    // without the gate would start taxing them all.
    expect(resolveBranchTaxRate({ taxEnabled: false, taxRate: 0.15 })).toBe(0);
  });

  it('reads the stored fraction when tax is on', () => {
    expect(resolveBranchTaxRate({ taxEnabled: true, taxRate: 0.15 })).toBe(
      0.15,
    );
  });

  it('is zero for a missing branch rather than guessing', () => {
    expect(resolveBranchTaxRate(null)).toBe(0);
    expect(resolveBranchTaxRate(undefined)).toBe(0);
  });

  it('ignores a nonsense rate', () => {
    expect(
      resolveBranchTaxRate({ taxEnabled: true, taxRate: Number.NaN }),
    ).toBe(0);
    expect(resolveBranchTaxRate({ taxEnabled: true, taxRate: -0.2 })).toBe(0);
  });
});

describe('splitGrossTax', () => {
  it('extracts the tax already inside a gross amount', () => {
    expect(splitGrossTax(1150, 0.15)).toEqual({ net: 1000, tax: 150 });
  });

  it('leaves the amount whole when the branch charges no tax', () => {
    expect(splitGrossTax(1150, 0)).toEqual({ net: 1150, tax: 0 });
  });

  it('always sums back to the gross, so a journal entry cannot drift', () => {
    // The tax is the remainder, not a second rounding of its own — the ledger
    // debits the gross and both credit legs have to meet it to the cent.
    for (const gross of [0.01, 3.33, 99.99, 1234.56, 7777.77]) {
      const { net, tax } = splitGrossTax(gross, 0.15);
      expect(Math.round((net + tax) * 100) / 100).toBe(gross);
    }
  });

  it('treats a negative rate as no tax rather than inventing a credit', () => {
    expect(splitGrossTax(500, -0.15)).toEqual({ net: 500, tax: 0 });
  });
});
