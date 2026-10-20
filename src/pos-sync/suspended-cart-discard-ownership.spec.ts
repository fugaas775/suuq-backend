import { ForbiddenException } from '@nestjs/common';
import { PosRegisterController } from './pos-register.controller';
import { PosRegisterService } from './pos-register.service';
import { PosSuspendedCartStatus } from './entities/pos-suspended-cart.entity';
import { POS_PERMISSION_GRANT_KEY } from '../auth/pos-branch-access.guard';

/*
 * A waiter (QSR_WAITER: OPEN_REGISTER + SUSPEND_SALE + RESUME_SUSPENDED_SALE)
 * reaches the discard route on SUSPEND_SALE. That is for clearing their OWN
 * rows — the sources of a merge — and for turning down a customer's order no
 * one has accepted. It must not let them void another waiter's open order.
 */
describe('PosRegisterService.discardSuspendedCart (own carts only)', () => {
  const WAITER = 70;
  const OTHER = 99;

  const order = (over: Record<string, unknown> = {}) => ({
    id: 501,
    branchId: 9,
    status: PosSuspendedCartStatus.SUSPENDED,
    total: 300,
    itemCount: 2,
    currency: 'ETB',
    label: 'T4',
    metadata: null as Record<string, unknown> | null,
    suspendedByUserId: OTHER as number | null,
    cartSnapshot: {
      serviceFormat: 'QSR',
      hotelGuestName: 'Hodan',
      waiterUserId: String(OTHER),
      cartLines: [],
    } as Record<string, unknown>,
    createdAt: new Date('2026-10-20T09:00:00Z'),
    updatedAt: new Date('2026-10-20T09:00:00Z'),
    ...over,
  });

  function makeService(
    cart: ReturnType<typeof order>,
    actorDisplayName = 'Ayaan',
  ) {
    const suspendedCartsRepository = {
      findOne: jest.fn().mockResolvedValue(cart),
      save: jest.fn(async (c) => c),
    };
    const staffAssignmentsRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ user: { displayName: actorDisplayName } }),
    };
    const service = new PosRegisterService(
      { findOne: jest.fn() } as any,
      suspendedCartsRepository as any,
      { findOne: jest.fn() } as any,
      {
        dispatchCloseReport: jest.fn(),
        dispatchStudentWithdrawalEmail: jest.fn(),
      } as any,
      staffAssignmentsRepository as any,
    );
    return { service, suspendedCartsRepository };
  }

  const waiter = {
    id: WAITER,
    email: 'ayaan@cafe.test',
    ownCartsOnly: true,
  };

  it("refuses a waiter voiding another waiter's order", async () => {
    const { service, suspendedCartsRepository } = makeService(order());
    await expect(
      service.discardSuspendedCart(501, { branchId: 9 } as any, waiter),
    ).rejects.toThrow(ForbiddenException);
    expect(suspendedCartsRepository.save).not.toHaveBeenCalled();
  });

  it('lets a waiter clear an order sent to them (merge source)', async () => {
    const { service } = makeService(
      order({
        cartSnapshot: {
          serviceFormat: 'QSR',
          hotelGuestName: 'Ayaan',
          waiterUserId: String(WAITER),
        },
      }),
    );
    const res = await service.discardSuspendedCart(
      501,
      { branchId: 9 },
      waiter,
    );
    expect(res.status).toBe(PosSuspendedCartStatus.DISCARDED);
  });

  it('lets a waiter clear an order they parked themselves', async () => {
    const { service } = makeService(
      order({
        suspendedByUserId: WAITER,
        cartSnapshot: { serviceFormat: 'QSR' },
      }),
    );
    await expect(
      service.discardSuspendedCart(501, { branchId: 9 } as any, waiter),
    ).resolves.toMatchObject({ status: PosSuspendedCartStatus.DISCARDED });
  });

  it('lets a waiter clear a table they own (numeric id in the snapshot)', async () => {
    const { service } = makeService(
      order({
        cartSnapshot: {
          serviceFormat: 'QSR',
          waiterUserId: null,
          tableOwnerUserId: WAITER,
        },
      }),
    );
    await expect(
      service.discardSuspendedCart(501, { branchId: 9 } as any, waiter),
    ).resolves.toMatchObject({ status: PosSuspendedCartStatus.DISCARDED });
  });

  it('honours a QSR order sent by name only, as the waiter board does', async () => {
    const { service } = makeService(
      order({
        cartSnapshot: { serviceFormat: 'QSR', hotelGuestName: ' ayaan ' },
      }),
    );
    await expect(
      service.discardSuspendedCart(501, { branchId: 9 } as any, waiter),
    ).resolves.toMatchObject({ status: PosSuspendedCartStatus.DISCARDED });
  });

  it('does not accept a name match once the order names another waiter by id', async () => {
    const { service } = makeService(
      order({
        cartSnapshot: {
          serviceFormat: 'QSR',
          hotelGuestName: 'Ayaan',
          waiterUserId: String(OTHER),
        },
      }),
    );
    await expect(
      service.discardSuspendedCart(501, { branchId: 9 } as any, waiter),
    ).rejects.toThrow(ForbiddenException);
  });

  it("never matches a hotel guest's name to a clerk", async () => {
    const { service } = makeService(
      order({
        cartSnapshot: { serviceFormat: 'HOTEL', hotelGuestName: 'Ayaan' },
      }),
    );
    await expect(
      service.discardSuspendedCart(501, { branchId: 9 } as any, waiter),
    ).rejects.toThrow(ForbiddenException);
  });

  it("lets a waiter decline a customer's order nobody has accepted", async () => {
    const { service } = makeService(
      order({ metadata: { consumerSource: 'SUUQS' } }),
    );
    const res = await service.discardSuspendedCart(
      501,
      { branchId: 9, outcome: 'DECLINED' },
      waiter,
    );
    expect(res.status).toBe(PosSuspendedCartStatus.DISCARDED);
  });

  it("refuses once another waiter has accepted the customer's order", async () => {
    const { service } = makeService(
      order({
        metadata: {
          consumerSource: 'SUUQS',
          consumerAcceptedAt: '2026-10-20T09:05:00Z',
        },
      }),
    );
    await expect(
      service.discardSuspendedCart(501, { branchId: 9 } as any, waiter),
    ).rejects.toThrow(ForbiddenException);
  });

  it('leaves an unrestricted caller (discard/settle/manager) alone', async () => {
    const { service } = makeService(order());
    await expect(
      service.discardSuspendedCart(501, { branchId: 9 } as any, {
        id: WAITER,
        email: 'ayaan@cafe.test',
      }),
    ).resolves.toMatchObject({ status: PosSuspendedCartStatus.DISCARDED });
  });
});

