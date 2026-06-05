import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds branchSessionNumber — a per-branch sequential counter stored on the
 * session row so every device/browser sees the same human-readable session
 * number instead of relying on a device-local localStorage counter.
 *
 * The column is nullable so that existing sessions are not broken; the
 * application falls back to the raw session id for any NULL rows.
 */
export class AddBranchSessionNumber20260625000000
  implements MigrationInterface
{
  name = 'AddBranchSessionNumber20260625000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_register_sessions" ADD COLUMN IF NOT EXISTS "branchSessionNumber" integer`,
    );

    // Back-fill existing rows: assign sequential numbers per branch ordered by id
    await queryRunner.query(`
      UPDATE "pos_register_sessions" prs
      SET "branchSessionNumber" = sub.rn
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY "branchId" ORDER BY id ASC) AS rn
        FROM "pos_register_sessions"
      ) sub
      WHERE prs.id = sub.id
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_register_sessions" DROP COLUMN IF EXISTS "branchSessionNumber"`,
    );
  }
}
