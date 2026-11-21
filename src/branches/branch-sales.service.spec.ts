import { DataSource } from 'typeorm';
import { addisCalendar, BranchSalesService } from './branch-sales.service';

/**
 * The Branches page tells the platform which businesses are trading. Two things
 * have to hold for that to be trusted: "today" and "this month" turn over on
 * the Addis Ababa clock, not the server's, and a branch that sold nothing still
 * gets a row saying so.
 */
describe('addisCalendar', () => {
  it('starts the day and the month at Addis midnight', () => {
    // 23:30 UTC on the 20th is already 02:30 on the 21st in Addis.
    const cal = addisCalendar(new Date('2026-11-20T23:30:00Z'));
    expect(cal.dayStart.toISOString()).toBe('2026-11-20T21:00:00.000Z');
    expect(cal.tomorrowStart.toISOString()).toBe('2026-11-21T21:00:00.000Z');
    expect(cal.yesterdayStart.toISOString()).toBe('2026-11-19T21:00:00.000Z');
    expect(cal.monthStart.toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(cal.lastMonthStart.toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });

  it('rolls the month over at Addis midnight, three hours before UTC does', () => {
    const cal = addisCalendar(new Date('2026-11-30T21:30:00Z'));
    expect(cal.monthStart.toISOString()).toBe('2026-11-30T21:00:00.000Z');
    expect(cal.lastMonthStart.toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });

  it('gives thirty Addis dates ending today', () => {
    const cal = addisCalendar(new Date('2026-11-21T09:00:00Z'));
    expect(cal.thirtyDayKeys).toHaveLength(30);
    expect(cal.thirtyDayKeys[0]).toBe('2026-10-23');
    expect(cal.thirtyDayKeys[29]).toBe('2026-11-21');
  });

  it('compares against the same point of last month, never past its end', () => {
    // 31 March, late: February has no 31st, so the comparison stops at its end.
    const cal = addisCalendar(new Date('2026-03-31T18:00:00Z'));
    expect(cal.lastMonthSamePoint.getTime()).toBe(cal.monthStart.getTime());
    const mid = addisCalendar(new Date('2026-11-10T09:00:00Z'));
    expect(mid.lastMonthSamePoint.toISOString()).toBe(
      '2026-10-10T09:00:00.000Z',
    );
  });
});

describe('BranchSalesService', () => {
  const now = new Date('2026-11-21T09:00:00Z');
  let query: jest.Mock;
  let service: BranchSalesService;

  beforeEach(() => {
    query = jest.fn();
    service = new BranchSalesService({ query } as unknown as DataSource);
  });

  it('reads no checkouts when there are no branches to report on', async () => {
    await expect(service.summariesFor([], now)).resolves.toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });

  it('reports a quiet branch as zero, and a trading one with its figures', async () => {
    query.mockResolvedValue([
      {
        branchId: 47,
        todayNet: '14250.50',
        todayCount: '37',
        monthNet: '412800.00',
        monthCount: '1094',
        currency: 'ETB',
        lastSaleAt: new Date('2026-11-21T08:48:00Z'),
      },
      {
        branchId: 81,
        todayNet: null,
        todayCount: null,
        monthNet: null,
        monthCount: null,
        currency: null,
        lastSaleAt: null,
      },
    ]);

    const result = await service.summariesFor([47, 81], now);

    expect(result.get(47)).toEqual({
      today: { net: 14250.5, count: 37 },
      month: { net: 412800, count: 1094 },
      lastSaleAt: new Date('2026-11-21T08:48:00Z'),
      currency: 'ETB',
    });
    expect(result.get(81)).toEqual({
      today: { net: 0, count: 0 },
      month: { net: 0, count: 0 },
      lastSaleAt: null,
      currency: null,
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(`c.status NOT IN ('VOIDED', 'FAILED')`);
    expect(sql).toContain(`WHEN c."transactionType" = 'RETURN' THEN -c.total`);
    expect(params).toEqual([
      new Date('2026-10-31T21:00:00Z'),
      new Date('2026-11-20T21:00:00Z'),
      new Date('2026-11-21T21:00:00Z'),
      [47, 81],
    ]);
  });

  it('ranks by this month and narrows to the branches in scope', async () => {
    query.mockResolvedValue([
      { id: 47, total: '2' },
      { id: 12, total: '2' },
    ]);

    const result = await service.rankBranchIds(
      {
        search: 'hotel',
        serviceFormat: 'HOTEL',
        isActive: true,
        sort: 'month',
        order: 'DESC',
        page: 2,
        limit: 25,
      },
      now,
    );

    expect(result).toEqual({ ids: [47, 12], total: 2 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('b.name ILIKE $4');
    expect(sql).toContain('b."serviceFormat"::text = $5');
    expect(sql).toContain('b."isActive" = $6');
    expect(sql).toContain(
      'ORDER BY COALESCE(s."monthNet", 0) DESC, b."createdAt" DESC',
    );
    expect(sql).toContain('LIMIT $7 OFFSET $8');
    expect(params.slice(3)).toEqual(['%hotel%', 'HOTEL', true, 25, 25]);
  });

  it('finds branches that have gone silent for a week, and those that never sold', async () => {
    query.mockResolvedValue([]);

    await service.rankBranchIds(
      { activity: 'SILENT_7_DAYS', page: 1, limit: 25 },
      now,
    );
    let [sql, params] = query.mock.calls[0];
    expect(sql).toContain(
      'ls."occurredAt" IS NOT NULL AND ls."occurredAt" < $4',
    );
    expect(params[3]).toEqual(new Date('2026-11-14T09:00:00Z'));

    await service.rankBranchIds(
      { activity: 'NEVER_SOLD', page: 1, limit: 25 },
      now,
    );
    [sql, params] = query.mock.calls[1];
    expect(sql).toContain('ls."occurredAt" IS NULL');
  });

  it('builds the drawer: totals, a gap-free 30-day strip, and cash net of change', async () => {
    query
      .mockResolvedValueOnce([
        {
          todayNet: '1000',
          todayCount: '4',
          yesterdayNet: '800',
          yesterdayCount: '3',
          monthNet: '20000',
          monthCount: '70',
          lastMonthNet: '45000',
          lastMonthCount: '160',
          lastMonthToDateNet: '18000',
          lastMonthToDateCount: '65',
          currency: 'ETB',
        },
      ])
      .mockResolvedValueOnce([
        { date: '2026-11-21', net: '1000', count: '4' },
        { date: '2026-11-19', net: '-50', count: '0' },
      ])
      .mockResolvedValueOnce([
        { method: 'CASH', amount: '15500', count: '50' },
        { method: 'EBIRR', amount: '5000', count: '20' },
      ])
      .mockResolvedValueOnce([
        {
          firstSaleAt: new Date('2026-02-01T07:00:00Z'),
          lastSaleAt: new Date('2026-11-21T08:48:00Z'),
          monthChange: '500',
        },
      ]);

    const detail = await service.detailFor(47, now);

    expect(detail.today).toEqual({ net: 1000, count: 4 });
    expect(detail.lastMonthToDate).toEqual({ net: 18000, count: 65 });
    expect(detail.daily).toHaveLength(30);
    expect(detail.daily[29]).toEqual({
      date: '2026-11-21',
      net: 1000,
      count: 4,
    });
    expect(detail.daily[28]).toEqual({ date: '2026-11-20', net: 0, count: 0 });
    expect(detail.daily[27]).toEqual({
      date: '2026-11-19',
      net: -50,
      count: 0,
    });
    expect(detail.tenders).toEqual([
      { method: 'CASH', amount: 15000, count: 50 },
      { method: 'EBIRR', amount: 5000, count: 20 },
    ]);
    expect(detail.firstSaleAt).toEqual(new Date('2026-02-01T07:00:00Z'));
  });
});
