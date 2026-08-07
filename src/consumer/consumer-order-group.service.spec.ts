import { ConsumerOrderGroupService } from './consumer-order-group.service';

/**
 * What a checkout accepts from a stranger.
 *
 * `POST /consumer/v1/order-groups` is unauthenticated by design, so every field
 * in the body arrives from someone who may have written it by hand. These cases
 * fix the rule that the shelf — never the payload — decides what a thing is
 * called, what it costs, and whether it can be bought at all.
 *
 * The failure this replaced was not theoretical: `withConsumerCartLines` copies
 * the submitted `unitPrice` onto the register cart line, so a posted
 * `unitPrice: 1` reached the till reading ETB 1 for a 200 ETB drink.
 */

const SHELF = new Map<number, any>([
  [
    1748,
    {
      productId: 1748,
      name: 'Banana Milkshake',
      price: 200,
      currency: 'ETB',
      stockState: 'IN_STOCK',
    },
  ],
  [
    1840,
    {
      productId: 1840,
      name: 'Americano',
      price: 50,
      currency: 'ETB',
      stockState: 'UNKNOWN',
    },
  ],
]);

function buildService(opts: { shelf?: Map<number, any> } = {}) {
  const placed: any[] = [];
  const saved: any[] = [];

  const consumerOrderService = {
    validatePlacement: jest.fn().mockResolvedValue({ id: 79 }),
    placeOrder: jest.fn(async (dto: any) => {
      placed.push(dto);
      return {
        orderId: 5000 + placed.length,
        orderNumber: `C-500${placed.length}-AAAA`,
      };
    }),
    getOrderStatus: jest.fn().mockResolvedValue({ status: 'RECEIVED' }),
  };

  const groupRepo = {
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => {
      saved.push(v);
      return { ...v, id: '1', createdAt: new Date('2026-08-07T09:00:00Z') };
    }),
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn(),
  };
  // getGroup() re-reads at the end of placeGroup; give it the saved row back.
  groupRepo.findOne = jest.fn(async () =>
    saved.length
      ? { ...saved[0], id: '1', createdAt: new Date('2026-08-07T09:00:00Z') }
      : null,
  );

  const groupItemRepo = {
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => v),
    find: jest.fn().mockResolvedValue([]),
  };

  const shelf = {
    resolveSellableLines: jest.fn().mockResolvedValue(opts.shelf ?? SHELF),
  };

  const service = new ConsumerOrderGroupService(
    consumerOrderService as never,
    groupRepo as never,
    groupItemRepo as never,
    { find: jest.fn().mockResolvedValue([]) } as never,
    shelf as never,
  );

  return { service, consumerOrderService, groupRepo, placed, saved, shelf };
}

function basket(overrides: any = {}) {
  return {
    consumerName: 'Amina',
    consumerPhone: '0912345678',
    sellers: [
      {
        branchId: 79,
        serviceFormat: 'QSR',
        orderMode: 'TAKEAWAY',
        lines: [
          {
            productId: '1748',
            name: 'Banana Milkshake',
            quantity: 1,
            unitPrice: 200,
            currency: 'ETB',
          },
        ],
        ...(overrides.seller ?? {}),
      },
    ],
    ...(overrides.group ?? {}),
  };
}

describe('the shelf prices the order, not the shopper', () => {
  it('ignores a spoofed unit price and charges what the shop posts', async () => {
    const { service, placed, saved } = buildService();

    await service.placeGroup(
      basket({
        seller: {
          lines: [
            {
              productId: '1748',
              name: 'Banana Milkshake',
              quantity: 1,
              // A stranger's price for a 200 ETB drink.
              unitPrice: 1,
              currency: 'ETB',
            },
          ],
        },
      }),
    );

    // What reaches the till.
    expect(placed[0].lines[0].unitPrice).toBe(200);
    // And what the shopper is told they owe.
    expect(saved[0].total).toBe(200);
  });

  it('ignores a spoofed product name', async () => {
    const { service, placed } = buildService();

    await service.placeGroup(
      basket({
        seller: {
          lines: [
            {
              productId: '1748',
              name: 'FREE STAFF DRINK',
              quantity: 1,
              unitPrice: 200,
              currency: 'ETB',
            },
          ],
        },
      }),
    );

    expect(placed[0].lines[0].name).toBe('Banana Milkshake');
  });

  it("refuses a product that is not on that shop's shelf", async () => {
    // An empty shelf answer is how "not sellable here" arrives, whatever the
    // reason — unlisted, deleted, another shop's, or a supplier row with no
    // consumer price.
    const { service } = buildService({ shelf: new Map() });

    await expect(service.placeGroup(basket())).rejects.toThrow(
      /no longer on sale|nothing in this order/i,
    );
  });

  it('totals from the shelf even when the client understates the sum', async () => {
    const { service, saved } = buildService();

    await service.placeGroup(
      basket({
        seller: {
          lines: [
            {
              productId: '1748',
              name: 'x',
              quantity: 2,
              unitPrice: 0,
              currency: 'ETB',
            },
            {
              productId: '1840',
              name: 'y',
              quantity: 1,
              unitPrice: 0,
              currency: 'ETB',
            },
          ],
        },
      }),
    );

    expect(saved[0].total).toBe(200 * 2 + 50);
  });

  it('clamps an absurd quantity rather than passing it to a till', async () => {
    const { service, placed } = buildService();

    await service.placeGroup(
      basket({
        seller: {
          lines: [
            {
              productId: '1748',
              name: 'Banana Milkshake',
              quantity: 90000,
              unitPrice: 200,
              currency: 'ETB',
            },
          ],
        },
      }),
    );

    expect(placed[0].lines[0].quantity).toBe(500);
  });

  it("refuses an item the shop has just 86'd", async () => {
    const { service } = buildService({
      shelf: new Map([
        [
          1748,
          {
            productId: 1748,
            name: 'Banana Milkshake',
            price: 200,
            currency: 'ETB',
            stockState: 'OUT_OF_STOCK',
          },
        ],
      ]),
    });

    await expect(service.placeGroup(basket())).rejects.toThrow(/sold out/i);
  });
});

describe('what a shop needs before it can do the work', () => {
  it('refuses an appointment booked for no particular time', async () => {
    const { service } = buildService();

    await expect(
      service.placeGroup(
        basket({
          seller: { serviceFormat: 'BARBER', orderMode: 'APPOINTMENT' },
        }),
      ),
    ).rejects.toThrow(/date and time/i);
  });

  it('refuses an eat-in order with no table', async () => {
    const { service } = buildService();

    await expect(
      service.placeGroup(basket({ seller: { orderMode: 'DINE_IN' } })),
    ).rejects.toThrow(/which table/i);
  });

  it('accepts an appointment that carries its time', async () => {
    const { service, placed } = buildService();

    await service.placeGroup(
      basket({
        seller: {
          serviceFormat: 'BARBER',
          orderMode: 'APPOINTMENT',
          appointmentTime: '2026-08-09T10:00:00.000Z',
        },
      }),
    );

    expect(placed[0].appointmentTime).toBe('2026-08-09T10:00:00.000Z');
  });

  it('does not need a time for a takeaway', async () => {
    const { service, placed } = buildService();
    await service.placeGroup(basket());
    expect(placed).toHaveLength(1);
  });
});
