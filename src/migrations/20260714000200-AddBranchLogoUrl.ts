import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a per-branch brand logo URL to branches.
 *
 * The logo is uploaded via the generic /media flow and the resulting public URL
 * is stored here. It is shown in the register branch badge (all service formats)
 * and on receipts. Null = no logo (falls back to the format emoji).
 */
export class AddBranchLogoUrl20260714000200 implements MigrationInterface {
  name = 'AddBranchLogoUrl20260714000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "logoUrl" character varying(512)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "logoUrl"`,
    );
  }
}
