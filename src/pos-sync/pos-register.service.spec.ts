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
    const reportService = { dispatchCloseReport: jest.fn() };
    const staffAssignmentsRepository = { findOne: jest.fn() };

    const service = new PosRegisterService(
      registerSessionsRepository as any,
      suspendedCartsRepository as any,
      branchesRepository as any,
      reportService as any,
      staffAssignmentsRepository as any,
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

// The single-live-row invariant for a HOTEL stay that has NO backend folio id
// (a stay checked in straight through "Record deposit" never opens one), and
// the collected-money carry-forward that goes with every supersede.
describe('PosRegisterService.suspendCart (same-stay supersede without a backend folio)', () => {
  function makeService(priorRows: any[] = []) {
    const query = jest.fn(async (sql: string) => {
      if (/SELECT id, total/i.test(sql)) return priorRows;
      return [];
    });
    const txSave = jest.fn(async (input) => ({ id: 900, ...input }));
    const suspendedCartsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 501, ...input })),
      manager: {
        transaction: jest.fn(async (fn: any) =>
          fn({ query, getRepository: () => ({ save: txSave }) }),
        ),
      },
    };
    const service = new PosRegisterService(
      { findOne: jest.fn() } as any,
      suspendedCartsRepository as any,
      { findOne: jest.fn().mockResolvedValue({ id: 47 }) } as any,
      { dispatchCloseReport: jest.fn() } as any,
      { findOne: jest.fn() } as any,
    );
    return { service, suspendedCartsRepository, query, txSave };
  }

  const stayDto = (
    extra: Record<string, unknown> = {},
    metadata: any = null,
  ) => ({
    branchId: 47,
    label: '204',
    currency: 'ETB',
    itemCount: 3,
    total: 13500,
    metadata,
    cartSnapshot: {
      serviceFormat: 'HOTEL',
      hotelRoomNumber: '204',
      hotelGuestName: 'SHAFI ABDI',
      hotelCheckInAt: '2026-09-08',
      backendFolioId: null,
      cartLines: [{ category: 'ROOM_CHARGES', quantity: 3, unitPrice: 4500 }],
      ...extra,
    },
  });

  it('retires the prior live rows of the same room + check-in + guest under a room lock', async () => {
    const { service, query, txSave, suspendedCartsRepository } = makeService([
      {
        id: 28261,
        total: 15000,
        metadata: { partialPaidAmount: 4500 },
        cartSnapshot: { paid: false },
      },
      { id: 28267, total: 18000, metadata: null, cartSnapshot: {} },
    ]);

    await service.suspendCart(stayDto());

    expect(suspendedCartsRepository.save).not.toHaveBeenCalled();
    const lock = query.mock.calls.find(([sql]) =>
      /pg_advisory_xact_lock/.test(sql),
    );
    expect(lock?.[1]).toEqual(['pos-room:47:204']);
    const select = query.mock.calls.find(([sql]) =>
      /SELECT id, total/.test(sql),
    );
    expect(select?.[1]).toEqual([
      47,
      PosSuspendedCartStatus.SUSPENDED,
      '204',
      '2026-09-08',
      'shafi abdi',
    ]);
    const update = query.mock.calls.find(([sql]) =>
      /UPDATE pos_suspended_carts/.test(sql),
    );
    expect(update?.[1]).toEqual([
      PosSuspendedCartStatus.DISCARDED,
      'superseded by folio re-save',
      [28261, 28267],
    ]);
    expect(txSave).toHaveBeenCalledTimes(1);
  });

  it('carries the largest collected amount of the retired rows onto the new row', async () => {
    const { service, txSave } = makeService([
      {
        id: 28261,
        total: 15000,
        metadata: { partialPaidAmount: 4500 },
        cartSnapshot: { paid: false },
      },
    ]);

    await service.suspendCart(stayDto());

    const saved = txSave.mock.calls[0][0];
    expect(saved.metadata).toEqual({ partialPaidAmount: 4500 });
    expect(saved.cartSnapshot.partialPaidAmount).toBe(4500);
    expect(saved.cartSnapshot.paid).toBe(false);
  });

  it('carries a retired fully-paid row forward as a partial, and leaves a larger own figure alone', async () => {
    const paidPrior = [
      { id: 1, total: 13500, metadata: null, cartSnapshot: { paid: true } },
    ];
    const a = makeService(paidPrior);
    await a.service.suspendCart(stayDto());
    expect(a.txSave.mock.calls[0][0].metadata).toEqual({
      partialPaidAmount: 13500,
    });

    const b = makeService(paidPrior);
    await b.service.suspendCart(
      stayDto({ partialPaidAmount: 20000 }, { partialPaidAmount: 20000 }),
    );
    expect(b.txSave.mock.calls[0][0].metadata).toEqual({
      partialPaidAmount: 20000,
    });
    expect(b.txSave.mock.calls[0][0].cartSnapshot.partialPaidAmount).toBe(
      20000,
    );
  });

  it('never re-stamps a row that declares itself fully paid', async () => {
    const { service, txSave } = makeService([
      {
        id: 1,
        total: 15000,
        metadata: { partialPaidAmount: 15000 },
        cartSnapshot: { paid: false },
      },
    ]);
    await service.suspendCart(stayDto({ paid: true }));
    const saved = txSave.mock.calls[0][0];
    expect(saved.cartSnapshot.paid).toBe(true);
    expect(saved.metadata).toBeNull();
  });

  it('writes nothing extra when no prior row exists', async () => {
    const { service, query, txSave } = makeService([]);
    await service.suspendCart(stayDto());
    expect(
      query.mock.calls.some(([sql]) => /UPDATE pos_suspended_carts/.test(sql)),
    ).toBe(false);
    expect(txSave.mock.calls[0][0].metadata).toBeNull();
  });

  it('leaves a HOTEL row without a check-in date, and every other format, on the plain insert', async () => {
    const { service, suspendedCartsRepository } = makeService([]);
    await service.suspendCart(stayDto({ hotelCheckInAt: '' }));
    await service.suspendCart(stayDto({ serviceFormat: 'PROPERTY_RENTAL' }));
    expect(suspendedCartsRepository.save).toHaveBeenCalledTimes(2);
    expect(suspendedCartsRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('keeps the folio-keyed supersede for rows that carry a backendFolioId, with the same carry-forward', async () => {
    const { service, query, txSave } = makeService([
      {
        id: 5,
        total: 40000,
        metadata: { partialPaidAmount: 10000 },
        cartSnapshot: { paid: false },
      },
    ]);
    await service.suspendCart(stayDto({ backendFolioId: 826 }));
    const lock = query.mock.calls.find(([sql]) =>
      /pg_advisory_xact_lock/.test(sql),
    );
    expect(lock?.[1]).toEqual(['pos-folio:47:826']);
    const select = query.mock.calls.find(([sql]) =>
      /SELECT id, total/.test(sql),
    );
    expect(select?.[1]).toEqual([
      47,
      PosSuspendedCartStatus.SUSPENDED,
      '826',
      '204',
    ]);
    expect(txSave.mock.calls[0][0].metadata).toEqual({
      partialPaidAmount: 10000,
    });
  });
});
