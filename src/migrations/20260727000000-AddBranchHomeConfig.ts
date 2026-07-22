import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a per-branch layout for the branch-customizable Home page (POS `/home`).
 *
 * Stored as a jsonb blob: which widgets show and in what order, custom
 * quick-links, a welcome note and branding. Null = the branch never customized;
 * the client renders a per-format default. The fixed analytics Dashboard
 * (`/dashboard`) ignores it. See BranchHomeConfig on the Branch entity.
 */
export class AddBranchHomeConfig20260727000000 implements MigrationInterface {
  name = 'AddBranchHomeConfig20260727000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "homeConfig" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "homeConfig"`,
    );
  }
}
