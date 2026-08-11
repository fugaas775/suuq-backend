import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets an equity partner BNPL-fund a *supplier* account (not just a POS branch).
 *
 * Both BNPL tables gain an `accountKind` discriminator ('BRANCH' default |
 * 'SUPPLIER') and a nullable `supplierProfileId`. `branchId` becomes nullable so
 * supplier-funded rows can leave it empty. Existing rows keep `accountKind`
 * 'BRANCH' via the column default — no backfill needed.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS + DROP NOT NULL (a no-op when already
 * nullable), so re-running is safe.
 */
export class AddEquityBnplSupplierAccountKind20260715000000
  implements MigrationInterface
{
  name = 'AddEquityBnplSupplierAccountKind20260715000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'equity_partner_bnpl_activations',
      'equity_partner_bnpl_credit_ledger',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "accountKind" varchar(16) NOT NULL DEFAULT 'BRANCH'`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "supplierProfileId" integer`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "branchId" DROP NOT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore NOT NULL only if no supplier-funded rows exist (those have a null
    // branchId and would block the constraint).
    for (const table of [
      'equity_partner_bnpl_activations',
      'equity_partner_bnpl_credit_ledger',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "supplierProfileId"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "accountKind"`,
      );
      const nullBranches = await queryRunner.query(
        `SELECT 1 FROM "${table}" WHERE "branchId" IS NULL LIMIT 1`,
      );
      if (!nullBranches?.length) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "branchId" SET NOT NULL`,
        );
      }
    }
  }
}
