/**
 * The vehicle-registry permission codes, gathered in one place for the registry
 * module to read.
 *
 * ⚠ THIS ENUM IS NOT THE ALLOW-LIST. `PosRegisterPermission` in
 * `branch-staff/dto/create-branch-staff-manual-account.dto.ts` is what
 * `@IsEnum(PosRegisterPermission, { each: true })` validates staff accounts
 * against, so a code declared here and missing there can never reach an account
 * or a token, however faithfully it is spelled. Add it there first. This file
 * exists so the registry's controllers can name their permissions without
 * importing the whole branch-staff DTO, exactly as `PosSchoolPermission` does.
 *
 * The split is fine-grained on purpose. A registry office separates duties a
 * shop never has to: collapsing these into one VEHICLE_ADMIN would mean the
 * only way to let a clerk renew a licence is to also let them clear a stolen
 * flag on a vehicle the police are looking for.
 */
export enum PosVehiclePermission {
  /** Create the record and issue a first registration, plate and certificate. */
  VEHICLE_ISSUE = 'VEHICLE_ISSUE',
  VEHICLE_RENEW = 'VEHICLE_RENEW',
  VEHICLE_TRANSFER = 'VEHICLE_TRANSFER',
  /** Pass, fail or advise at the bay. An inspector's, never the cashier's. */
  VEHICLE_INSPECT = 'VEHICLE_INSPECT',
  /** Report a vehicle stolen or impounded. */
  VEHICLE_FLAG = 'VEHICLE_FLAG',
  /** Release one. A supervisor's signature, deliberately not the reporter's. */
  VEHICLE_FLAG_CLEAR = 'VEHICLE_FLAG_CLEAR',
  VEHICLE_DEREGISTER = 'VEHICLE_DEREGISTER',
  /** Issue plate series to an office and account for returned or lost blanks. */
  VEHICLE_PLATE_STOCK = 'VEHICLE_PLATE_STOCK',
  VEHICLE_APPLICATION_REVIEW = 'VEHICLE_APPLICATION_REVIEW',
  /** Issue against a failed inspection, or waive a penalty. Always recorded. */
  VEHICLE_OVERRIDE = 'VEHICLE_OVERRIDE',
}

export const POS_VEHICLE_PERMISSION_VALUES = Object.values(
  PosVehiclePermission,
) as string[];
