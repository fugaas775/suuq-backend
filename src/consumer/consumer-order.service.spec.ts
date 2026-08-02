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

    const service = new ConsumerOrderService(
      posRegisterService as never,
      branchesRepository as never,
      suspendedCartsRepository as never,
    );
    return { service, suspendCart };
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
