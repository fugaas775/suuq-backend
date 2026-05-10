import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the two tables / columns needed for stateless JWT-based operator session revocation.
 *
 * 1. pos_branch_security (new table)
 *    - Stores a per-branch operatorSessionsRevokedAt timestamp.
 *    - PosBranchAccessGuard checks this on every pos_operator token request:
 *      if token.iat * 1000 < operatorSessionsRevokedAt → 401 Unauthorized.
 *    - Populated by DELETE /api/pos/v1/branches/:branchId/operator-sessions (no userId param).
 *
 * 2. branch_staff_assignments.session_revoked_at (nullable column)
 *    - Per-user revocation timestamp for individual manager sessions.
 *    - Populated by DELETE /api/pos/v1/branches/:branchId/operator-sessions?userId=<id>.
 *    - (Guard-side enforcement for manager tokens can be added as a follow-up;
 *       the column is created here so the data is captured immediately.)
 */
export class AddOperatorSessionRevocation20260510000000
  implements MigrationInterface
{
  name = 'AddOperatorSessionRevocation20260510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Branch-wide revocation table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_branch_security" (
        "branchId"                    integer        NOT NULL,
        "operatorSessionsRevokedAt"   timestamptz    NULL        DEFAULT NULL,
        "updatedAt"                   timestamptz    NOT NULL    DEFAULT now(),
        CONSTRAINT "PK_pos_branch_security" PRIMARY KEY ("branchId")
      )
    `);

    // Per-user (manager) revocation column on assignments
    await queryRunner.query(`
      ALTER TABLE "branch_staff_assignments"
        ADD COLUMN IF NOT EXISTS "sessionRevokedAt" timestamptz NULL DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "branch_staff_assignments"
        DROP COLUMN IF EXISTS "sessionRevokedAt"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_branch_security"`);
  }
}
