import 'reflect-metadata';
import { POS_REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/require-pos-permissions.decorator';
import {
  SchoolGuardianController,
  SchoolNoticeController,
} from './school-guardian.controller';
import { SchoolStudentAccountController } from './school-student-account.controller';
import { PosRegisterPermission } from '../branch-staff/dto/create-branch-staff-manual-account.dto';

/**
 * Who opens the two login desks: the office (ENROL_STUDENT) and the cashier
 * (MANAGE_SCHOOL_LOGINS) for the whole school, a teacher (MANAGE_CLASS_LOGINS)
 * for their own classes — and nothing else those rights open: notices stay
 * the office's alone.
 */
const on = (ctrl: { prototype: object }, method: string): string[] =>
  Reflect.getMetadata(
    POS_REQUIRED_PERMISSIONS_KEY,
    (ctrl.prototype as Record<string, unknown>)[method],
  ) ?? [];

const DESK = ['ENROL_STUDENT', 'MANAGE_SCHOOL_LOGINS', 'MANAGE_CLASS_LOGINS'];

describe('the login desks’ permissions', () => {
  it('are grantable — both logins rights sit in the allow-list', () => {
    expect(Object.values(PosRegisterPermission)).toEqual(
      expect.arrayContaining(['MANAGE_SCHOOL_LOGINS', 'MANAGE_CLASS_LOGINS']),
    );
  });

  it.each([
    'list',
    'suggestions',
    'create',
    'setPupilPhones',
    'update',
    'resetPassword',
    'remove',
  ])("open the parents' desk: %s", (method) => {
    expect(on(SchoolGuardianController, method)).toEqual(DESK);
  });

  it.each([
    'list',
    'suggestions',
    'create',
    'createMany',
    'update',
    'resetPassword',
    'remove',
  ])("open the students' desk: %s", (method) => {
    expect(on(SchoolStudentAccountController, method)).toEqual(DESK);
  });

  it.each(['create', 'update', 'remove'])(
    'do not open notices: %s',
    (method) => {
      expect(on(SchoolNoticeController, method)).not.toContain(
        'MANAGE_SCHOOL_LOGINS',
      );
      expect(on(SchoolNoticeController, method)).not.toContain(
        'MANAGE_CLASS_LOGINS',
      );
    },
  );
});
