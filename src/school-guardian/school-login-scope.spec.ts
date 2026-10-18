import { classOk, loginsWholeSchool } from './school-login-scope';

describe('school-login-scope', () => {
  const op = (permissions: string[], extra = {}) => ({
    isActive: true,
    role: 'OPERATOR',
    permissions,
    ...extra,
  });
  it('gives the whole school to the office, the cashier, a manager, the owner and a platform admin', () => {
    expect(
      loginsWholeSchool({
        actorId: 9,
        ownerId: 7,
        assignment: op(['ENROL_STUDENT']),
      }),
    ).toBe(true);
    expect(
      loginsWholeSchool({
        actorId: 9,
        ownerId: 7,
        assignment: op(['MANAGE_SCHOOL_LOGINS']),
      }),
    ).toBe(true);
    expect(
      loginsWholeSchool({
        actorId: 9,
        ownerId: 7,
        assignment: op([], { role: 'MANAGER' }),
      }),
    ).toBe(true);
    expect(
      loginsWholeSchool({ actorId: 7, ownerId: 7, assignment: null }),
    ).toBe(true);
    expect(
      loginsWholeSchool({ actorId: 9, ownerId: 7, roles: ['SUPER_ADMIN'] }),
    ).toBe(true);
  });
  it('holds a teacher — MANAGE_CLASS_LOGINS alone — to their classes', () => {
    expect(
      loginsWholeSchool({
        actorId: 9,
        ownerId: 7,
        assignment: op([
          'VIEW_CLASS_BOARD',
          'MARK_ATTENDANCE',
          'MANAGE_CLASS_LOGINS',
        ]),
      }),
    ).toBe(false);
    expect(
      loginsWholeSchool({
        actorId: 9,
        ownerId: 7,
        assignment: op(['ENROL_STUDENT'], { isActive: false }),
      }),
    ).toBe(false);
    const scope = { codes: new Set(['3aad']) };
    expect(classOk(scope, ' 3AAD ')).toBe(true);
    expect(classOk(scope, '5aad')).toBe(false);
    expect(classOk(null, '5aad')).toBe(true);
  });

  it('gives no global POS_MANAGER the whole school — the tenant owner, yes', () => {
    expect(
      loginsWholeSchool({
        actorId: 9,
        ownerId: 7,
        roles: ['POS_MANAGER'],
        assignment: null,
      }),
    ).toBe(false);
    expect(
      loginsWholeSchool({
        actorId: 9,
        ownerId: 7,
        tenantOwnerId: 9,
        assignment: null,
      }),
    ).toBe(true);
  });
});
