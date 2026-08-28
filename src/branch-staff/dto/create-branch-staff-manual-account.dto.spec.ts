import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateBranchStaffManualAccountDto,
  PosRegisterPermission,
} from './create-branch-staff-manual-account.dto';
import { POS_SCHOOL_PERMISSION_VALUES } from '../../school/permissions/pos-school-permission.enum';
import { POS_HOSPITALITY_PERMISSION_VALUES } from '../../hospitality/permissions/pos-hospitality-permission.enum';
import { POS_VEHICLE_PERMISSION_VALUES } from '../../vehicle-registry/permissions/pos-vehicle-permission.enum';
import { POS_PURCHASING_PERMISSION_VALUES } from '../../purchasing/permissions/pos-purchasing-permission.enum';

/**
 * `PosRegisterPermission` is the load-bearing allow-list for staff permissions.
 *
 * Every other staff DTO validates `permissions` with `@IsString({ each: true })`
 * and accepts anything, so this enum is the ONLY place a permission can be
 * rejected — and a permission that cannot survive account creation can never
 * reach a token, however it is declared elsewhere. That is why the per-format
 * permission enums living in their own modules are not sufficient on their own,
 * and why this spec asserts against the DTO rather than against those enums.
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

/**
 * Every per-format permission enum, and the drift guard each one needs.
 *
 * Each is a documented mirror of the allow-list; this DTO is what actually
 * gates. Add a permission to one and not the other and the owner gets a 400
 * they cannot act on — and because a manager is created holding EVERY gate its
 * branch's format offers, a single missing code fails the whole payload and no
 * manager can be created on that format at all. The 400 then lists every
 * accepted permission, i.e. everything except the one at fault.
 *
 * Hit twice before this table covered all four: REPRINT_ORDER_SLIP (2026-08-22,
 * a frontend ship that landed ahead of the backend enum) and
 * SET_ROOM_MAINTENANCE (2026-08-28, which was never in the allow-list at all —
 * it had guarded a live route since June while being ungrantable, invisible
 * because owners and managers bypass every guard via `isManagerLike`).
 */
const PERMISSION_REGISTRIES: Array<[string, readonly string[]]> = [
  ['school fee-desk', POS_SCHOOL_PERMISSION_VALUES],
  ['hotel/cafeteria hospitality', POS_HOSPITALITY_PERMISSION_VALUES],
  ['vehicle-registry', POS_VEHICLE_PERMISSION_VALUES],
  ['market-run purchasing', POS_PURCHASING_PERMISSION_VALUES],
];

describe('CreateBranchStaffManualAccountDto — permissions allow-list', () => {
  describe.each(PERMISSION_REGISTRIES)('%s permissions', (_name, values) => {
    it('are every one of them grantable', async () => {
      expect(await validatePermissions([...values])).toEqual([]);
    });

    it('stay in step with the allow-list', () => {
      const allowed = new Set<string>(Object.values(PosRegisterPermission));
      expect(values.filter((value) => !allowed.has(value))).toEqual([]);
    });
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
    // not act on, and the waiter would never see the control. It has no format
    // enum of its own, which is why it is asserted by name here.
    expect(await validatePermissions(['REPRINT_ORDER_SLIP'])).toEqual([]);
  });

  it('leaves the base register permissions grantable', async () => {
    // The per-format members are additive; nothing else may have been displaced.
    expect(
      await validatePermissions([
        'OPEN_REGISTER',
        'CLOSE_REGISTER',
        'SUSPEND_SALE',
        'PROCESS_RETURN',
        'VIEW_FOLIO_BOARD',
        'VIEW_PROPERTY_BOARD',
        'FIRE_KITCHEN_TICKET',
      ]),
    ).toEqual([]);
  });
});