describe('PosRegisterController.discardSuspendedCart', () => {
  const call = (grant: unknown) => {
    const service = { discardSuspendedCart: jest.fn() };
    const controller = new PosRegisterController(service as any);
    controller.discardSuspendedCart(
      5,
      { branchId: 9 },
      {
        user: { id: 70, email: 'w@x.test' },
        [POS_PERMISSION_GRANT_KEY]: grant,
      },
    );
    return service.discardSuspendedCart.mock.calls[0][2];
  };

  it('restricts a caller let in on SUSPEND_SALE alone', () => {
    expect(
      call({ managerLike: false, permissions: ['SUSPEND_SALE'] }),
    ).toMatchObject({ id: 70, ownCartsOnly: true });
  });

  it.each([
    'DISCARD_SUSPENDED_SALE',
    'SETTLE_TABLE_FOLIO',
    'SETTLE_ROOM_FOLIO',
    'SETTLE_FEE_PAYMENT',
    'VOID_STUDENT_FOLIO',
  ])('does not restrict a holder of %s', (permission) => {
    expect(
      call({ managerLike: false, permissions: ['SUSPEND_SALE', permission] }),
    ).toMatchObject({ ownCartsOnly: false });
  });

  it('does not restrict a manager-like caller', () => {
    expect(call({ managerLike: true, permissions: [] })).toMatchObject({
      ownCartsOnly: false,
    });
  });
});
