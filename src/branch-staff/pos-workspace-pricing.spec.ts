import {
  isComplimentaryBranch,
  listMonthlyRateForFormat,
  monthlyRateForBranch,
  normalizeDiscountPercent,
  POS_BRANCH_STARTER_OPTION,
  priceOptionForBranch,
  requirePosBranchSubscriptionOption,
  starterOptionForBranch,
  subscriptionOptionsForBranch,
} from './pos-workspace-pricing';

/**
 * What a branch pays is its format's rate less the discount the platform has
 * granted it. These are the figures owners are quoted and charged, so they
 * are pinned to the birr.
 */
describe('branch subscription pricing', () => {
  const monthly = requirePosBranchSubscriptionOption('MONTHLY');
  const yearly = requirePosBranchSubscriptionOption('ONE_YEAR');

  it('leaves every format but school on the standard rate', () => {
    for (const serviceFormat of [
      'RETAIL',
      'HOTEL',
      'QSR',
      null,
      undefined,
      '',
    ]) {
      expect(listMonthlyRateForFormat(serviceFormat)).toBe(3900);
      expect(priceOptionForBranch(monthly, { serviceFormat }).amount).toBe(
        3900,
      );
      expect(priceOptionForBranch(yearly, { serviceFormat }).amount).toBe(
        42120,
      );
    }
  });

  it('prices a school at 4,900 a month and 52,920 a year', () => {
    const school = { serviceFormat: 'school' };
    expect(listMonthlyRateForFormat('SCHOOL')).toBe(4900);
    expect(priceOptionForBranch(monthly, school)).toMatchObject({
      amount: 4900,
      listAmount: 4900,
      discountPercent: 0,
      planCode: 'POS_BRANCH_1M',
    });
    expect(priceOptionForBranch(yearly, school).amount).toBe(52920);
    expect(subscriptionOptionsForBranch(school).map((o) => o.amount)).toEqual([
      4900, 52920,
    ]);
  });

  it('keeps the 14-day trial at 500 for a school', () => {
    expect(starterOptionForBranch({ serviceFormat: 'SCHOOL' }).amount).toBe(
      500,
    );
    expect(POS_BRANCH_STARTER_OPTION.amount).toBe(500);
  });

  it('takes a discount off the list price, keeping the list price alongside', () => {
    const half = { serviceFormat: 'SCHOOL', subscriptionDiscountPercent: 50 };
    expect(priceOptionForBranch(monthly, half)).toMatchObject({
      amount: 2450,
      listAmount: 4900,
      discountPercent: 50,
    });
    expect(priceOptionForBranch(yearly, half).amount).toBe(26460);
    expect(monthlyRateForBranch(half)).toBe(2450);
    expect(
      monthlyRateForBranch({
        serviceFormat: 'RETAIL',
        subscriptionDiscountPercent: '12.5',
      }),
    ).toBe(3412.5);
  });

  it('makes a branch complimentary at 100 %, and only at 100 %', () => {
    const free = { serviceFormat: 'SCHOOL', subscriptionDiscountPercent: 100 };
    expect(isComplimentaryBranch(free)).toBe(true);
    expect(priceOptionForBranch(monthly, free).amount).toBe(0);
    expect(priceOptionForBranch(yearly, free).amount).toBe(0);
    expect(starterOptionForBranch(free).amount).toBe(0);
    expect(isComplimentaryBranch({ subscriptionDiscountPercent: 99.99 })).toBe(
      false,
    );
    expect(isComplimentaryBranch(null)).toBe(false);
  });

  it('reads a discount it cannot trust as no discount, and caps it at 100', () => {
    expect(normalizeDiscountPercent(undefined)).toBe(0);
    expect(normalizeDiscountPercent('abc')).toBe(0);
    expect(normalizeDiscountPercent(-5)).toBe(0);
    expect(normalizeDiscountPercent(150)).toBe(100);
  });

  it('does not change the standard option it was given', () => {
    priceOptionForBranch(monthly, {
      serviceFormat: 'SCHOOL',
      subscriptionDiscountPercent: 100,
    });
    expect(monthly.amount).toBe(3900);
  });
});
