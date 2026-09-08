import { ForbiddenException } from '@nestjs/common';
import { PosRegisterService } from './pos-register.service';
import { PosSuspendedCartStatus } from './entities/pos-suspended-cart.entity';
import {
  WITHDRAW_STUDENT_CAPABILITY,
  canWithdrawStudent,
  isSchoolPupilFolio,
} from './school-withdrawal.policy';

/**
 * Who may take a pupil off the roll: the school's owner account, or a staff
 * account the owner has granted WITHDRAW_STUDENT on that branch. Nobody by
 * role alone — not a manager, not a cashier, not a platform admin.
 */
describe('school withdrawal policy', () => {
  describe('isSchoolPupilFolio', () => {
    it('is a SCHOOL folio that carries a pupil', () => {
      expect(
        isSchoolPupilFolio({
          cartSnapshot: {
            serviceFormat: 'SCHOOL',
            hotelGuestName: 'Amina Hassan',
          },
        }),
      ).toBe(true);
    });

    it('is not an empty school basket, nor another format', () => {
      expect(
        isSchoolPupilFolio({
          cartSnapshot: { serviceFormat: 'SCHOOL', hotelGuestName: ' ' },
        }),
      ).toBe(false);
      expect(
        isSchoolPupilFolio({
          cartSnapshot: { serviceFormat: 'HOTEL', hotelGuestName: 'A guest' },
        }),
      ).toBe(false);
      expect(isSchoolPupilFolio({ cartSnapshot: {} })).toBe(false);
      expect(isSchoolPupilFolio(null)).toBe(false);
    });
  });

  describe('canWithdrawStudent', () => {
    it('lets the owner', () => {
      expect(canWithdrawStudent({ actorId: 1863, ownerId: 1863 })).toBe(true);
    });

    it('lets a staff account the owner granted it to', () => {
      expect(
        canWithdrawStudent({
          actorId: 128,
          ownerId: 1863,
          assignment: {
            isActive: true,
            capabilities: ['MANAGE_BRANCH_STAFF', WITHDRAW_STUDENT_CAPABILITY],
          },
        }),
      ).toBe(true);
    });

    it('refuses a manager without the grant, and a revoked grant', () => {
      expect(
        canWithdrawStudent({
          actorId: 2379,
          ownerId: 1863,
          assignment: { isActive: true, capabilities: ['MANAGE_BRANCH_STAFF'] },
        }),
      ).toBe(false);
      expect(
        canWithdrawStudent({
          actorId: 128,
          ownerId: 1863,
          assignment: {
            isActive: false,
            capabilities: [WITHDRAW_STUDENT_CAPABILITY],
          },
        }),
      ).toBe(false);
    });

    it('refuses an account with no assignment on the branch, and an anonymous actor', () => {
      expect(
        canWithdrawStudent({ actorId: 3, ownerId: 1863, assignment: null }),
      ).toBe(false);
      expect(canWithdrawStudent({ actorId: null, ownerId: 1863 })).toBe(false);
    });
  });
});

