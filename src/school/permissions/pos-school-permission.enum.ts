/**
 * School POS (fee-desk) permissions.
 *
 * Independent of {@link PosPropertyRentalPermission} and
 * {@link PosHospitalityPermission}. SCHOOL is the only format whose board unit is
 * a CONTAINER — a class holds one open folio per enrolled student, concurrently,
 * all term — so its verbs are about students and fees, not rooms and nights.
 * These values mirror the frontend `SCHOOL_PERMISSION_VALUES`
 * (pos-s src/shared/constants.js).
 *
 * Deliberately no TRANSFER_* or SET_*_MAINTENANCE member: the transfer control
 * never renders for a grouped board, and a class is a container that is never
 * out of service. A permission for a button that does not exist is dead weight.
 *
 * NOTE: declaring the enum here is not what makes a permission grantable. The
 * load-bearing allow-list is `PosRegisterPermission` in
 * `branch-staff/dto/create-branch-staff-manual-account.dto.ts`, which is what
 * `@IsEnum(..., { each: true })` validates staff-account creation against. This
 * file exists for symmetry with the other two format permission enums and as the
 * documented mirror of the frontend constant.
 */
export enum PosSchoolPermission {
  VIEW_CLASS_BOARD = 'VIEW_CLASS_BOARD',
  ENROL_STUDENT = 'ENROL_STUDENT',
  POST_FEE_CHARGE = 'POST_FEE_CHARGE',
  SETTLE_FEE_PAYMENT = 'SETTLE_FEE_PAYMENT',
  VOID_STUDENT_FOLIO = 'VOID_STUDENT_FOLIO',
  IMPORT_STUDENT_ROSTER = 'IMPORT_STUDENT_ROSTER',
}

export const POS_SCHOOL_PERMISSION_VALUES = Object.values(PosSchoolPermission);
