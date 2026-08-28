/**
 * Hotel / cafeteria hospitality permissions.
 *
 * ⚠ THIS ENUM IS NOT THE ALLOW-LIST. `PosRegisterPermission` in
 * `src/branch-staff/dto/create-branch-staff-manual-account.dto.ts` is what
 * `@IsEnum(PosRegisterPermission, { each: true })` validates staff accounts
 * against, and it is the only place a permission code can be refused. A member
 * added here and not there guards a route that no staff account can ever be
 * granted — and worse, because a manager is created holding every gate its
 * format offers, one such member rejects the whole payload and no manager can
 * be created on the branch at all. That happened to SET_ROOM_MAINTENANCE,
 * RUN_NIGHT_AUDIT and VIEW_HOTEL_REPORT; the drift guard in
 * `create-branch-staff-manual-account.dto.spec.ts` now fails if it recurs.
 */
export enum PosHospitalityPermission {
  FIRE_KITCHEN_TICKET = 'FIRE_KITCHEN_TICKET',
  HOLD_KITCHEN_TICKET = 'HOLD_KITCHEN_TICKET',
  MARK_KITCHEN_TICKET_READY = 'MARK_KITCHEN_TICKET_READY',
  COMPLETE_KITCHEN_HANDOFF = 'COMPLETE_KITCHEN_HANDOFF',
  UPDATE_TABLE_STATUS = 'UPDATE_TABLE_STATUS',
  ASSIGN_TABLE_OWNER = 'ASSIGN_TABLE_OWNER',
  SPLIT_OPEN_BILL = 'SPLIT_OPEN_BILL',
  VIEW_FOLIO_BOARD = 'VIEW_FOLIO_BOARD',
  VIEW_FOLIO = 'VIEW_FOLIO',
  OPEN_ROOM_FOLIO = 'OPEN_ROOM_FOLIO',
  POST_FOLIO_CHARGE = 'POST_FOLIO_CHARGE',
  SETTLE_ROOM_FOLIO = 'SETTLE_ROOM_FOLIO',
  SETTLE_TABLE_FOLIO = 'SETTLE_TABLE_FOLIO',
  VOID_ROOM_FOLIO = 'VOID_ROOM_FOLIO',
  TRANSFER_FOLIO_ROOM = 'TRANSFER_FOLIO_ROOM',
  REOPEN_SETTLED_FOLIO = 'REOPEN_SETTLED_FOLIO',
  SET_ROOM_MAINTENANCE = 'SET_ROOM_MAINTENANCE',
  RUN_NIGHT_AUDIT = 'RUN_NIGHT_AUDIT',
  VIEW_HOTEL_REPORT = 'VIEW_HOTEL_REPORT',
}

export const POS_HOSPITALITY_PERMISSION_VALUES = Object.values(
  PosHospitalityPermission,
);