describe('PosRegisterService.discardSuspendedCart (school withdrawal gate)', () => {
  const pupil = (over: Record<string, unknown> = {}) => ({
    id: 7,
    branchId: 3,
    status: PosSuspendedCartStatus.SUSPENDED,
    total: 2300,
    itemCount: 2,
    currency: 'ETB',
    label: '3A',
    metadata: null,
    cartSnapshot: {
      serviceFormat: 'SCHOOL',
      hotelGuestName: 'Amina Hassan',
      schoolAdmissionNo: 'SMAK-0001',
      cartLines: [],
    },
    createdAt: new Date('2026-08-16T09:00:00Z'),
    updatedAt: new Date('2026-08-16T09:00:00Z'),
    ...over,
  });

  function makeService({
    cart,
    ownerId = 1863,
    assignment = null,
  }: {
    cart: ReturnType<typeof pupil>;
    ownerId?: number;
    assignment?: null | { isActive: boolean; capabilities: string[] };
  }) {
    const suspendedCartsRepository = {
      findOne: jest.fn().mockResolvedValue(cart),
      save: jest.fn(async (c) => c),
    };
    const branchesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: cart.branchId, ownerId }),
    };
    const staffAssignmentsRepository = {
      findOne: jest.fn().mockResolvedValue(assignment),
    };
    const reportService = {
      dispatchCloseReport: jest.fn(),
      dispatchStudentWithdrawalEmail: jest.fn(),
    };
    const service = new PosRegisterService(
      { findOne: jest.fn() } as any,
      suspendedCartsRepository as any,
      branchesRepository as any,
      reportService as any,
      staffAssignmentsRepository as any,
    );
    return {
      service,
      suspendedCartsRepository,
      branchesRepository,
      reportService,
    };
  }

  it('lets the owner withdraw, and emails the record when asked', async () => {
    const { service, suspendedCartsRepository, reportService } = makeService({
      cart: pupil(),
    });
    const res = await service.discardSuspendedCart(
      7,
      { branchId: 3, withdrawal: true },
      { id: 1863, email: 'owner@example.com' },
    );
    expect(res.status).toBe(PosSuspendedCartStatus.DISCARDED);
    expect(suspendedCartsRepository.save).toHaveBeenCalledTimes(1);
    expect(reportService.dispatchStudentWithdrawalEmail).toHaveBeenCalledTimes(
      1,
    );
  });

  it('lets a staff account the owner granted WITHDRAW_STUDENT', async () => {
    const { service, suspendedCartsRepository } = makeService({
      cart: pupil(),
      assignment: {
        isActive: true,
        capabilities: ['MANAGE_BRANCH_STAFF', WITHDRAW_STUDENT_CAPABILITY],
      },
    });
    const res = await service.discardSuspendedCart(
      7,
      { branchId: 3 },
      {
        id: 128,
        email: 'suuqsapp@example.com',
      },
    );
    expect(res.status).toBe(PosSuspendedCartStatus.DISCARDED);
    expect(suspendedCartsRepository.save).toHaveBeenCalledTimes(1);
  });

  it('refuses a manager without the grant — flagged as a withdrawal or not', async () => {
    const { service, suspendedCartsRepository, reportService } = makeService({
      cart: pupil(),
      assignment: { isActive: true, capabilities: ['MANAGE_BRANCH_STAFF'] },
    });
    await expect(
      service.discardSuspendedCart(
        7,
        { branchId: 3, withdrawal: true } as any,
        { id: 2379, email: 'khadar@example.com' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.discardSuspendedCart(7, { branchId: 3 } as any, {
        id: 2379,
        email: 'khadar@example.com',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(suspendedCartsRepository.save).not.toHaveBeenCalled();
    expect(reportService.dispatchStudentWithdrawalEmail).not.toHaveBeenCalled();
  });

  it('refuses a platform admin who holds no assignment on the branch', async () => {
    const { service, suspendedCartsRepository } = makeService({
      cart: pupil(),
      assignment: null,
    });
    await expect(
      service.discardSuspendedCart(7, { branchId: 3 } as any, {
        id: 3,
        email: 'admin@example.com',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(suspendedCartsRepository.save).not.toHaveBeenCalled();
  });

  it('leaves every other folio format to the route permissions it already has', async () => {
    const { service, suspendedCartsRepository, branchesRepository } =
      makeService({
        cart: pupil({
          cartSnapshot: {
            serviceFormat: 'HOTEL',
            hotelGuestName: 'A guest',
            cartLines: [],
          },
        }),
        assignment: null,
      });
    const res = await service.discardSuspendedCart(
      7,
      { branchId: 3 },
      {
        id: 2381,
        email: 'cashier@example.com',
      },
    );
    expect(res.status).toBe(PosSuspendedCartStatus.DISCARDED);
    expect(suspendedCartsRepository.save).toHaveBeenCalledTimes(1);
    expect(branchesRepository.findOne).not.toHaveBeenCalled();
  });

  it('does not gate a row that is no longer on the roll', async () => {
    const { service, suspendedCartsRepository, branchesRepository } =
      makeService({
        cart: pupil({ status: PosSuspendedCartStatus.DISCARDED }),
        assignment: null,
      });
    const res = await service.discardSuspendedCart(
      7,
      { branchId: 3 },
      {
        id: 2381,
        email: 'cashier@example.com',
      },
    );
    expect(res.status).toBe(PosSuspendedCartStatus.DISCARDED);
    expect(suspendedCartsRepository.save).not.toHaveBeenCalled();
    expect(branchesRepository.findOne).not.toHaveBeenCalled();
  });
});
