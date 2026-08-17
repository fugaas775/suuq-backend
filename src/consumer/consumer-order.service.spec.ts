import { NotFoundException } from '@nestjs/common';
import { ConsumerOrderService } from './consumer-order.service';
import { PosSuspendedCartStatus } from '../pos-sync/entities/pos-suspended-cart.entity';

/**
 * Unit tests for the consumer order reference.
 *
 * Order ids are sequential, so `C-<id>` could be derived by anyone and gated
 * nothing. Placement now mints a random reference and the status read demands
 * it, while orders placed before the reference existed stay readable by id.
 */
describe('ConsumerOrderService order reference', () => {
  function buildService(cart?: Record<string, unknown>) {
    const suspendCart = jest.fn(async (input: Record<string, unknown>) => ({
      id: 4242,
      branchId: input.branchId,
      metadata: input.metadata,
    }));
    const posRegisterService = { suspendCart };
    const branchesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 7, serviceFormat: 'QSR' }),
    };
    const suspendedCartsRepository = {
      findOne: jest.fn().mockResolvedValue(cart ?? null),
    };

    const createAndDispatch = jest.fn().mockResolvedValue(undefined);
    const service = new ConsumerOrderService(
      posRegisterService as never,
      branchesRepository as never,
      suspendedCartsRepository as never,
      { createAndDispatch } as never,
    );
    return { service, suspendCart, createAndDispatch };
  }

  const placeDto = {
    branchId: 7,
    serviceFormat: 'QSR',
    orderMode: 'TAKEAWAY',
    lines: [{ name: 'Tea', quantity: 2, unitPrice: 25 }],
  } as never;

  function consumerCart(metadata: Record<string, unknown>) {
    return {
      id: 4242,
      branchId: 7,
      status: PosSuspendedCartStatus.SUSPENDED,
      createdAt: new Date('2026-08-01T09:00:00Z'),
      updatedAt: new Date('2026-08-01T09:00:00Z'),
      metadata,
    };
  }

  it('mints a random reference that is not derivable from the order id', async () => {
    const { service, suspendCart } = buildService();

    const first = await service.placeOrder(placeDto);
    const second = await service.placeOrder(placeDto);

    expect(first.orderNumber).toMatch(/^C-4242-[0-9A-F]{8}$/);
    expect(first.orderNumber).not.toEqual(second.orderNumber);

    // The reference is persisted on the cart so the status read can check it.
    const metadata = suspendCart.mock.calls[0][0].metadata as Record<
      string,
      unknown
    >;
    expect(metadata.consumerOrderRef).toEqual(
      first.orderNumber.split('-').pop(),
    );
  });

  it('returns the order when the reference matches', async () => {
    const { service } = buildService(
      consumerCart({ consumerSource: 'SUUQS', consumerOrderRef: 'A1B2C3D4' }),
    );

    const status = await service.getOrderStatus(4242, 'C-4242-A1B2C3D4');

    expect(status.orderId).toBe(4242);
    expect(status.orderNumber).toBe('C-4242-A1B2C3D4');
    expect(status.status).toBe('RECEIVED');
  });

  it('accepts the bare suffix as well as the whole reference', async () => {
    const { service } = buildService(
      consumerCart({ consumerSource: 'SUUQS', consumerOrderRef: 'A1B2C3D4' }),
    );

    await expect(service.getOrderStatus(4242, 'a1b2c3d4')).resolves.toEqual(
      expect.objectContaining({ orderId: 4242 }),
    );
  });

  it('says the shop is preparing it once staff accept, board or not', async () => {
    // QSR leaves the row SUSPENDED while the order is worked — that is what keeps
    // it on the board — so without the accept stamp the customer's phone said
    // "waiting for staff" right through to collection.
    const { service } = buildService(
      consumerCart({
        consumerSource: 'SUUQS',
        consumerOrderRef: 'A1B2C3D4',
        consumerAcceptedAt: '2026-08-05T07:00:00.000Z',
      }),
    );

    const status = await service.getOrderStatus(4242, 'C-4242-A1B2C3D4');

    expect(status.status).toBe('IN_PREPARATION');
  });

  it('still reads as waiting while nobody has accepted it', async () => {
    const { service } = buildService(
      consumerCart({ consumerSource: 'SUUQS', consumerOrderRef: 'A1B2C3D4' }),
    );

    const status = await service.getOrderStatus(4242, 'C-4242-A1B2C3D4');

    expect(status.status).toBe('RECEIVED');
  });

  it('reads a settled order as finished, not cancelled', async () => {
    // Settling discards the row, and a discarded row used to mean CANCELLED —
    // so the last thing a paying guest saw was "talk to the staff".
    const { service } = buildService({
      id: 4242,
      branchId: 7,
      status: PosSuspendedCartStatus.DISCARDED,
      createdAt: new Date('2026-08-01T09:00:00Z'),
      updatedAt: new Date('2026-08-01T09:00:00Z'),
      metadata: {
        consumerSource: 'SUUQS',
        consumerOrderRef: 'A1B2C3D4',
        consumerAcceptedAt: '2026-08-05T07:00:00.000Z',
        consumerCompletedAt: '2026-08-05T07:20:00.000Z',
      },
    });

    const status = await service.getOrderStatus(4242, 'C-4242-A1B2C3D4');

    expect(status.status).toBe('COMPLETED');
  });

  it('still reads a rejected order as cancelled', async () => {
    const { service } = buildService({
      id: 4242,
      branchId: 7,
      status: PosSuspendedCartStatus.DISCARDED,
      createdAt: new Date('2026-08-01T09:00:00Z'),
      updatedAt: new Date('2026-08-01T09:00:00Z'),
      metadata: { consumerSource: 'SUUQS', consumerOrderRef: 'A1B2C3D4' },
    });

    const status = await service.getOrderStatus(4242, 'C-4242-A1B2C3D4');

    expect(status.status).toBe('CANCELLED');
  });

  it('hides the order when the reference is wrong or missing', async () => {
    const { service } = buildService(
      consumerCart({ consumerSource: 'SUUQS', consumerOrderRef: 'A1B2C3D4' }),
    );

    // 404 rather than 403: a wrong reference must not confirm the id exists.
    await expect(service.getOrderStatus(4242, 'DEADBEEF')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getOrderStatus(4242)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('still serves orders placed before references existed', async () => {
    const { service } = buildService(consumerCart({ consumerSource: 'SUUQS' }));

    const status = await service.getOrderStatus(4242);

    expect(status.orderNumber).toBe('C-4242');
  });

  it('never exposes a cart that did not come from the consumer app', async () => {
    const { service } = buildService(consumerCart({}));

    await expect(service.getOrderStatus(4242)).rejects.toThrow(
      NotFoundException,
    );
  });
});

/**
 * A cartless request carries its meaning somewhere other than the basket.
 *
 * A print shop and a school are reached by QUOTE: nothing on their shelf is
 * what the guest is asking for, so the brief IS the order. "Print something" is
 * not a job anyone can price, which is the same argument `modeNeedsTime` makes
 * about an appointment for no particular moment.
 */
describe('ConsumerOrderService cartless requests', () => {
  function buildService(serviceFormat: string) {
    const suspendCart = jest.fn(async (input: Record<string, unknown>) => ({
      id: 90,
      branchId: input.branchId,
      metadata: input.metadata,
    }));
    const service = new ConsumerOrderService(
      { suspendCart } as never,
      {
        findOne: jest.fn().mockResolvedValue({ id: 9, serviceFormat }),
      } as never,
      { findOne: jest.fn() } as never,
      { createAndDispatch: jest.fn().mockResolvedValue(undefined) } as never,
    );
    return { service, suspendCart };
  }

  const quoteDto = {
    branchId: 9,
    serviceFormat: 'PRINTING_PRESS',
    orderMode: 'QUOTE',
    lines: [],
    consumerNote: '200 A5 flyers, double sided, matte',
  } as never;

  it('lands a QUOTE with no lines as an empty-basket request', async () => {
    const { service, suspendCart } = buildService('PRINTING_PRESS');

    const placed = await service.placeOrder(quoteDto);

    expect(placed.status).toBe('RECEIVED');
    // Nothing was picked off a shelf, so the till sees a zero basket and reads
    // the brief instead — that is the request, not a mistake.
    expect(suspendCart.mock.calls[0][0].itemCount).toBe(0);
    expect(suspendCart.mock.calls[0][0].total).toBe(0);
  });

  it('refuses a QUOTE with no brief', async () => {
    const { service } = buildService('PRINTING_PRESS');

    await expect(
      service.placeOrder({
        ...(quoteDto as object),
        consumerNote: '  ',
      } as never),
    ).rejects.toThrow(/description of the job/i);
  });

  it('reaches a school the same way', async () => {
    const { service } = buildService('SCHOOL');

    const placed = await service.placeOrder({
      ...(quoteDto as object),
      serviceFormat: 'SCHOOL',
      consumerNote: 'Grade 5 place for September',
    } as never);

    expect(placed.orderMode).toBe('QUOTE');
  });

  it('leaves every existing mode alone', async () => {
    // validatePlacement backs the frozen surface a released app posts to, so a
    // basket order with no note must keep working exactly as it did.
    const { service } = buildService('QSR');

    const placed = await service.placeOrder({
      branchId: 9,
      serviceFormat: 'QSR',
      orderMode: 'TAKEAWAY',
      lines: [{ name: 'Tea', quantity: 1, unitPrice: 25 }],
    } as never);

    expect(placed.status).toBe('RECEIVED');
  });
});

/**
 * Somebody has to be told. A guest order used to land on a till and make no
 * sound anywhere — if the drawer was shut and the owner was out, it waited.
 */
describe('ConsumerOrderService tells the shop', () => {
  function buildService(
    serviceFormat = 'QSR',
    branch: Record<string, unknown> = {},
  ) {
    const createAndDispatch = jest.fn().mockResolvedValue(undefined);
    const service = new ConsumerOrderService(
      { suspendCart: jest.fn(async () => ({ id: 12, branchId: 9 })) } as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 9,
          name: 'Hoobaan Cafe',
          ownerId: 3,
          serviceFormat,
          ...branch,
        }),
      } as never,
      { findOne: jest.fn() } as never,
      { createAndDispatch } as never,
    );
    return { service, createAndDispatch };
  }

  const order = {
    branchId: 9,
    serviceFormat: 'QSR',
    orderMode: 'TAKEAWAY',
    lines: [{ name: 'Tea', quantity: 1, unitPrice: 25 }],
    consumerName: 'Amina',
  } as never;

  it('notifies the branch owner, naming the shop and the order', async () => {
    const { service, createAndDispatch } = buildService();

    const placed = await service.placeOrder(order);
    await new Promise((resolve) => setImmediate(resolve));

    expect(createAndDispatch).toHaveBeenCalledTimes(1);
    const sent = createAndDispatch.mock.calls[0][0];
    expect(sent.userId).toBe(3);
    expect(sent.title).toContain('Hoobaan Cafe');
    expect(sent.body).toContain('Amina');
    expect(sent.body).toContain(placed.orderNumber);
  });

  it('says what was actually asked for, not always "an order"', async () => {
    const { service, createAndDispatch } = buildService('PRINTING_PRESS');

    await service.placeOrder({
      ...(order as object),
      serviceFormat: 'PRINTING_PRESS',
      orderMode: 'QUOTE',
      lines: [],
      consumerNote: '200 A5 flyers',
    } as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(createAndDispatch.mock.calls[0][0].body).toContain(
      'asked for a quote',
    );
  });

  it('tells a school somebody applied, never that they asked for a quote', async () => {
    // A school and a print shop send the identical QUOTE row. Nobody quotes a
    // family for a child's place, and this notification is the first thing —
    // often the only thing — the head teacher sees about the application.
    const { service, createAndDispatch } = buildService('SCHOOL', {
      name: 'SMAK School',
    });

    await service.placeOrder({
      ...(order as object),
      serviceFormat: 'SCHOOL',
      orderMode: 'QUOTE',
      lines: [],
      consumerName: 'Yusuf Ali',
      consumerNote: 'Student: Amina Yusuf\nClass: 3A',
    } as never);
    await new Promise((resolve) => setImmediate(resolve));

    const sent = createAndDispatch.mock.calls[0][0];
    expect(sent.title).toBe('New application at SMAK School');
    expect(sent.body).toContain('Yusuf Ali applied for a place');
    expect(sent.body).not.toContain('quote');
  });

  it('still places the order when the notification fails', async () => {
    // The cart is already on the till by then. Refusing a guest's order
    // because a push token went stale would be absurd.
    const { service, createAndDispatch } = buildService();
    createAndDispatch.mockRejectedValue(new Error('stale token'));

    await expect(service.placeOrder(order)).resolves.toMatchObject({
      status: 'RECEIVED',
    });
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('says nothing when the branch has no owner to tell', async () => {
    const { service, createAndDispatch } = buildService('QSR', {
      ownerId: null,
    });

    await service.placeOrder(order);
    await new Promise((resolve) => setImmediate(resolve));

    expect(createAndDispatch).not.toHaveBeenCalled();
  });
});

/**
 * A refusal must read as a refusal.
 *
 * Settling and rejecting both leave the row DISCARDED, so for a long time every
 * guest whose order was turned down — and briefly, every guest whose order was
 * settled — read "This order was cancelled. Talk to the staff.", which is a
 * journey to find out something the shop already knew.
 */
describe('ConsumerOrderService tells a guest which ending they got', () => {
  function serviceReading(cart: Record<string, unknown>) {
    return new ConsumerOrderService(
      { suspendCart: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { findOne: jest.fn().mockResolvedValue(cart) } as never,
      { createAndDispatch: jest.fn() } as never,
    );
  }

  const discarded = (metadata: Record<string, unknown>) => ({
    id: 4242,
    branchId: 7,
    status: PosSuspendedCartStatus.DISCARDED,
    createdAt: new Date('2026-08-12T09:00:00Z'),
    updatedAt: new Date('2026-08-12T10:00:00Z'),
    metadata: { consumerSource: 'SUUQS', ...metadata },
  });

  it('reads a refusal as DECLINED, and passes on what the shop said', async () => {
    const service = serviceReading(
      discarded({
        consumerDeclinedAt: '2026-08-12T10:00:00Z',
        consumerDeclineReason: 'We close at 8pm — collect tomorrow?',
      }),
    );

    const status = await service.getOrderStatus(4242);

    expect(status.status).toBe('DECLINED');
    expect(status.declineReason).toBe('We close at 8pm — collect tomorrow?');
  });

  it('lets a settled order win over a decline stamp', async () => {
    // Both can be present if a row was refused and later reconciled; being paid
    // and collected is the truth the guest cares about.
    const service = serviceReading(
      discarded({
        consumerDeclinedAt: '2026-08-12T10:00:00Z',
        consumerCompletedAt: '2026-08-12T10:05:00Z',
      }),
    );

    expect((await service.getOrderStatus(4242)).status).toBe('COMPLETED');
  });

  it('still says CANCELLED when the row went away with no outcome recorded', async () => {
    // A duplicate sweep or a stale cleanup is not the shop refusing anyone, so
    // nothing stamps those and they keep exactly the meaning they had.
    const service = serviceReading(discarded({}));

    const status = await service.getOrderStatus(4242);
    expect(status.status).toBe('CANCELLED');
    expect(status.declineReason).toBeUndefined();
  });
});
