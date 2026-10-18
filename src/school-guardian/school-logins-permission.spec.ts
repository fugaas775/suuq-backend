import 'reflect-metadata';
import { POS_REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/require-pos-permissions.decorator';
import {
  SchoolGuardianController,
  SchoolNoticeController,
} from './school-guardian.controller';
import { SchoolStudentAccountController } from './school-student-account.controller';
import { PosRegisterPermission } from '../branch-staff/dto/create-branch-staff-manual-account.dto';

/**
 * The cashier's logins-only right (owner 2026-10-18: "do not allow cashiers
 * to edit the whole student list, except login only"). MANAGE_SCHOOL_LOGINS
 * opens the two login desks and NOTHING else the office's ENROL_STUDENT
 * opens — notices included.
 */
const on = (ctrl: { prototype: object }, method: string): string[] =>
  Reflect.getMetadata(
    POS_REQUIRED_PERMISSIONS_KEY,
    (ctrl.prototype as Record<string, unknown>)[method],
  ) ?? [];

describe('MANAGE_SCHOOL_LOGINS', () => {
  it('is grantable — it sits in the allow-list', () => {
    expect(Object.values(PosRegisterPermission)).toContain(
      'MANAGE_SCHOOL_LOGINS',
    );
  });

  it.each([
    'list',
    'suggestions',
    'create',
    'update',
    'resetPassword',
    'remove',
  ])("opens the parents' desk: %s", (method) => {
    expect(on(SchoolGuardianController, method)).toEqual([
      'ENROL_STUDENT',
      'MANAGE_SCHOOL_LOGINS',
    ]);
  });

  it.each([
    'list',
    'suggestions',
    'create',
    'createMany',
    'update',
    'resetPassword',
    'remove',
  ])("opens the students' desk: %s", (method) => {
    expect(on(SchoolStudentAccountController, method)).toEqual([
      'ENROL_STUDENT',
      'MANAGE_SCHOOL_LOGINS',
    ]);
  });

  it.each(['create', 'update', 'remove'])(
    'does not open notices: %s',
    (method) => {
      expect(on(SchoolNoticeController, method)).not.toContain(
        'MANAGE_SCHOOL_LOGINS',
      );
    },
  );
});
