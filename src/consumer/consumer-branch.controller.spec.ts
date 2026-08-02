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
      find: jest.fn().mockResolvedValue([]),
    };
    const branchInventoryRepo = { find: jest.fn().mockResolvedValue([]) };
    const kitchenAvailabilityRepo = { find: jest.fn().mockResolvedValue([]) };

    const controller = new ConsumerBranchController(
      branchesRepository as never,
      vendorStoreRepo as never,
      productRepo as never,
      catalogLinkRepo as never,
      branchInventoryRepo as never,
      kitchenAvailabilityRepo as never,
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
      // This branch tracks no inventory for the item, which must stay buyable
      // rather than reading as sold out.
      stockState: 'UNKNOWN',
      updatedAt: null,
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

    expect(res).toEqual({
      items: [],
      total: 0,
      page: 2,
      limit: 10,
      catalogSource: 'VENDOR_STORE_FALLBACK',
      version: '0-0',
    });
    expect(vendorStoreRepo.findOne).toHaveBeenCalledWith({
      where: { branchId: 123, isConsumerVisible: true },
    });
  });
});

/**
 * The consumer storefront id is resolved from the `vendor_stores` side — the
 * same predicate the listing filters on — rather than read off
 * `branch.vendorStoreId`, which is the drift-prone half of an unenforced 1:1.
 */
describe('ConsumerBranchController.getBranch storeId', () => {
  function buildController(opts: {
    branch: unknown;
    stores: Array<{ id: number; branchId: number | null }>;
  }) {
    const branchesRepository = {
      findOne: jest.fn().mockResolvedValue(opts.branch),
    };
    const vendorStoreRepo = {
      find: jest.fn().mockResolvedValue(opts.stores),
      findOne: jest.fn(),
    };
    const controller = new ConsumerBranchController(
      branchesRepository as never,
      vendorStoreRepo as never,
      { createQueryBuilder: jest.fn() } as never,
      { count: jest.fn() } as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
    );
    return { controller, vendorStoreRepo };
  }

  const branch = {
    id: 44,
    name: 'Blue Hotel',
    serviceFormat: 'HOTEL',
    isActive: true,
    // Deliberately disagrees with the store that actually points at this branch.
    vendorStoreId: 999,
  };

  it('reports the store that points back at the branch, not what the branch claims', async () => {
    const { controller, vendorStoreRepo } = buildController({
      branch,
      stores: [{ id: 12, branchId: 44 }],
    });

    const res = await controller.getBranch(44);

    expect(res.storeId).toBe(12);
    expect(vendorStoreRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isConsumerVisible: true }),
      }),
    );
  });

  it('reports null when no consumer-visible store points at the branch', async () => {
    const { controller } = buildController({ branch, stores: [] });

    const res = await controller.getBranch(44);

    // Null means "no storefront" — clients degrade rather than falling back to
    // the branch id and addressing a different shop.
    expect(res.storeId).toBeNull();
  });
});

/**
 * The shelf must say what a shopper can actually buy right now. Two independent
 * sources feed it — physical stock in `branch_inventory`, and the kitchen 86-list
 * where staff take a dish off regardless of counted stock — and the stricter one
 * wins.
 */
describe('ConsumerBranchController shelf truth', () => {
  function buildController(opts: {
    products: unknown[];
    links?: unknown[];
    inventory?: unknown[];
    kitchen?: unknown[];
  }) {
    const baseQb: Record<string, jest.Mock> = {};
    for (const m of [
      'where',
      'andWhere',
      'innerJoin',
      'leftJoinAndSelect',
      'orderBy',
      'skip',
      'take',
    ]) {
      baseQb[m] = jest.fn().mockReturnValue(baseQb);
    }
    baseQb.getMany = jest.fn().mockResolvedValue(opts.products);
    baseQb.clone = jest.fn().mockReturnValue({
      getCount: jest.fn().mockResolvedValue(opts.products.length),
    });

    const controller = new ConsumerBranchController(
      { findOne: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { createQueryBuilder: jest.fn().mockReturnValue(baseQb) } as never,
      {
        // Non-zero link count selects the branch-catalog path.
        count: jest.fn().mockResolvedValue(opts.products.length),
        find: jest.fn().mockResolvedValue(opts.links ?? []),
      } as never,
      { find: jest.fn().mockResolvedValue(opts.inventory ?? []) } as never,
      { find: jest.fn().mockResolvedValue(opts.kitchen ?? []) } as never,
    );
    return { controller };
  }

  const burger = { id: 10, name: 'Burger', price: 200, tags: [] };
  const fries = { id: 11, name: 'Fries', price: 80, tags: [] };

  it('bands stock rather than leaking the count', async () => {
    const { controller } = buildController({
      products: [burger, fries],
      inventory: [
        { productId: 10, availableToSell: 42, safetyStock: 5 },
        { productId: 11, availableToSell: 3, safetyStock: 5 },
      ],
    });

    const res = await controller.getBranchProducts(7);

    expect(res.items[0].stockState).toBe('IN_STOCK');
    expect(res.items[1].stockState).toBe('LOW');
    // The exact on-hand number is competitively sensitive and never shipped.
    expect(JSON.stringify(res.items)).not.toContain('42');
  });

  it('reports zero available as out of stock', async () => {
    const { controller } = buildController({
      products: [burger],
      inventory: [{ productId: 10, availableToSell: 0, safetyStock: 5 }],
    });

    const res = await controller.getBranchProducts(7);

    expect(res.items[0].stockState).toBe('OUT_OF_STOCK');
  });

  it('keeps untracked items buyable', async () => {
    const { controller } = buildController({ products: [burger] });

    const res = await controller.getBranchProducts(7);

    // Most branches track no inventory for services or made-to-order food.
    // Reading "no row" as sold out would empty their shelves.
    expect(res.items[0].stockState).toBe('UNKNOWN');
  });

  it('lets the kitchen 86-list override counted stock', async () => {
    const { controller } = buildController({
      products: [burger],
      inventory: [{ productId: 10, availableToSell: 99, safetyStock: 5 }],
      // productId is varchar on the 86 table.
      kitchen: [{ productId: '10', available: false }],
    });

    const res = await controller.getBranchProducts(7);

    // Stock says plenty; the pass says no. The pass wins.
    expect(res.items[0].stockState).toBe('OUT_OF_STOCK');
  });

  it('declares the shelf as real POS truth and versions it', async () => {
    const { controller } = buildController({
      products: [burger],
      links: [
        {
          productId: 10,
          retailPrice: 250,
          updatedAt: new Date('2026-08-01T10:00:00.000Z'),
        },
      ],
    });

    const res = await controller.getBranchProducts(7);

    expect(res.catalogSource).toBe('BRANCH_CATALOG');
    // Per-branch price override beats the shared product price.
    expect(res.items[0].price).toBe(250);
    expect(res.items[0].updatedAt).toBe('2026-08-01T10:00:00.000Z');
    // Version moves with the newest shelf change, so a client can skip a
    // re-render cheaply.
    expect(res.version).toBe(`1-${Date.parse('2026-08-01T10:00:00.000Z')}`);
  });
});
