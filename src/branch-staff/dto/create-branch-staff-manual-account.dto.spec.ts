import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateBranchStaffManualAccountDto,
  PosRegisterPermission,
} from './create-branch-staff-manual-account.dto';
import { POS_SCHOOL_PERMISSION_VALUES } from '../../school/permissions/pos-school-permission.enum';
import { POS_HOSPITALITY_PERMISSION_VALUES } from '../../hospitality/permissions/pos-hospitality-permission.enum';

/**
 * `PosRegisterPermission` is the load-bearing allow-list for staff permissions.
 *
 * Every other staff DTO validates `permissions` with `@IsString({ each: true })`
 * and accepts anything, so this enum is the ONLY place a permission can be
 * rejected — and a permission that cannot survive account creation can never
 * reach a token, however it is declared elsewhere. That is why the SCHOOL
 * permission enum living in `src/school/permissions/` is not sufficient on its
 * own, and why this spec asserts against the DTO rather than against that enum.
 */
async function validatePermissions(permissions: string[]) {
  const dto = plainToInstance(CreateBranchStaffManualAccountDto, {
    branchId: 1,
    fullName: 'Fee Desk Clerk',
    username: 'feedesk',
    password: 'correct-horse',
    role: 'OPERATOR',
    permissions,
  });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'permissions');
}

describe('CreateBranchStaffManualAccountDto — permissions allow-list', () => {
  it('accepts every SCHOOL fee-desk permission', async () => {
    expect(
      await validatePermissions([...POS_SCHOOL_PERMISSION_VALUES]),
    ).toEqual([]);
  });

  it('keeps the SCHOOL enum and the allow-list in step', async () => {
    // Drift guard: the school enum is the documented mirror, this DTO is what
    // actually gates. If someone adds a permission to one and not the other, a
    // school owner gets a 400 they cannot act on.
    const allowed = new Set<string>(Object.values(PosRegisterPermission));
    const missing = POS_SCHOOL_PERMISSION_VALUES.filter(
      (value) => !allowed.has(value),
    );
    expect(missing).toEqual([]);
  });

  it('still rejects a permission nothing declares', async () => {
    const errors = await validatePermissions(['GRANT_EVERYTHING']);
    expect(errors).toHaveLength(1);
  });

  it('accepts the QSR slip re-print grant', async () => {
    // Nothing on the server enforces this one — printing is not a route, the
    // till renders the slip itself. It has to survive account creation all the
    // same: this enum is the only place a permission can be rejected, so a
    // manager granting "re-print parked order slips" would get a 400 they could
    // not act on, and the waiter would never see the control.
    expect(await validatePermissions(['REPRINT_ORDER_SLIP'])).toEqual([]);
  });

  it('accepts every HOTEL hospitality permission', async () => {
    expect(
      await validatePermissions([...POS_HOSPITALITY_PERMISSION_VALUES]),
    ).toEqual([]);
  });

  it('keeps the hospitality enum and the allow-list in step', async () => {
    // The same drift guard the SCHOOL enum gets, for the same reason — this one
    // was missing, and three hospitality permissions had drifted out of the
    // allow-list. SET_ROOM_MAINTENANCE is the one the till actually offers, and
    // because a manager is created holding every gate its format offers, its
    // absence here rejected the whole payload: no manager could be created on a
    // HOTEL branch, and the 400 listed every permission except the one at fault.
    const allowed = new Set<string>(Object.values(PosRegisterPermission));
    const missing = POS_HOSPITALITY_PERMISSION_VALUES.filter(
      (value) => !allowed.has(value),
    );
    expect(missing).toEqual([]);
  });

  it('leaves the existing format permissions grantable', async () => {
    // The school members are additive; nothing else may have been displaced.
    expect(
      await validatePermissions([
        'OPEN_REGISTER',
        'VIEW_FOLIO_BOARD',
        'VIEW_PROPERTY_BOARD',
        'FIRE_KITCHEN_TICKET',
      ]),
    ).toEqual([]);
  });
});
