import { ConsumerCatalogController } from './consumer-catalog.controller';
import { ConsumerShelfService } from './consumer-shelf.service';

/**
 * The marketplace's page order is a server promise the web page can no
 * longer keep on its own, since the server pages: photographs first, then a
 * round-robin across shops, then names, with the link id as the total
 * tiebreak. These cases pin the order the builder is asked for.
 */
describe('ConsumerCatalogController.search ordering', () => {
  function build() {
    const qb: Record<string, jest.Mock> = {};
    for (const m of [
      'innerJoin',
      'where',
      'andWhere',
      'select',
      'addSelect',
      'orderBy',
      'addOrderBy',
      'offset',
      'limit',
      'groupBy',
    ]) {
      qb[m] = jest.fn().mockReturnValue(qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.getCount = jest.fn().mockResolvedValue(0);

    const catalogLinkRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const vendorStoreRepo = { find: jest.fn().mockResolvedValue([]) };
    const shelf = new ConsumerShelfService(
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      catalogLinkRepo as never,
    );
    const controller = new ConsumerCatalogController(
      catalogLinkRepo as never,
      vendorStoreRepo as never,
      shelf,
    );
    return { controller, qb };
  }

  it('asks for photographs first, then the per-shop round-robin, then names', async () => {
    const { controller, qb } = build();
    await controller.search({});

    expect(qb.addSelect).toHaveBeenCalledWith(
      expect.stringMatching(/img\/initials/),
      'photo_rank',
    );
    // Each shop's own rank is photographs-first too, so the spread opens on
    // pictures from every shop that has them.
    expect(qb.addSelect).toHaveBeenCalledWith(
      expect.stringMatching(
        /ROW_NUMBER\(\) OVER \(PARTITION BY b\.id ORDER BY CASE WHEN .*img\/initials.*, p\.name, bcl\.id\)/,
      ),
      'shop_rank',
    );
    expect(qb.orderBy).toHaveBeenCalledWith('"photo_rank"', 'ASC');
    const tail = qb.addOrderBy.mock.calls.map((call) => call[0]);
    expect(tail).toEqual(['"shop_rank"', 'b.name', 'p.name', 'bcl.id']);
  });
});
