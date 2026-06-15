import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Branch deletes used to orphan equity BNPL rows. `branchId` on
 * `equity_partner_bnpl_activations` and `equity_partner_bnpl_credit_ledger`
 * had NO foreign key, so deleting a branch left the activation/ledger rows
 * dangling — they render as ghost "Branch #N — Outstanding" entries in the
 * admin equity view (the user's reported bug: deleted Branch #95 still showed
 * as Outstanding).
 *
 * Fix:
 *   1. Detach existing orphans (branchId -> NULL) so the new FK validates.
 *      Rows are preserved with their status intact ("detach only" cleanup).
 *   2. Add a real FK with ON DELETE SET NULL so future branch deletes detach
 *      cleanly instead of orphaning.
 *
 * Combined with a service-level guard that blocks deleting a branch while it
 * still has OUTSTANDING activations (see BranchesService), this keeps financial
 * history intact and stops new ghosts.
 *
 * Idempotent: orphan cleanup is a no-op when none remain; any pre-existing FK on
 * branchId is dropped before the named one is (re-)added.
 */
export class AddEquityBnplBranchFkSetNull20260716000000
  implements MigrationInterface
{
  name = 'AddEquityBnplBranchFkSetNull20260716000000';

  private readonly targets = [
    {
      table: 'equity_partner_bnpl_activations',
      fk: 'FK_equity_bnpl_activation_branch',
    },
    {
      table: 'equity_partner_bnpl_credit_ledger',
      fk: 'FK_equity_bnpl_ledger_branch',
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, fk } of this.targets) {
      // 1. Detach orphaned rows (branch already deleted) so the FK can validate.
      await queryRunner.query(
        `UPDATE "${table}" SET "branchId" = NULL
         WHERE "branchId" IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM "branches" b WHERE b.id = "${table}"."branchId"
           )`,
      );

      // 2. Drop any pre-existing FK from this table to branches (defensive).
      await queryRunner.query(`
        DO $$
        DECLARE c text;
        BEGIN
          SELECT conname INTO c
          FROM pg_constraint
          WHERE conrelid = '${table}'::regclass
            AND contype = 'f'
            AND confrelid = 'branches'::regclass
          LIMIT 1;
          IF c IS NOT NULL THEN
            EXECUTE format('ALTER TABLE "${table}" DROP CONSTRAINT %I', c);
          END IF;
        END $$;
      `);

      // 3. Add the FK with ON DELETE SET NULL.
      await queryRunner.query(
        `ALTER TABLE "${table}"
         ADD CONSTRAINT "${fk}"
         FOREIGN KEY ("branchId") REFERENCES "branches"(id) ON DELETE SET NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, fk } of this.targets) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${fk}"`,
      );
    }
  }
}
