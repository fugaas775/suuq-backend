/**
 * The three authorities a market run splits into.
 *
 * ⚠ THIS ENUM IS NOT THE ALLOW-LIST. `PosRegisterPermission` in
 * `branch-staff/dto/create-branch-staff-manual-account.dto.ts` is — it is what
 * `@IsEnum(PosRegisterPermission, { each: true })` validates staff accounts
 * against, so a code present here and missing there can never be granted to
 * anybody and every route naming it is permanently closed. This file exists so
 * the controller reads in its own domain's words; the codes must match.
 *
 * Split into three rather than one PURCHASING because they are three different
 * people. The purchaser buys. The manager signs. The cashier opens the drawer.
 * Collapsing them would mean the only way to let somebody file what they spent
 * is to also let them approve it and pay themselves out of the till.
 */
export enum PosPurchasingPermission {
  /** Record what was bought and what it cost. */
  FILE_PURCHASE_RUN = 'FILE_PURCHASE_RUN',
  /** Sign a filed run off — which is what posts it and moves the stock. */
  APPROVE_PURCHASE_RUN = 'APPROVE_PURCHASE_RUN',
  /** Hand cash out of the till against a run. */
  ISSUE_PURCHASE_ADVANCE = 'ISSUE_PURCHASE_ADVANCE',
}
