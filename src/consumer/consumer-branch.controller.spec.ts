import { ConsumerBranchController } from './consumer-branch.controller';

/**
 * Unit tests for ConsumerBranchController.getBranchProducts.
 *
 * Focus: the consumer catalog now surfaces `productType` and lower-cased
 * `tags`, which consumer clients use to classify items (HOTEL room charges
 * carry the "room" tag). Pagination must count without the to-many tag join.
 */
describe('ConsumerBranchController.getBranchProducts', () => {
  function buildController(opts: {
    store: unknown;
    products: unknown[];
    count: number;
  }) {
    const getMany = jest.fn().mockResolvedValue(opts.products);
    const getCount = jest.fn().mockResolvedValue(opts.count);

    // The base query builder is chainable and returns itself; clone() yields a
    // separate builder used purely for the count query.
    const baseQb: Record<string, jest.Mock> = {};
    for (const m of [
      'where',
      'andWhere',
      'leftJoinAndSelect',
      'orderBy',
      'skip',
      'take',
    ]) {
      baseQb[m] = jest.fn().mockReturnValue(baseQb);
    }
    baseQb.getMany = getMany;
    baseQb.clone = jest.fn().mockReturnValue({ getCount });

    const productRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(baseQb),
    };
    const vendorStoreRepo = {
      findOne: jest.fn().mockResolvedValue(opts.store),
    };
    const branchesRepository = { findOne: jest.fn() };
    const catalogLinkRepo = {
      count: jest.fn().mockResolvedValue(0),
    };

    const controller = new ConsumerBranchController(
      branchesRepository as never,
      vendorStoreRepo as never,
      productRepo as never,
      catalogLinkRepo as never,
    );
    return { controller, baseQb, getCount, vendorStoreRepo };
  }

  it('returns productType and lower-cased tags for each product', async () => {
    const { controller } = buildController({
      store: { id: 99 },
      count: 2,
      products: [
        {
          id: 1425,
          name: 'Standard Room — 1 Night',
          price: '3500',
          currency: 'ETB',
          imageUrl: 'https://cdn/standard.webp',
          productType: 'service',
          tags: [{ name: 'Hotel' }, { name: 'Room' }, { name: 'Nightly' }],
        },
        {
          id: 1427,
          name: 'Breakfast Buffet',
          price: '380',
          currency: 'ETB',
          imageUrl: null,
          productType: 'service',
          tags: [{ name: 'hotel' }, { name: 'fnb' }],
        },
      ],
    });

    const res = await controller.getBranchProducts(49, '1', '50');

    expect(res.total).toBe(2);
    expect(res.items[0]).toEqual({
      id: 1425,
      name: 'Standard Room — 1 Night',
      price: 3500,
      currency: 'ETB',
      imageUrl: 'https://cdn/standard.webp',
      productType: 'service',
      tags: ['hotel', 'room', 'nightly'],
    });
    // Room charge is distinguishable by the "room" tag.
    expect(res.items[0].tags).toContain('room');
    expect(res.items[1].tags).not.toContain('room');
  });

  it('tolerates products with no tags and null productType', async () => {
    const { controller } = buildController({
      store: { id: 1 },
      count: 1,
      products: [
        {
          id: 1,
          name: 'Legacy Item',
          price: 100,
          currency: 'ETB',
          imageUrl: null,
          productType: null,
          tags: null,
        },
      ],
    });

    const res = await controller.getBranchProducts(7);

    expect(res.items[0].tags).toEqual([]);
    expect(res.items[0].productType).toBeNull();
  });

  it('counts via a cloned builder so the tag join does not inflate totals', async () => {
    const { controller, baseQb, getCount } = buildController({
      store: { id: 5 },
      count: 24,
      products: [],
    });

    await controller.getBranchProducts(49);

    // Count happens on the clone (pre-join); the join is applied only to the
    // row-fetching builder.
    expect(baseQb.clone).toHaveBeenCalledTimes(1);
    expect(getCount).toHaveBeenCalledTimes(1);
    expect(baseQb.leftJoinAndSelect).toHaveBeenCalledWith('p.tags', 'tag');
  });

  it('excludes soft-deleted products (deleted_at is a plain column, not auto-filtered)', async () => {
    const { controller, baseQb } = buildController({
      store: { id: 5 },
      count: 0,
      products: [],
    });

    await controller.getBranchProducts(49);

    // The base builder must filter out soft-deleted rows so the count and the
    // fetched rows both exclude them.
    expect(baseQb.andWhere).toHaveBeenCalledWith('p.deletedAt IS NULL');
  });

  it('returns an empty page when the branch has no consumer-visible store', async () => {
    const { controller, vendorStoreRepo } = buildController({
      store: null,
      count: 0,
      products: [],
    });

    const res = await controller.getBranchProducts(123, '2', '10');

    expect(res).toEqual({ items: [], total: 0, page: 2, limit: 10 });
    expect(vendorStoreRepo.findOne).toHaveBeenCalledWith({
      where: { branchId: 123, isConsumerVisible: true },
    });
  });
});
