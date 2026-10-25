import {
  SCHOOL_FEE_EXCUSE_KEY,
  feeExcuseChanged,
  keepStoredFeeExcuse,
} from './school-fee-excuse.policy';

describe('school-fee-excuse.policy', () => {
  const E = { before: '2026-10-11', reason: 'Pledged' };

  it('reads a set, a lift and a different excuse as a change — absent as none', () => {
    expect(feeExcuseChanged({}, { [SCHOOL_FEE_EXCUSE_KEY]: E })).toBe(true);
    expect(
      feeExcuseChanged(
        { [SCHOOL_FEE_EXCUSE_KEY]: E },
        { [SCHOOL_FEE_EXCUSE_KEY]: null },
      ),
    ).toBe(true);
    expect(
      feeExcuseChanged(
        { [SCHOOL_FEE_EXCUSE_KEY]: E },
        { [SCHOOL_FEE_EXCUSE_KEY]: { ...E } },
      ),
    ).toBe(false);
    expect(feeExcuseChanged({}, { [SCHOOL_FEE_EXCUSE_KEY]: null })).toBe(false);
    expect(feeExcuseChanged({ [SCHOOL_FEE_EXCUSE_KEY]: E }, {})).toBe(false);
  });

  it('puts the stored excuse back, or none', () => {
    expect(
      keepStoredFeeExcuse(
        { [SCHOOL_FEE_EXCUSE_KEY]: E },
        { a: 1, [SCHOOL_FEE_EXCUSE_KEY]: null },
      ),
    ).toEqual({ a: 1, [SCHOOL_FEE_EXCUSE_KEY]: E });
    expect(
      keepStoredFeeExcuse({}, { a: 1, [SCHOOL_FEE_EXCUSE_KEY]: E }),
    ).toEqual({ a: 1 });
  });
});
