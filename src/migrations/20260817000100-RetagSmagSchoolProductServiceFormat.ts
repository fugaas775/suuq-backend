import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Puts SMAG School's catalog back on SMAG School's register.
 *
 * A product's service format lives in `attributes.serviceFormat`, stamped from
 * the branch's format at the moment it was saved. The register hides any
 * product tagged for a DIFFERENT format — an untagged product is always shown,
 * so only a stale tag can do this — and nothing revisited the tag when a branch
 * changed format. Signups are auto-provisioned as QSR and confirm what they
 * actually sell afterwards, so a branch that built its catalog before switching
 * ended up with every product tagged for a format its register no longer runs.
 *
 * SMAG School (branch 128) is that branch. Its managers and staff opened the
 * till to "No live catalog matches": 138 pupils enrolled, fees to collect, and
 * an empty grid, while every row sat in the database the whole time.
 *
 * The code fix lands alongside this — `retagBranchProductsToServiceFormat` in
 * SellerWorkspaceService now carries the catalog across on a format change — so
 * this migration exists only to repair the branch that already went through it.
 *
 * DELIBERATELY NARROW, on both axes:
 *
 *   - Branch 128 only. A blanket sweep would be a bigger claim than the
 *     evidence supports, and the code fix covers every branch from here on.
 *
 *   - Products linked to NO OTHER branch. A product can be shared across
 *     branches (inventory rows, catalog links, a shared vendor store), and if
 *     two of those branches run different formats then re-tagging for one makes
 *     it vanish from the other. A school is unlikely to share anything, but
 *     "unlikely" is not a reason to write the row. Anything shared is counted
 *     and reported rather than touched.
 *
 * Only `serviceFormat` is rewritten. `browseCategory` is format-shaped too, but
 * a wrong category only files a product under the wrong chip — it still sells
 * from the "All" rail — and guessing one would scatter a catalog somebody may
 * have organised by hand. Invisibility is the bug; filing is not.
 *
 * Idempotent: the WHERE clause skips rows already tagged SCHOOL, so a re-run
 * writes nothing. Down() is intentionally a no-op — the previous tag was wrong
 * for this branch, and restoring it would only hide the catalog again.
 */
export class RetagSmagSchoolProductServiceFormat20260817000100
  implements MigrationInterface
{
  name = 'RetagSmagSchoolProductServiceFormat20260817000100';

  private static readonly BRANCH_ID = 128;
  private static readonly SERVICE_FORMAT = 'SCHOOL';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const branchId =
      RetagSmagSchoolProductServiceFormat20260817000100.BRANCH_ID;
    const serviceFormat =
      RetagSmagSchoolProductServiceFormat20260817000100.SERVICE_FORMAT;

    const branch: Array<{ id: number; serviceFormat: string | null }> =
      await queryRunner.query(
        `SELECT id, "serviceFormat" FROM branches WHERE id = $1`,
        [branchId],
      );

    if (!branch.length) {
      console.log(
        `[retag-smag] Branch ${branchId} not found — nothing to repair (expected on a fresh or non-prod database).`,
      );
      return;
    }

    if (branch[0].serviceFormat !== serviceFormat) {
      // The branch is not the branch this repair was written for. Refuse rather
      // than stamp SCHOOL onto whatever else now lives at that id.
      console.log(
        `[retag-smag] Branch ${branchId} runs ${branch[0].serviceFormat ?? 'NO FORMAT'}, not ${serviceFormat} — skipping.`,
      );
      return;
    }

    // Every product this branch sells, by the same three links the register
    // reads: an inventory row, an explicit catalog link, or this branch's own
    // vendor store.
    const ownProducts = `
      SELECT p.id
      FROM product p
      WHERE p.deleted_at IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM branch_inventory bi
            WHERE bi."productId" = p.id AND bi."branchId" = $1
          )
          OR EXISTS (
            SELECT 1 FROM branch_catalog_product_links bcl
            WHERE bcl."productId" = p.id AND bcl."branchId" = $1
          )
          OR EXISTS (
            SELECT 1 FROM branch_catalog_vendor_links bcv
            JOIN branches b ON b.id = bcv."branchId"
            WHERE bcv."vendorId" = p."vendorId"
              AND bcv."branchId" = $1
              AND b."vendorStoreId" IS NOT NULL
              AND p.vendor_store_id = b."vendorStoreId"
          )
        )
    `;

    // Of those, the ones ALSO linked to some other branch — left untouched.
    const shared: Array<{ id: number }> = await queryRunner.query(
      `
      WITH own_products AS (${ownProducts})
      SELECT op.id FROM own_products op
      JOIN product p ON p.id = op.id
      WHERE EXISTS (
              SELECT 1 FROM branch_inventory bi
              WHERE bi."productId" = op.id AND bi."branchId" <> $1
            )
         OR EXISTS (
              SELECT 1 FROM branch_catalog_product_links bcl
              WHERE bcl."productId" = op.id AND bcl."branchId" <> $1
            )
         OR EXISTS (
              SELECT 1 FROM branch_catalog_vendor_links bcv
              JOIN branches b ON b.id = bcv."branchId"
              WHERE bcv."vendorId" = p."vendorId"
                AND bcv."branchId" <> $1
                AND b."vendorStoreId" IS NOT NULL
                AND p.vendor_store_id = b."vendorStoreId"
            )
      `,
      [branchId],
    );

    const sharedIds = shared.map((row) => Number(row.id));

    const updated: Array<{ id: number }> = await queryRunner.query(
      `
      WITH own_products AS (${ownProducts})
      UPDATE product p
      SET attributes = jsonb_set(
            COALESCE(p.attributes, '{}'::jsonb),
            '{serviceFormat}',
            to_jsonb($2::text),
            true
          )
      WHERE p.id IN (SELECT id FROM own_products)
        AND COALESCE(p.attributes->>'serviceFormat', '') <> $2
        AND NOT (p.id = ANY($3::int[]))
      RETURNING p.id
      `,
      [branchId, serviceFormat, sharedIds],
    );

    console.log(
      `[retag-smag] Branch ${branchId}: re-tagged ${updated.length} product(s) to ${serviceFormat}.` +
        (sharedIds.length
          ? ` Skipped ${sharedIds.length} product(s) also linked to another branch (ids: ${sharedIds.join(', ')}) — re-tagging those could hide them from that branch's register, so they need a decision rather than a sweep.`
          : ''),
    );
  }

  public async down(): Promise<void> {
    // No-op by design: the tag this replaced was the reason the branch's own
    // register could not see its own catalog. Restoring it would re-break it.
  }
}
