import { ConsumerShelfService } from './consumer-shelf.service';

/**
 * The shelf rules, tested where they now live.
 *
 * `ConsumerBranchController` already covers the single-branch cases end to end.
 * What is new — and what has no other coverage — is that one product can sit on
 * several shelves at once and is not equally available or equally priced on all
 * of them. Getting that wrong shows a shopper a price or an in-stock badge they
 * cannot actually get.
 */
function buildService(opts: {
  inventory?: unknown[];
  kitchen?: unknown[];
  stockManaged?: unknown[];
  /** Rows the sellable-shelf query returns; see the resolveSellableLines block. */
  shelfRows?: unknown[];
}) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['innerJoin', 'where', 'andWhere', 'select']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb.getRawMany = jest.fn().mockResolvedValue(opts.shelfRows ?? []);

  return new ConsumerShelfService(
    { find: jest.fn().mockResolvedValue(opts.stockManaged ?? []) } as never,
    { find: jest.fn().mockResolvedValue(opts.inventory ?? []) } as never,
    { find: jest.fn().mockResolvedValue(opts.kitchen ?? []) } as never,
    { createQueryBuilder: jest.fn().mockReturnValue(qb) } as never,
  );
}

describe('ConsumerShelfService.resolveStockStatesForPairs', () => {
  it('bands the same product differently at different shops', async () => {
    const shelf = buildService({
      inventory: [
        { branchId: 1, productId: 10, availableToSell: 40, safetyStock: 5 },
        { branchId: 2, productId: 10, availableToSell: 0, safetyStock: 5 },
      ],
    });

    const states = await shelf.resolveStockStatesForPairs([
      { branchId: 1, productId: 10 },
      { branchId: 2, productId: 10 },
    ]);

    // The product is one row; its availability is not.
    expect(states.get('1:10')).toBe('IN_STOCK');
    expect(states.get('2:10')).toBe('OUT_OF_STOCK');
  });

  it("does not let one shop's 86 take an item off another shop's shelf", async () => {
    const shelf = buildService({
      inventory: [
        { branchId: 1, productId: 10, availableToSell: 40, safetyStock: 5 },
        { branchId: 2, productId: 10, availableToSell: 40, safetyStock: 5 },
      ],
      // Branch 1's kitchen is out of it. Branch 2's is not.
      kitchen: [{ branchId: 1, productId: '10', available: false }],
    });

    const states = await shelf.resolveStockStatesForPairs([
      { branchId: 1, productId: 10 },
      { branchId: 2, productId: 10 },
    ]);

    expect(states.get('1:10')).toBe('OUT_OF_STOCK');
    expect(states.get('2:10')).toBe('IN_STOCK');
  });

  it('keeps an untracked product buyable wherever it appears', async () => {
    const shelf = buildService({
      inventory: [
        { branchId: 1, productId: 10, availableToSell: 0, safetyStock: 0 },
      ],
      stockManaged: [{ id: 10, manageStock: false }],
    });

    const states = await shelf.resolveStockStatesForPairs([
      { branchId: 1, productId: 10 },
      { branchId: 2, productId: 10 },
    ]);

    // A café's zeroed onboarding rows are not a count of anything.
    expect(states.get('1:10')).toBe('UNKNOWN');
    expect(states.get('2:10')).toBe('UNKNOWN');
  });
});

/**
 * The wholesale-price leak this whole two-price model exists to prevent.
 *
 * A supplier's product row carries their *wholesale* price — `createProductOffer`
 * copies `unitWholesalePrice` straight onto `product.price`. If a shelf ever
 * falls back to `product.price` for a supplier outlet, the public sees the trade
 * price and every retailer reselling that product loses their margin.
 */
describe('ConsumerShelfService.effectivePrice', () => {
  const wholesaleProduct = { price: 80 };

  it('prefers the branch retail price over the shared product price', () => {
    const shelf = buildService({});
    expect(
      shelf.effectivePrice(
        { retailPrice: 120, retailSalePrice: null },
        wholesaleProduct,
      ),
    ).toBe(120);
  });

  it('prefers a sale price over the standing retail price', () => {
    const shelf = buildService({});
    expect(
      shelf.effectivePrice(
        { retailPrice: 120, retailSalePrice: 99 },
        wholesaleProduct,
      ),
    ).toBe(99);
  });

  it('falls back to the product price when no branch override exists', () => {
    const shelf = buildService({});
    // Correct for an ordinary branch — and precisely why a supplier outlet link
    // with a null retail price must never reach a consumer response. That guard
    // lives in the write path (SupplierOutletService.setOfferConsumerListing)
    // and in the read query (ConsumerCatalogController.baseQuery), because this
    // function cannot tell whose product it is holding.
    expect(shelf.effectivePrice(null, wholesaleProduct)).toBe(80);
    expect(
      shelf.effectivePrice(
        { retailPrice: null, retailSalePrice: null },
        wholesaleProduct,
      ),
    ).toBe(80);
  });
});

describe('ConsumerShelfService.shelfVersion', () => {
  it('moves when an item changes and when the count changes', () => {
    const shelf = buildService({});
    const base = [{ updatedAt: '2026-08-01T10:00:00.000Z' }];
    const repriced = [{ updatedAt: '2026-08-02T10:00:00.000Z' }];
    const extraItem = [...base, { updatedAt: '2026-08-01T09:00:00.000Z' }];

    expect(shelf.shelfVersion(base)).not.toBe(shelf.shelfVersion(repriced));
    expect(shelf.shelfVersion(base)).not.toBe(shelf.shelfVersion(extraItem));
    expect(shelf.shelfVersion([])).toBe('0-0');
  });
});
