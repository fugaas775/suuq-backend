import { shouldEnableTaxForNewBranch } from './branch.entity';

describe('shouldEnableTaxForNewBranch', () => {
  it('starts a branch with a tax id charging tax', () => {
    expect(shouldEnableTaxForNewBranch('0001234567')).toBe(true);
  });

  it('starts a branch with no tax id untaxed', () => {
    // Charging VAT while unregistered is an offence, and there would be no TIN
    // to print on the invoice. Self-serve signup collects neither.
    expect(shouldEnableTaxForNewBranch(null)).toBe(false);
    expect(shouldEnableTaxForNewBranch(undefined)).toBe(false);
    expect(shouldEnableTaxForNewBranch('')).toBe(false);
  });

  it('does not count whitespace as a tax id', () => {
    expect(shouldEnableTaxForNewBranch('   ')).toBe(false);
  });
});
