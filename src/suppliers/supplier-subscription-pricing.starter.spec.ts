import { isSupplierStarterEligible } from './supplier-subscription-pricing';

describe('isSupplierStarterEligible — the 14-day trial is for a new account only', () => {
  it('is offered to an account with no subscription row', () => {
    expect(isSupplierStarterEligible(null)).toBe(true);
    expect(isSupplierStarterEligible(undefined)).toBe(true);
  });

  it('is never offered to an account that is renewing', () => {
    // The free period, a BNPL or admin term written without a reference, an expired term.
    expect(
      isSupplierStarterEligible({
        metadata: { source: 'SUPPLIER_SELF_SERVE_FREE_PERIOD' },
      }),
    ).toBe(false);
    expect(
      isSupplierStarterEligible({ metadata: { fundingMode: 'EQUITY_BNPL' } }),
    ).toBe(false);
    expect(isSupplierStarterEligible({ metadata: null })).toBe(false);
    expect(
      isSupplierStarterEligible({
        metadata: { lastActivationReferenceId: 'SUPACT-1-2' },
      }),
    ).toBe(false);
  });
});
