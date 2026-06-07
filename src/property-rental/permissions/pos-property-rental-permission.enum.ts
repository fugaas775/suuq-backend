/**
 * Property Rental POS permissions.
 *
 * Independent of {@link PosHospitalityPermission} (the night-based HOTEL folio
 * permissions). Property Rental is a month-based format with its own booking
 * lifecycle, so it carries a dedicated permission set. These values mirror the
 * frontend `PROPERTY_RENTAL_PERMISSION_VALUES` (pos-s src/shared/constants.js).
 */
export enum PosPropertyRentalPermission {
  VIEW_PROPERTY_BOARD = 'VIEW_PROPERTY_BOARD',
  OPEN_PROPERTY_BOOKING = 'OPEN_PROPERTY_BOOKING',
  POST_PROPERTY_CHARGE = 'POST_PROPERTY_CHARGE',
  SETTLE_PROPERTY_BOOKING = 'SETTLE_PROPERTY_BOOKING',
  VOID_PROPERTY_BOOKING = 'VOID_PROPERTY_BOOKING',
  TRANSFER_PROPERTY_UNIT = 'TRANSFER_PROPERTY_UNIT',
}

export const POS_PROPERTY_RENTAL_PERMISSION_VALUES = Object.values(
  PosPropertyRentalPermission,
);
