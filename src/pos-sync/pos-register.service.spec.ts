import { PosRegisterService } from './pos-register.service';
import { PosSuspendedCartStatus } from './entities/pos-suspended-cart.entity';

// Focused coverage for the offline-park idempotency added to suspendCart: a
// replay that carries a clientRef already seen for the branch must return the
// originally-created cart instead of inserting a duplicate.

describe('PosRegisterService.suspendCart (clientRef idempotency)', () => {
  function makeService(
    overrides: {
      existingCart?: any;
    } = {},
  ) {
    const suspendedCartsRepository = {
      findOne: jest.fn().mockResolvedValue(overrides.existingCart ?? null),
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({
        id: 501,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...input,
      })),
    };
    const branchesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 3 }),
    };
    const registerSessionsRepository = { findOne: jest.fn() };
    const emailService = {};

    const service = new PosRegisterService(
      registerSessionsRepository as any,
      suspendedCartsRepository as any,
      branchesRepository as any,
      emailService as any,
    );

    return { service, suspendedCartsRepository };
  }

  const baseDto = {
    branchId: 3,
    label: 'Lane 2 basket',
    currency: 'etb',
    itemCount: 1,
    total: 15,
    cartSnapshot: { cartLines: [] },
    clientRef: 'park-3-abc123',
  };

  it('returns the existing cart when the clientRef was already used (no duplicate insert)', async () => {
    const existingCart = {
      id: 42,
      branchId: 3,
      clientRef: 'park-3-abc123',
      label: 'Lane 2 basket',
      status: PosSuspendedCartStatus.SUSPENDED,
      currency: 'ETB',
      itemCount: 1,
      total: 15,
      cartSnapshot: { cartLines: [] },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const { service, suspendedCartsRepository } = makeService({ existingCart });

    const result = await service.suspendCart(baseDto);

    expect(suspendedCartsRepository.findOne).toHaveBeenCalledWith({
      where: { branchId: 3, clientRef: 'park-3-abc123' },
    });
    expect(suspendedCartsRepository.save).not.toHaveBeenCalled();
    expect(result.id).toBe(42);
  });

  it('persists the clientRef on a first-seen parked basket', async () => {
    const { service, suspendedCartsRepository } = makeService();

    const result = await service.suspendCart(baseDto);

    expect(suspendedCartsRepository.save).toHaveBeenCalledTimes(1);
    expect(suspendedCartsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientRef: 'park-3-abc123', branchId: 3 }),
    );
    expect(result.id).toBe(501);
  });

  it('skips the dedupe lookup for online carts that send no clientRef', async () => {
    const { service, suspendedCartsRepository } = makeService();
    const { clientRef: _omit, ...onlineDto } = baseDto;

    await service.suspendCart(onlineDto);

    expect(suspendedCartsRepository.findOne).not.toHaveBeenCalled();
    expect(suspendedCartsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientRef: null }),
    );
  });
});
