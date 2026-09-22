import 'reflect-metadata';
import { POS_REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/require-pos-permissions.decorator';
import { SchoolTextbookController } from './school-textbook.controller';

const permissionsOn = (method: keyof SchoolTextbookController): string[] =>
  Reflect.getMetadata(
    POS_REQUIRED_PERMISSIONS_KEY,
    SchoolTextbookController.prototype[method],
  ) ?? [];

describe('SchoolTextbookController', () => {
  it('hands every issue the strict pupil check — this branch, this class, a pupil', async () => {
    const svc: any = { issue: jest.fn(async () => ({ issued: 1 })) };
    const scope: any = {
      resolve: jest.fn(async () => ({ scoped: false, codes: null })),
      assertInScope: jest.fn(),
      assertPupilsInClass: jest.fn(async () => undefined),
    };
    const controller = new SchoolTextbookController(svc, scope);
    await controller.issue(
      { branchId: 128, classCode: '3aad', title: 'Maths', folioIds: [1] },
      { user: { id: 9 } } as any,
    );
    const passed = svc.issue.mock.calls[0][2];
    await passed.assertPupils('3aad', [1, 2]);
    expect(scope.assertPupilsInClass).toHaveBeenCalledWith(
      128,
      '3aad',
      [1, 2],
      { requireOnRoll: true },
    );
  });

  it('opens unbill to the office alone — ENROL_STUDENT, not a teacher’s register permission', async () => {
    expect(permissionsOn('unbill')).toEqual(['ENROL_STUDENT']);
    const svc: any = { unbill: jest.fn(async () => ({ id: 5 })) };
    const scope: any = { resolve: jest.fn() };
    const controller = new SchoolTextbookController(svc, scope);
    await controller.unbill(5, { branchId: 128 }, { user: { id: 9 } } as any);
    expect(svc.unbill).toHaveBeenCalledWith(5, { branchId: 128 }, 9);
    // Not class-scoped: no scope is even resolved.
    expect(scope.resolve).not.toHaveBeenCalled();
  });
});
