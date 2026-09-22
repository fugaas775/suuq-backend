import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PosRegisterService } from './pos-register.service';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from './entities/pos-suspended-cart.entity';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';

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
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      void _params;
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

describe('PosRegisterService — a SCHOOL folio must be fit for the roll', () => {
  /**
   * The server-side guards a students table would have given for free. Each
   * was bypassed live at least once: two schools carried an admission number
   * three times over, and one carried a folio with no name, class or lines.
   */
  function makeService(clash: any = null) {
    const qb: any = {
      select: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      getOne: jest.fn(async () => clash),
    };
    const suspendedCartsRepository: any = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 777, ...input })),
      createQueryBuilder: jest.fn(() => qb),
    };
    // A re-save runs under a row lock, in a transaction whose manager hands
    // back the same repository — so the collision query is still observable.
    suspendedCartsRepository.manager = {
      transaction: jest.fn(async (fn: any) =>
        fn({ getRepository: () => suspendedCartsRepository }),
      ),
    };
    const service = new PosRegisterService(
      { findOne: jest.fn() } as any,
      suspendedCartsRepository,
      { findOne: jest.fn().mockResolvedValue({ id: 115 }) } as any,
      { dispatchCloseReport: jest.fn() } as any,
      { findOne: jest.fn() } as any,
    );
    return { service, suspendedCartsRepository, qb };
  }

  const pupil = (snap: Record<string, unknown> = {}) => ({
    branchId: 115,
    label: '3aad',
    currency: 'ETB',
    itemCount: 2,
    total: 2500,
    cartSnapshot: {
      serviceFormat: 'SCHOOL',
      hotelGuestName: 'Amina Cali',
      hotelRoomNumber: '3aad',
      schoolAdmissionNo: 'SMAK-0150',
      backendFolioId: null,
      cartLines: [{ name: 'Tuition', quantity: 1, unitPrice: 2000 }],
      ...snap,
    },
  });
  const actor = { id: 1, email: 'office@school' } as any;

  it('refuses an empty school basket', async () => {
    const { service, suspendedCartsRepository } = makeService();
    await expect(
      service.suspendCart(
        pupil({
          hotelGuestName: '',
          schoolAdmissionNo: '',
          cartLines: [],
        }) as any,
        actor,
      ),
    ).rejects.toThrow(/Nothing to park/);
    expect(suspendedCartsRepository.save).not.toHaveBeenCalled();
  });

  it('refuses a pupil with no class', async () => {
    const { service, suspendedCartsRepository } = makeService();
    await expect(
      service.suspendCart(pupil({ hotelRoomNumber: '' }) as any, actor),
    ).rejects.toThrow(/has no class/);
    expect(suspendedCartsRepository.save).not.toHaveBeenCalled();
  });

  it('refuses an admission number already on the live roll, naming the row', async () => {
    const { service, suspendedCartsRepository } = makeService({
      id: 25383,
      cartSnapshot: {
        hotelGuestName: 'Ansal C/qadir Umer',
        hotelRoomNumber: '5aad',
      },
    });
    await expect(service.suspendCart(pupil() as any, actor)).rejects.toThrow(
      /SMAK-0150 is already on the roll — Ansal C\/qadir Umer in 5aad \(record #25383\)/,
    );
    expect(suspendedCartsRepository.save).not.toHaveBeenCalled();
  });

  it('writes a pupil whose number is free', async () => {
    const { service, suspendedCartsRepository, qb } = makeService(null);
    await service.suspendCart(pupil(), actor);
    expect(suspendedCartsRepository.save).toHaveBeenCalled();
    // The collision query folds case and whitespace, as every SCHOOL reader does.
    const bound = qb.andWhere.mock.calls.find(
      (c: any[]) =>
        typeof c[0] === 'string' && c[0].includes('schoolAdmissionNo'),
    );
    expect(bound?.[1]).toEqual({ admissionNo: 'smak-0150' });
  });

  it('never queries for a pupil the school has not numbered', async () => {
    const { service, suspendedCartsRepository } = makeService();
    await service.suspendCart(pupil({ schoolAdmissionNo: '' }), actor);
    expect(suspendedCartsRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(suspendedCartsRepository.save).toHaveBeenCalled();
  });

  it('costs every other format nothing', async () => {
    const { service, suspendedCartsRepository } = makeService();
    await service.suspendCart(
      {
        ...pupil(),
        cartSnapshot: {
          serviceFormat: 'HOTEL',
          hotelRoomNumber: '204',
          hotelGuestName: 'Guest',
          backendFolioId: null,
          cartLines: [],
        },
      },
      actor,
    );
    expect(suspendedCartsRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('excuses a pupil from colliding with their own row on a re-save', async () => {
    // A settle PATCHes the pupil's own snapshot back; the row itself is not a
    // duplicate. Another live row with the same number still is.
    const { service, suspendedCartsRepository, qb } = makeService(null);
    suspendedCartsRepository.findOne.mockResolvedValue({
      id: 25383,
      branchId: 115,
      status: PosSuspendedCartStatus.SUSPENDED,
      cartSnapshot: {},
      metadata: null,
    });
    await service.updateSuspendedCart(25383, {
      branchId: 115,
      cartSnapshot: pupil().cartSnapshot,
    });
    const except = qb.andWhere.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('exceptId'),
    );
    expect(except?.[1]).toEqual({ exceptId: 25383 });
    expect(suspendedCartsRepository.save).toHaveBeenCalled();
  });

  it('refuses a re-save that would give this pupil another pupil’s number', async () => {
    const { service, suspendedCartsRepository } = makeService({
      id: 25384,
      cartSnapshot: {
        hotelGuestName: 'Somebody Else',
        hotelRoomNumber: '5aad',
      },
    });
    suspendedCartsRepository.findOne.mockResolvedValue({
      id: 25383,
      branchId: 115,
      status: PosSuspendedCartStatus.SUSPENDED,
      cartSnapshot: {},
      metadata: null,
    });
    await expect(
      service.updateSuspendedCart(25383, {
        branchId: 115,
        cartSnapshot: pupil().cartSnapshot,
      } as any),
    ).rejects.toThrow(/already on the roll/);
    expect(suspendedCartsRepository.save).not.toHaveBeenCalled();
  });
});

describe('PosRegisterService — one folio, read fresh (GET suspended-carts/:id)', () => {
  it('answers the row only when it sits on the branch asked about', async () => {
    const row = {
      id: 41,
      branchId: 115,
      status: PosSuspendedCartStatus.DISCARDED,
      label: '3aad',
      cartSnapshot: {},
      createdAt: new Date('2026-09-22T08:00:00Z'),
      updatedAt: new Date('2026-09-22T08:00:00Z'),
    };
    const findOne = jest.fn(async ({ where }: any) =>
      where.id === row.id && where.branchId === row.branchId ? row : null,
    );
    const service = new PosRegisterService(
      { findOne: jest.fn() } as any,
      { findOne } as any,
      { findOne: jest.fn() } as any,
      { dispatchCloseReport: jest.fn() } as any,
      { findOne: jest.fn() } as any,
    );
    // Any status: the office re-reads a withdrawn pupil too.
    const out = await service.findSuspendedCartOnBranch(41, 115);
    expect(out).toMatchObject({ id: 41, status: 'DISCARDED' });
    await expect(service.findSuspendedCartOnBranch(41, 128)).rejects.toThrow(
      /not found on branch 128/,
    );
  });
});

/**
 * PATCH suspended-carts/:id under a lock, with an optional precondition, and
 * with a stored pupil's marks and pupil-ness guarded.
 */
describe('PosRegisterService.updateSuspendedCart — the row as it stands now', () => {
  const stamp = new Date('2026-09-22T08:14:05.123Z');
  const MARKS = {
    version: 1,
    reports: [{ term: '2019-S1', subjects: [{ subject: 'Maths', total: 40 }] }],
  };
  function makeService({
    stored,
    ownerId = 1863,
    assignment = null as any,
  }: {
    stored: any;
    ownerId?: number;
    assignment?: any;
  }) {
    const qb: any = {
      select: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      getOne: jest.fn(async () => null),
    };
    const carts: any = {
      findOne: jest.fn(async () => stored),
      save: jest.fn(async (row: any) => ({ ...row, updatedAt: new Date() })),
      createQueryBuilder: jest.fn(() => qb),
    };
    const branches: any = {
      findOne: jest.fn(async () => ({ id: 115, ownerId })),
    };
    const staff: any = { findOne: jest.fn(async () => assignment) };
    const repos = new Map<any, any>([
      [PosSuspendedCart, carts],
      [Branch, branches],
      [BranchStaffAssignment, staff],
    ]);
    carts.manager = {
      transaction: jest.fn(async (fn: any) =>
        fn({ getRepository: (entity: any) => repos.get(entity) }),
      ),
    };
    // Repositories handed to the constructor are NOT the transaction's: a
    // read that escapes the transaction would reach these and fail the test.
    const outside: any = {
      findOne: jest.fn(async () => {
        throw new Error('read outside the transaction');
      }),
    };
    const service = new PosRegisterService(
      outside,
      carts,
      outside,
      { dispatchCloseReport: jest.fn() } as any,
      outside,
    );
    return { service, carts, staff };
  }

  const pupilRow = (snap: Record<string, unknown> = {}) => ({
    id: 16867,
    branchId: 115,
    status: PosSuspendedCartStatus.SUSPENDED,
    label: '3aad',
    total: 2000,
    itemCount: 1,
    metadata: { partialPaidAmount: 0 },
    createdAt: stamp,
    updatedAt: stamp,
    cartSnapshot: {
      serviceFormat: 'SCHOOL',
      hotelGuestName: 'Amina Cali',
      hotelRoomNumber: '3aad',
      schoolAcademicRecord: MARKS,
      cartLines: [{ name: 'Tuition', quantity: 1, unitPrice: 2000 }],
      ...snap,
    },
  });

  it('locks the row it reads, and writes through the same transaction', async () => {
    const { service, carts } = makeService({ stored: pupilRow() });
    await service.updateSuspendedCart(16867, { branchId: 115, total: 1500 });
    expect(carts.findOne).toHaveBeenCalledWith({
      where: { id: 16867 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(carts.manager.transaction).toHaveBeenCalledTimes(1);
    expect(carts.save.mock.calls[0][0].total).toBe(1500);
  });

  it('refuses a write planned over an older copy of the row — 409 FOLIO_CHANGED carrying the row as it stands', async () => {
    const { service, carts } = makeService({ stored: pupilRow() });
    const err = await service
      .updateSuspendedCart(16867, {
        branchId: 115,
        total: 0,
        expectedUpdatedAt: '2026-09-22T08:10:00.000Z',
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    const body = err.getResponse();
    expect(body.code).toBe('FOLIO_CHANGED');
    expect(body.message).toMatch(/changed since it was read/);
    expect(body.details.current).toMatchObject({ id: 16867, total: 2000 });
    expect(carts.save).not.toHaveBeenCalled();
  });

  it('writes when the precondition matches to the millisecond, and unconditionally when none is sent', async () => {
    const a = makeService({ stored: pupilRow() });
    await a.service.updateSuspendedCart(16867, {
      branchId: 115,
      total: 1500,
      expectedUpdatedAt: stamp.toISOString(),
    });
    expect(a.carts.save).toHaveBeenCalledTimes(1);
    const b = makeService({ stored: pupilRow() });
    await b.service.updateSuspendedCart(16867, { branchId: 115, total: 1500 });
    expect(b.carts.save).toHaveBeenCalledTimes(1);
  });

  it("keeps a stored pupil's marks, whatever copy the till sent", async () => {
    // The till read the list minutes ago; a teacher has saved marks since.
    const { service, carts } = makeService({ stored: pupilRow() });
    await service.updateSuspendedCart(16867, {
      branchId: 115,
      cartSnapshot: {
        ...pupilRow().cartSnapshot,
        schoolAcademicRecord: { version: 1, reports: [] },
        paid: true,
      },
    });
    const written = carts.save.mock.calls[0][0].cartSnapshot;
    expect(written.schoolAcademicRecord).toEqual(MARKS);
    expect(written.paid).toBe(true);
  });

  it('adds no marks to a pupil who had none stored', async () => {
    const stored = pupilRow();
    delete (stored.cartSnapshot as any).schoolAcademicRecord;
    const { service, carts } = makeService({ stored });
    await service.updateSuspendedCart(16867, {
      branchId: 115,
      cartSnapshot: { ...pupilRow().cartSnapshot },
    });
    expect(
      'schoolAcademicRecord' in carts.save.mock.calls[0][0].cartSnapshot,
    ).toBe(false);
  });

  it('leaves every other format exactly as it was — the snapshot is replaced as sent', async () => {
    const hotel = {
      ...pupilRow(),
      cartSnapshot: {
        serviceFormat: 'HOTEL',
        hotelGuestName: 'Guest',
        hotelRoomNumber: '204',
        cartLines: [],
      },
    };
    const { service, carts } = makeService({ stored: hotel });
    await service.updateSuspendedCart(16867, {
      branchId: 115,
      metadata: { qsrPrint: { count: 1 } },
      cartSnapshot: {
        serviceFormat: 'PROPERTY_RENTAL',
        hotelGuestName: '',
        cartLines: [{ name: 'Rent' }],
      },
      label: ' Unit 4 ',
    });
    const written = carts.save.mock.calls[0][0];
    expect(written.cartSnapshot).toEqual({
      serviceFormat: 'PROPERTY_RENTAL',
      hotelGuestName: '',
      cartLines: [{ name: 'Rent' }],
    });
    expect(written.metadata).toEqual({
      partialPaidAmount: 0,
      qsrPrint: { count: 1 },
    });
    expect(written.label).toBe('Unit 4');
  });

  it('refuses to turn a pupil into a non-pupil without the withdrawal right — the discard would slip past it next', async () => {
    const clerk = {
      role: 'OPERATOR',
      isActive: true,
      capabilities: [],
    };
    for (const change of [
      { serviceFormat: 'RETAIL' },
      { hotelGuestName: '  ' },
    ]) {
      const { service, carts } = makeService({
        stored: pupilRow(),
        assignment: clerk,
      });
      await expect(
        service.updateSuspendedCart(
          16867,
          {
            branchId: 115,
            cartSnapshot: { ...pupilRow().cartSnapshot, ...change },
          },
          { id: 2465, email: 'clerk@x' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(carts.save).not.toHaveBeenCalled();
    }
  });

  it('lets the owner, or an account granted WITHDRAW_STUDENT, make that change', async () => {
    const owner = makeService({ stored: pupilRow() });
    await owner.service.updateSuspendedCart(
      16867,
      {
        branchId: 115,
        cartSnapshot: { ...pupilRow().cartSnapshot, serviceFormat: 'RETAIL' },
      },
      { id: 1863 },
    );
    expect(owner.carts.save).toHaveBeenCalledTimes(1);
    const granted = makeService({
      stored: pupilRow(),
      assignment: {
        role: 'OPERATOR',
        isActive: true,
        capabilities: ['WITHDRAW_STUDENT'],
      },
    });
    await granted.service.updateSuspendedCart(
      16867,
      {
        branchId: 115,
        cartSnapshot: { ...pupilRow().cartSnapshot, hotelGuestName: '' },
      },
      { id: 2465 },
    );
    expect(granted.carts.save).toHaveBeenCalledTimes(1);
  });

  it('asks nothing of an ordinary fee save that keeps the pupil a pupil', async () => {
    const { service, carts, staff } = makeService({ stored: pupilRow() });
    await service.updateSuspendedCart(
      16867,
      {
        branchId: 115,
        cartSnapshot: { ...pupilRow().cartSnapshot, paid: true },
      },
      { id: 2465 },
    );
    expect(staff.findOne).not.toHaveBeenCalled();
    expect(carts.save).toHaveBeenCalledTimes(1);
  });
});
