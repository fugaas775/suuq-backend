import {
  getFreeGrantsClosedAt,
  getFreePeriodEndsAt,
  isFreePeriodOpen,
} from './free-period.policy';

describe('free-workspace promotion', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('stopped handing out new free workspaces on 21 November 2026', () => {
    delete process.env.POS_FREE_GRANTS_CLOSED_AT;
    delete process.env.POS_FREE_PERIOD_ENDS_AT;
    expect(getFreeGrantsClosedAt().toISOString()).toBe(
      '2026-11-20T21:00:00.000Z',
    );
    expect(isFreePeriodOpen(Date.parse('2026-11-20T12:00:00+03:00'))).toBe(
      true,
    );
    expect(isFreePeriodOpen(Date.parse('2026-11-21T09:00:00+03:00'))).toBe(
      false,
    );
  });

  it('leaves the end date of workspaces already granted where it was', () => {
    delete process.env.POS_FREE_PERIOD_ENDS_AT;
    expect(getFreePeriodEndsAt().toISOString()).toBe(
      '2026-12-31T20:59:59.999Z',
    );
  });

  it('can be reopened by moving the closing date, and ignores a typo', () => {
    process.env.POS_FREE_GRANTS_CLOSED_AT = '2099-01-01T00:00:00Z';
    expect(isFreePeriodOpen(Date.parse('2026-11-25T09:00:00+03:00'))).toBe(
      true,
    );
    process.env.POS_FREE_GRANTS_CLOSED_AT = 'not-a-date';
    expect(isFreePeriodOpen(Date.parse('2026-11-25T09:00:00+03:00'))).toBe(
      false,
    );
  });
});
