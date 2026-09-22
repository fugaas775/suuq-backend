import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SchoolClassScopeService } from './school-class-scope.service';

/**
 * assertPupilsInClass: a register tolerates an id it cannot find (a child
 * withdrawn since the morning); a textbook issue does not — every id must be
 * a pupil of this branch, in the class named.
 */
function make(carts: any[]) {
  const cartRepo: any = {
    find: jest.fn(async ({ where }: any) =>
      carts.filter(
        (c) =>
          (where.id._value ?? []).map(Number).includes(Number(c.id)) &&
          c.branchId === where.branchId,
      ),
    ),
  };
  const svc = new SchoolClassScopeService(
    {} as any,
    {} as any,
    cartRepo,
    {} as any,
    {} as any,
  );
  return { svc, cartRepo };
}

const pupil = (id: number, cls: string, over: any = {}) => ({
  id,
  branchId: 128,
  cartSnapshot: {
    serviceFormat: 'SCHOOL',
    hotelGuestName: `P${id}`,
    hotelRoomNumber: cls,
    ...over,
  },
});

describe('SchoolClassScopeService.assertPupilsInClass', () => {
  it('lets a register carry an id it cannot find, but refuses one from another class', async () => {
    const { svc } = make([pupil(1, '3aad'), pupil(2, '4aad')]);
    await expect(
      svc.assertPupilsInClass(128, '3aad', [1, 99]),
    ).resolves.toBeUndefined();
    await expect(
      svc.assertPupilsInClass(128, '3aad', [1, 2]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('in the strict form, names an id that is not on this branch, and one that is not a pupil', async () => {
    const { svc } = make([
      pupil(1, '3aad'),
      { ...pupil(3, '3aad'), branchId: 115 },
      pupil(4, '3aad', { serviceFormat: 'RETAIL' }),
    ]);
    await expect(
      svc.assertPupilsInClass(128, '3aad', [1, 3], { requireOnRoll: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.assertPupilsInClass(128, '3aad', [1, 3], { requireOnRoll: true }),
    ).rejects.toThrow(/folio 3/);
    await expect(
      svc.assertPupilsInClass(128, '3aad', [1, 4], { requireOnRoll: true }),
    ).rejects.toThrow(/Folio 4 is not a pupil/);
    await expect(
      svc.assertPupilsInClass(128, '3aad', [1], { requireOnRoll: true }),
    ).resolves.toBeUndefined();
  });

  it('in the strict form, still refuses a pupil of another class by name', async () => {
    const { svc } = make([pupil(1, '3aad'), pupil(2, '4aad')]);
    const err = await svc
      .assertPupilsInClass(128, '3aad', [1, 2], { requireOnRoll: true })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({
      code: 'SCHOOL_PUPIL_NOT_IN_CLASS',
    });
  });
});
