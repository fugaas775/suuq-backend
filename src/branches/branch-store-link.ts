import { EntityManager } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';

/**
 * A branch and its consumer storefront are one shop with two ids: `Branch.id`
 * (what POS-S operates) and `VendorStore.id` (what the Consumer app shows). The
 * link is a 1:1 spanning two independently-nullable unique FKs —
 * `Branch.vendorStoreId` and `VendorStore.branchId` — with nothing in the schema
 * keeping them in step. Half-written links are why the Consumer app used to fall
 * back to `branchId ?? storeId` and could address the wrong shop.
 *
 * Write the link only through here, so both halves land together.
 */
export async function linkBranchToVendorStore(
  manager: EntityManager,
  branchId: number,
  vendorStoreId: number,
): Promise<void> {
  await manager
    .getRepository(VendorStore)
    .update({ id: vendorStoreId }, { branchId });
  await manager
    .getRepository(Branch)
    .update({ id: branchId }, { vendorStoreId });
}

/** One branch whose link to its storefront is broken, and how. */
export interface BranchStoreLinkMismatch {
  branchId: number;
  branchName: string;
  /** What the branch row claims its storefront is. */
  branchVendorStoreId: number | null;
  /** The storefront that actually points back at this branch. */
  storeIdPointingHere: number | null;
  reason: 'BRANCH_POINTS_NOWHERE' | 'STORE_POINTS_NOWHERE' | 'POINTS_DISAGREE';
}

/**
 * Finds branches whose storefront link is one-sided or contradictory.
 *
 * `vendor_stores.branchId` is treated as the source of truth: it is the side the
 * consumer read path filters on, so it is the side a shopper actually
 * experiences.
 */
export async function findBranchStoreLinkMismatches(
  manager: EntityManager,
): Promise<BranchStoreLinkMismatch[]> {
  const rows = await manager.query<
    Array<{
      branchId: number;
      branchName: string;
      branchVendorStoreId: number | null;
      storeIdPointingHere: number | null;
    }>
  >(`
    SELECT b.id            AS "branchId",
           b.name          AS "branchName",
           b."vendorStoreId" AS "branchVendorStoreId",
           vs.id           AS "storeIdPointingHere"
    FROM branches b
    LEFT JOIN vendor_stores vs ON vs."branchId" = b.id
    WHERE b."vendorStoreId" IS DISTINCT FROM vs.id
    ORDER BY b.id
  `);

  return rows.map((row) => ({
    ...row,
    reason:
      row.branchVendorStoreId == null
        ? 'BRANCH_POINTS_NOWHERE'
        : row.storeIdPointingHere == null
          ? 'STORE_POINTS_NOWHERE'
          : 'POINTS_DISAGREE',
  }));
}
