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

/*
 * The same callers on PATCH. The route replaces the snapshot wholesale and
 * merges metadata, so a waiter or a cook must be held to their own orders plus
 * the hand-overs the floor makes: accepting or declining a transfer offered to
 * them, taking a customer's new order, and the cook's ready mark.
 */
describe('PosRegisterService.updateSuspendedCart (limited writers)', () => {
  const WAITER = 70;
  const OTHER = 99;
  const lines = [{ lineId: 'a', name: 'Tea', quantity: 2, total: 60 }];

  const row = (over: Record<string, unknown> = {}) => ({
    id: 600,
    branchId: 9,
    status: PosSuspendedCartStatus.SUSPENDED,
    total: 60,
    itemCount: 2,
    currency: 'ETB',
    label: 'Hodan',
    metadata: null as Record<string, unknown> | null,
    suspendedByUserId: OTHER as number | null,
    cartSnapshot: {
      serviceFormat: 'QSR',
      hotelGuestName: 'Hodan',
      waiterUserId: String(OTHER),
      cartLines: lines,
    } as Record<string, unknown>,
    createdAt: new Date('2026-10-20T09:00:00Z'),
    updatedAt: new Date('2026-10-20T09:00:00Z'),
    ...over,
  });

  function makeService(cart: ReturnType<typeof row>) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(cart),
      save: jest.fn(async (c) => c),
      createQueryBuilder: jest.fn(),
    };
    const suspendedCartsRepository = {
      ...repo,
      manager: {
        transaction: jest.fn(async (fn: any) =>
          fn({ getRepository: () => repo, query: jest.fn() }),
        ),
      },
    };
    const service = new PosRegisterService(
      { findOne: jest.fn() } as any,
      suspendedCartsRepository as any,
      { findOne: jest.fn() } as any,
      { dispatchCloseReport: jest.fn() } as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ user: { displayName: 'Ayaan' } }),
      } as any,
    );
    return { service, repo };
  }

  const waiter = {
    id: WAITER,
    email: 'ayaan@cafe.test',
    limitedWriter: { mayMarkKitchen: false },
  };
  const cook = {
    id: 80,
    email: 'cook@cafe.test',
    limitedWriter: { mayMarkKitchen: true },
  };
  const patch = (body: Record<string, unknown>) =>
    ({ branchId: 9, ...body }) as any;
  const mine = () =>
    row({
      cartSnapshot: {
        serviceFormat: 'QSR',
        hotelGuestName: 'Ayaan',
        waiterUserId: String(WAITER),
        cartLines: lines,
      },
    });

  it("refuses a waiter rewriting another waiter's order", async () => {
    const { service, repo } = makeService(row());
    await expect(
      service.updateSuspendedCart(
        600,
        patch({
          cartSnapshot: { ...row().cartSnapshot, waiterUserId: String(WAITER) },
        }),
        waiter,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('lets a waiter amend their own order (lines, total, print record)', async () => {
    const { service, repo } = makeService(mine());
    await service.updateSuspendedCart(
      600,
      patch({
        total: 90,
        itemCount: 3,
        metadata: { qsrPrint: { at: 'x', count: 1 } },
        cartSnapshot: {
          ...mine().cartSnapshot,
          cartLines: [...lines, { lineId: 'b', name: 'Bun', quantity: 1 }],
        },
      }),
      waiter,
    );
    expect(repo.save).toHaveBeenCalled();
  });

  it('refuses a waiter marking even their own order paid', async () => {
    const { service } = makeService(mine());
    await expect(
      service.updateSuspendedCart(
        600,
        patch({ cartSnapshot: { ...mine().cartSnapshot, paid: true } }),
        waiter,
      ),
    ).rejects.toThrow('only someone who can settle orders');
  });

  it('refuses a waiter raising a part payment in metadata', async () => {
    const { service } = makeService(mine());
    await expect(
      service.updateSuspendedCart(
        600,
        patch({ metadata: { partialPaidAmount: 50 } }),
        waiter,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets a re-park carry the stored part payment forward unchanged', async () => {
    const paidRow = mine();
    paidRow.metadata = { partialPaidAmount: 20 };
    const { service, repo } = makeService(paidRow);
    await service.updateSuspendedCart(
      600,
      patch({
        metadata: { partialPaidAmount: 20 },
        cartSnapshot: paidRow.cartSnapshot,
      }),
      waiter,
    );
    expect(repo.save).toHaveBeenCalled();
  });

  describe('a hand-over offered to the waiter', () => {
    const offer = {
      at: '2026-10-20T09:10:00Z',
      fromUserId: String(OTHER),
      fromName: 'Hodan',
      toUserId: String(WAITER),
      toName: 'Ayaan',
    };
    const offered = () =>
      row({ cartSnapshot: { ...row().cartSnapshot, orderTransfer: offer } });

    it('can be accepted — the order becomes theirs', async () => {
      const { service, repo } = makeService(offered());
      const next = { ...row().cartSnapshot } as Record<string, unknown>;
      await service.updateSuspendedCart(
        600,
        patch({
          label: 'Ayaan',
          cartSnapshot: {
            ...next,
            hotelGuestName: 'Ayaan',
            waiterUserId: String(WAITER),
            orderTransferLog: [{ ...offer, acceptedAt: 'now' }],
          },
        }),
        waiter,
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it('cannot be accepted with different food on it', async () => {
      const { service } = makeService(offered());
      await expect(
        service.updateSuspendedCart(
          600,
          patch({
            cartSnapshot: {
              ...row().cartSnapshot,
              waiterUserId: String(WAITER),
              cartLines: [],
            },
          }),
          waiter,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('can be declined, and nothing else on the order moves', async () => {
      const { service, repo } = makeService(offered());
      await service.updateSuspendedCart(
        600,
        patch({
          cartSnapshot: {
            ...offered().cartSnapshot,
            orderTransfer: { ...offer, declinedAt: 'now', declinedByName: 'A' },
          },
        }),
        waiter,
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it('cannot be "declined" while changing the order', async () => {
      const { service } = makeService(offered());
      await expect(
        service.updateSuspendedCart(
          600,
          patch({
            total: 0,
            cartSnapshot: {
              ...offered().cartSnapshot,
              orderTransfer: { ...offer, declinedAt: 'now' },
            },
          }),
          waiter,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('is not acceptable by a waiter it was not offered to', async () => {
      const { service } = makeService(offered());
      await expect(
        service.updateSuspendedCart(
          600,
          patch({
            cartSnapshot: { ...row().cartSnapshot, waiterUserId: '71' },
          }),
          { ...waiter, id: 71 },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  it("lets a waiter take a customer's order nobody has accepted", async () => {
    const guest = row({
      metadata: { consumerSource: 'SUUQS' },
      suspendedByUserId: null,
      cartSnapshot: { lines: [] },
    });
    const { service, repo } = makeService(guest);
    await service.updateSuspendedCart(
      600,
      patch({
        label: 'Ayaan',
        total: 60,
        itemCount: 2,
        metadata: {
          consumerAcceptedAt: 'now',
          waiterUserId: String(WAITER),
          waiterName: 'Ayaan',
        },
        cartSnapshot: {
          serviceFormat: 'QSR',
          cartLines: lines,
          hotelGuestName: 'Ayaan',
          waiterUserId: String(WAITER),
        },
      }),
      waiter,
    );
    expect(repo.save).toHaveBeenCalled();
  });

  it("refuses taking a customer's order someone already accepted", async () => {
    const guest = row({
      metadata: { consumerSource: 'SUUQS', consumerAcceptedAt: 'earlier' },
    });
    const { service } = makeService(guest);
    await expect(
      service.updateSuspendedCart(
        600,
        patch({
          metadata: { consumerAcceptedAt: 'now' },
          cartSnapshot: {
            ...guest.cartSnapshot,
            waiterUserId: String(WAITER),
          },
        }),
        waiter,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("lets the cook mark a station ready on anyone's order", async () => {
    const { service, repo } = makeService(row());
    await service.updateSuspendedCart(
      600,
      patch({ metadata: { 'qsrKitchen:GRILL': { at: 'now' } } }),
      cook,
    );
    expect(repo.save).toHaveBeenCalled();
  });

  it('holds the cook to the kitchen keys', async () => {
    const { service } = makeService(row());
    await expect(
      service.updateSuspendedCart(
        600,
        patch({
          metadata: { 'qsrKitchen:GRILL': { at: 'now' }, qsrPrint: null },
        }),
        cook,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.updateSuspendedCart(
        600,
        patch({
          metadata: { 'qsrKitchen:GRILL': { at: 'now' } },
          cartSnapshot: row().cartSnapshot,
        }),
        cook,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does not give a waiter without the kitchen permission the ready mark', async () => {
    const { service } = makeService(row());
    await expect(
      service.updateSuspendedCart(
        600,
        patch({ metadata: { 'qsrKitchen:GRILL': { at: 'now' } } }),
        waiter,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('leaves an unrestricted caller alone', async () => {
    const { service, repo } = makeService(row());
    await service.updateSuspendedCart(
      600,
      patch({ cartSnapshot: { ...row().cartSnapshot, paid: true } }),
      { id: WAITER, email: 'c@x.test', limitedWriter: null },
    );
    expect(repo.save).toHaveBeenCalled();
  });
});

describe('PosRegisterController.updateSuspendedCart', () => {
  const call = (grant: unknown) => {
    const service = { updateSuspendedCart: jest.fn() };
    const controller = new PosRegisterController(service as any);
    controller.updateSuspendedCart(
      5,
      { branchId: 9 },
      {
        user: { id: 70, email: 'w@x.test', roles: [] },
        [POS_PERMISSION_GRANT_KEY]: grant,
      },
    );
    return service.updateSuspendedCart.mock.calls[0][2];
  };

  it('limits the waiter preset', () => {
    expect(
      call({
        managerLike: false,
        permissions: ['OPEN_REGISTER', 'SUSPEND_SALE', 'RESUME_SUSPENDED_SALE'],
      }).limitedWriter,
    ).toEqual({ mayMarkKitchen: false });
  });

  it('limits the cook and says it may mark ready', () => {
    expect(
      call({ managerLike: false, permissions: ['MARK_KITCHEN_TICKET_READY'] })
        .limitedWriter,
    ).toEqual({ mayMarkKitchen: true });
  });

  it.each([
    'DISCARD_SUSPENDED_SALE',
    'SETTLE_TABLE_FOLIO',
    'SETTLE_FEE_PAYMENT',
    'POST_FEE_CHARGE',
    'ENROL_STUDENT',
    'OPEN_ROOM_FOLIO',
    'VIEW_FOLIO_BOARD',
  ])('does not limit a holder of %s', (permission) => {
    expect(
      call({ managerLike: false, permissions: ['SUSPEND_SALE', permission] })
        .limitedWriter,
    ).toBeNull();
  });

  it('does not limit a manager-like caller', () => {
    expect(
      call({ managerLike: true, permissions: [] }).limitedWriter,
    ).toBeNull();
  });
});
