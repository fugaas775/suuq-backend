import {
  addBillingPeriods,
  computeBillingPeriods,
} from './property-rental-period.util';

describe('computeBillingPeriods (month-based lease math)', () => {
  it('returns 0 when dates are missing or invalid', () => {
    expect(computeBillingPeriods(null, '2026-06-01')).toBe(0);
    expect(computeBillingPeriods('2026-06-01', null)).toBe(0);
    expect(computeBillingPeriods('', '')).toBe(0);
  });

  it('returns 0 when the end precedes the start', () => {
    expect(computeBillingPeriods('2026-06-10', '2026-06-01')).toBe(0);
  });

  it('counts whole months and floors a partial trailing month', () => {
    expect(computeBillingPeriods('2026-01-15', '2026-02-15', 'MONTH')).toBe(1);
    expect(computeBillingPeriods('2026-01-15', '2026-02-14', 'MONTH')).toBe(1); // min 1 period when occupied
    expect(computeBillingPeriods('2026-01-01', '2026-04-01', 'MONTH')).toBe(3);
    expect(computeBillingPeriods('2026-01-01', '2026-04-20', 'MONTH')).toBe(3);
  });

  it('treats a month-end clamp as a complete month', () => {
    // Jan 31 → Feb 28: February has no 31st, so it counts as one full month.
    expect(computeBillingPeriods('2026-01-31', '2026-02-28', 'MONTH')).toBe(1);
  });

  it('always bills at least one period for an occupied lease', () => {
    expect(computeBillingPeriods('2026-06-01', '2026-06-01', 'MONTH')).toBe(1);
    expect(computeBillingPeriods('2026-06-01', '2026-06-05', 'MONTH')).toBe(1);
  });

  it('counts weeks for the WEEK cadence', () => {
    expect(computeBillingPeriods('2026-06-01', '2026-06-15', 'WEEK')).toBe(2);
    expect(computeBillingPeriods('2026-06-01', '2026-06-20', 'WEEK')).toBe(2);
    expect(computeBillingPeriods('2026-06-01', '2026-06-22', 'WEEK')).toBe(3);
  });
});

describe('addBillingPeriods', () => {
  it('adds whole months and clamps to month-end', () => {
    expect(addBillingPeriods('2026-01-01', 3, 'MONTH')).toBe('2026-04-01');
    expect(addBillingPeriods('2026-01-31', 1, 'MONTH')).toBe('2026-02-28');
    expect(addBillingPeriods('2024-01-31', 1, 'MONTH')).toBe('2024-02-29'); // leap year
  });

  it('adds weeks for the WEEK cadence', () => {
    expect(addBillingPeriods('2026-06-01', 2, 'WEEK')).toBe('2026-06-15');
  });

  it('returns null for an invalid start date', () => {
    expect(addBillingPeriods(null, 1, 'MONTH')).toBeNull();
  });
});
