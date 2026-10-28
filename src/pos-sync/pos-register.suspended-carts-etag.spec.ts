import { PosRegisterService } from './pos-register.service';
import { etagMatches, suspendedCartsListEtag } from './suspended-carts-etag';

/**
 * The register's poll of its held carts answers "nothing changed" from one
 * aggregate — count and newest write over the list's scope — before any row
 * is loaded. These pin the tag, the match, and that a matching If-None-Match
 * never reaches getManyAndCount.
 */
describe('suspendedCartsListEtag', () => {
  it('names the count, the newest write and the page', () => {
    const latest = new Date('2026-10-28T06:00:00.250Z');
    expect(
      suspendedCartsListEtag({ count: '12', latest, page: 2, perPage: 500 }),
    ).toBe(`W/"sc-12-${latest.getTime()}-2-500"`);
    // A string from the driver names the same instant.
    expect(
      suspendedCartsListEtag({
        count: 12,
        latest: latest.toISOString(),
        page: 2,
        perPage: 500,
      }),
    ).toBe(`W/"sc-12-${latest.getTime()}-2-500"`);
  });

  it('an empty scope has a tag too, and a different page a different one', () => {
    const empty = suspendedCartsListEtag({
      count: 0,
      latest: null,
      page: 1,
      perPage: 500,
    });
    expect(empty).toBe('W/"sc-0-0-1-500"');
    expect(
      suspendedCartsListEtag({ count: 0, latest: null, page: 2, perPage: 500 }),
    ).not.toBe(empty);
  });

  it('moves when a row is edited, added or taken out', () => {
    const base = {
      latest: new Date('2026-10-28T06:00:00Z'),
      page: 1,
      perPage: 500,
    };
    const a = suspendedCartsListEtag({ count: 3, ...base });
    expect(suspendedCartsListEtag({ count: 4, ...base })).not.toBe(a);
    expect(
      suspendedCartsListEtag({
        count: 3,
        ...base,
        latest: new Date('2026-10-28T06:00:01Z'),
      }),
    ).not.toBe(a);
  });
});

describe('etagMatches', () => {
  const tag = 'W/"sc-3-100-1-500"';
  it('matches the tag itself, weak or strong, alone or in a list', () => {
    expect(etagMatches(tag, tag)).toBe(true);
    expect(etagMatches('"sc-3-100-1-500"', tag)).toBe(true);
    expect(etagMatches('W/"other", W/"sc-3-100-1-500"', tag)).toBe(true);
    expect(etagMatches(['W/"x"', tag], tag)).toBe(true);
    expect(etagMatches('*', tag)).toBe(true);
  });
  it('does not match another version, or nothing', () => {
    expect(etagMatches('W/"sc-3-101-1-500"', tag)).toBe(false);
    expect(etagMatches(undefined, tag)).toBe(false);
    expect(etagMatches('', tag)).toBe(false);
  });
});

describe('PosRegisterService.findSuspendedCartsConditional', () => {
  function makeService(
    version: { count: string; latest: Date | null },
    rows: any[],
  ) {
    const qb: any = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      select: jest.fn(() => qb),
      addSelect: jest.fn(() => qb),
      getRawOne: jest.fn(async () => version),
      getManyAndCount: jest.fn(async () => [rows, rows.length]),
    };
    const suspendedCartsRepository: any = {
      createQueryBuilder: jest.fn(() => qb),
    };
    const service = new PosRegisterService(
      { findOne: jest.fn() } as any,
      suspendedCartsRepository,
      { findOne: jest.fn() } as any,
      { dispatchCloseReport: jest.fn() } as any,
      { findOne: jest.fn() } as any,
    );
    return { service, qb };
  }
  const row = {
    id: 7,
    branchId: 150,
    registerSessionId: null,
    registerId: 'front-counter-1',
    label: 'Grade 1A',
    status: 'SUSPENDED',
    currency: 'ETB',
    promoCode: null,
    itemCount: 1,
    total: 1800,
    note: null,
    cartSnapshot: { cartLines: [] },
    metadata: null,
    suspendedByUserId: 1,
    suspendedByName: 'Office',
    resumedAt: null,
    resumedByUserId: null,
    resumedByName: null,
    discardedAt: null,
    discardedByUserId: null,
    discardedByName: null,
    createdAt: new Date('2026-10-28T05:00:00Z'),
    updatedAt: new Date('2026-10-28T06:00:00Z'),
  };
  const query: any = {
    branchId: 150,
    page: 1,
    limit: 500,
    status: 'SUSPENDED',
    registerId: 'front-counter-1',
    includeConsumerOrders: true,
  };

  it('without a validator, reads the page and names its version', async () => {
    const { service, qb } = makeService({ count: '1', latest: row.updatedAt }, [
      row,
    ]);
    const result = await service.findSuspendedCartsConditional(
      query,
      undefined,
    );
    expect(result.notModified).toBe(false);
    expect(result.etag).toBe(`W/"sc-1-${row.updatedAt.getTime()}-1-500"`);
    expect(result.page?.items).toHaveLength(1);
    expect(result.page?.perPage).toBe(500);
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
  });

  it('with the current version, answers not-modified without loading a row', async () => {
    const { service, qb } = makeService({ count: '1', latest: row.updatedAt }, [
      row,
    ]);
    const first = await service.findSuspendedCartsConditional(query, undefined);
    const again = await service.findSuspendedCartsConditional(
      query,
      first.etag,
    );
    expect(again.notModified).toBe(true);
    expect(again.page).toBeNull();
    expect(again.etag).toBe(first.etag);
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
  });

  it('with a stale version, reads the page again', async () => {
    const { service, qb } = makeService(
      { count: '2', latest: new Date('2026-10-28T06:30:00Z') },
      [row, { ...row, id: 8 }],
    );
    const result = await service.findSuspendedCartsConditional(
      query,
      `W/"sc-1-${row.updatedAt.getTime()}-1-500"`,
    );
    expect(result.notModified).toBe(false);
    expect(result.page?.items).toHaveLength(2);
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
  });

  it('the plain list read is unchanged for its other callers', async () => {
    const { service, qb } = makeService({ count: '1', latest: row.updatedAt }, [
      row,
    ]);
    const page = await service.findSuspendedCarts(query);
    expect(page.items).toHaveLength(1);
    expect(page.totalPages).toBe(1);
    expect(qb.getRawOne).not.toHaveBeenCalled();
  });
});
