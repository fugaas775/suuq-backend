import 'reflect-metadata';
import { POS_REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/require-pos-permissions.decorator';
import { PosRegisterController } from './pos-register.controller';
import { POS_SCHOOL_PERMISSION_VALUES } from '../school/permissions/pos-school-permission.enum';

/**
 * Every SCHOOL permission that gates a WRITE must also open the route that
 * write goes through.
 *
 * `@RequirePosPermissions` is OR-semantics, and a school operator granted only
 * the school permissions holds none of the generic folio ones — so a permission
 * the frontend checks but no route accepts renders a button that 403s the moment
 * it is pressed. That is worse than no button at all: the clerk is told they may
 * do the thing, and the failure looks like a server fault rather than a missing
 * grant. This pins each one to the route it needs.
 */
const permissionsOn = (method: keyof PosRegisterController): string[] =>
  Reflect.getMetadata(
    POS_REQUIRED_PERMISSIONS_KEY,
    PosRegisterController.prototype[method],
  ) ?? [];

describe('PosRegisterController — SCHOOL route permissions', () => {
  it('lets a school clerk create and re-save a student folio', () => {
    // Both routes: SCHOOL creates via POST and edits IN PLACE via PATCH.
    expect(permissionsOn('suspendCart')).toContain('ENROL_STUDENT');
    expect(permissionsOn('updateSuspendedCart')).toContain('ENROL_STUDENT');
  });

  it('lets POST_FEE_CHARGE reach the route that posts the charge', () => {
    // "Charge next term" adds a line to an EXISTING folio, which for SCHOOL is a
    // PATCH of that row — not a POST of a new one. Granting a clerk this alone
    // used to render the button and then 403 the save.
    expect(permissionsOn('updateSuspendedCart')).toContain('POST_FEE_CHARGE');
  });

  it('lets VIEW_CLASS_BOARD open a student folio from the board', () => {
    expect(permissionsOn('resumeSuspendedCart')).toContain('VIEW_CLASS_BOARD');
  });

  it('lets a fee settle and a folio void clear the row', () => {
    const discard = permissionsOn('discardSuspendedCart');
    expect(discard).toContain('SETTLE_FEE_PAYMENT');
    expect(discard).toContain('VOID_STUDENT_FOLIO');
  });

  it("leaves the other formats' grants untouched", () => {
    // The school members are additive. Dropping one of these would lock out the
    // formats that have been shipping on them.
    expect(permissionsOn('suspendCart')).toEqual(
      expect.arrayContaining([
        'SUSPEND_SALE',
        'OPEN_ROOM_FOLIO',
        'VIEW_FOLIO_BOARD',
      ]),
    );
    expect(permissionsOn('discardSuspendedCart')).toEqual(
      expect.arrayContaining([
        'SETTLE_TABLE_FOLIO',
        'SETTLE_ROOM_FOLIO',
        'SUSPEND_SALE',
      ]),
    );
  });

  it('routes every school permission that gates a write', () => {
    // IMPORT_STUDENT_ROSTER is deliberately absent: it gates the bulk UI, and
    // the folios it creates go through the ordinary ENROL_STUDENT route, so a
    // clerk needs both. Everything else must appear somewhere.
    //
    // MARK_ATTENDANCE is absent for a different reason: its route is real, but
    // it lives on AttendanceController (`pos/v1/attendance/students/mark`), not
    // on this controller. A register touches no suspended cart.
    const EXEMPT = new Set(['IMPORT_STUDENT_ROSTER', 'MARK_ATTENDANCE']);
    const routed = new Set([
      ...permissionsOn('suspendCart'),
      ...permissionsOn('updateSuspendedCart'),
      ...permissionsOn('resumeSuspendedCart'),
      ...permissionsOn('discardSuspendedCart'),
    ]);
    const unrouted = POS_SCHOOL_PERMISSION_VALUES.filter(
      (p) => !EXEMPT.has(p) && !routed.has(p),
    );
    expect(unrouted).toEqual([]);
  });
});
