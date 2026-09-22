import { ForbiddenException } from '@nestjs/common';
import { SchoolClassScopeService } from '../school/school-class-scope.service';
import { AttendanceController } from './attendance.controller';

/**
 * The two register-rewriting doors (reclass, rekey) are the office's. A login
 * held to its classes — the Teacher lane may carry ENROL_STUDENT beside it —
 * moves a register only between two classes that are both its own, and never
 * re-files a pupil's register between records.
 */
function make(scope: { scoped: boolean; codes?: string[] }) {
  const svc: any = {
    reclass: jest.fn(async () => ({ updated: 12 })),
    rekey: jest.fn(async () => ({ moved: 3, dropped: 0 })),
  };
  // The real refusal logic, over a resolved scope the test chooses.
  const scopeSvc = Object.create(
    SchoolClassScopeService.prototype,
  ) as SchoolClassScopeService;
  (scopeSvc as any).resolve = jest.fn(async () => ({
    scoped: scope.scoped,
    codes: scope.scoped ? new Set(scope.codes ?? []) : null,
    recordedBy: 'Someone',
  }));
  const controller = new AttendanceController(svc, scopeSvc, {} as any);
  return { controller, svc };
}

const req: any = { user: { id: 2465, roles: ['POS_OPERATOR'] } };

describe('AttendanceController — reclass and rekey are the office’s', () => {
  it('lets the office move any class’s register', async () => {
    const { controller, svc } = make({ scoped: false });
    await expect(
      controller.reclass({ branchId: 115, from: '4aad', to: '9th' }, req),
    ).resolves.toEqual({ updated: 12 });
    expect(svc.reclass).toHaveBeenCalled();
  });

  it('holds a scoped login to BOTH classes of a move', async () => {
    const { controller, svc } = make({ scoped: true, codes: ['3aad'] });
    await expect(
      controller.reclass({ branchId: 115, from: '4aad', to: '3aad' }, req),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.reclass({ branchId: 115, from: '3aad', to: '4aad' }, req),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.reclass).not.toHaveBeenCalled();

    const own = make({ scoped: true, codes: ['3aad', '3aad b'] });
    await own.controller.reclass(
      { branchId: 115, from: '3AAD', to: '3aad B' },
      req,
    );
    expect(own.svc.reclass).toHaveBeenCalled();
  });

  it('refuses a scoped login a rekey outright, and lets the office', async () => {
    const scoped = make({ scoped: true, codes: ['3aad'] });
    await expect(
      scoped.controller.rekey({ branchId: 115, from: '7', to: '8' }, req),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(scoped.svc.rekey).not.toHaveBeenCalled();

    const office = make({ scoped: false });
    await office.controller.rekey({ branchId: 115, from: '7', to: '8' }, req);
    expect(office.svc.rekey).toHaveBeenCalled();
  });
});
