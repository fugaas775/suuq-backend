import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds branches.supplierOutletProfileId — the link that marks a branch as a
 * wholesale Supplier's backing "cash & carry" outlet (the branch the supplier's
 * Suuq POS counter runs against). References supplier_profiles.id.
 *
 * ON DELETE SET NULL so removing a supplier profile orphans (does not delete)
 * its outlet branch, mirroring the equity-BNPL FK fix. The column is indexed
 * because the supplier-context builder and the POS branch-list filter both look
 * up branches by this id.
 */
export class AddBranchSupplierOutletProfileId20260617000000
  implements MigrationInterface
{
  name = 'AddBranchSupplierOutletProfileId20260617000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "supplierOutletProfileId" integer`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM information_schema.table_constraints
           WHERE constraint_name = 'FK_branches_supplier_outlet_profile'
         ) THEN
           ALTER TABLE "branches"
             ADD CONSTRAINT "FK_branches_supplier_outlet_profile"
             FOREIGN KEY ("supplierOutletProfileId")
             REFERENCES "supplier_profiles"("id") ON DELETE SET NULL;
         END IF;
       END $$;`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_branches_supplier_outlet_profile" ON "branches" ("supplierOutletProfileId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_branches_supplier_outlet_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "FK_branches_supplier_outlet_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "supplierOutletProfileId"`,
    );
  }
}
