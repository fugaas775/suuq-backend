import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Register quick-unlock PIN for QSR waiters.
 *
 * Waiters still sign in at the gate with username + password. This is purely
 * about the register lock screen, which today asks a waiter to retype their
 * full credentials every time the till locks — on a shared QSR counter that
 * happens constantly, and it is the reason orders end up on whichever account
 * happened to already be unlocked.
 *
 * Three columns on the assignment rather than on `user`, because the PIN is
 * branch-scoped: the same person working two branches gets two PINs, which
 * matches the existing @Unique(['branchId','userId']) grain.
 *
 *  - unlockPinHash        bcrypt(pin, 10) — the verification path
 *  - unlockPinFingerprint HMAC-SHA256(POS_PIN_PEPPER, branchId:lane:pin)
 *  - unlockPinSetAt       when it was last set, for the staff admin surface
 *
 * The fingerprint exists only so a unique index can enforce "no two waiters in
 * this branch share the same digits". bcrypt is salted, so a unique index on
 * the hash would be meaningless. The index is partial: NULL fingerprints (the
 * overwhelming majority of rows, and every non-QSR branch) do not participate.
 */
export class AddBranchStaffUnlockPin20260817010000
  implements MigrationInterface
{
  name = 'AddBranchStaffUnlockPin20260817010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "branch_staff_assignments"
        ADD COLUMN IF NOT EXISTS "unlockPinHash" character varying,
        ADD COLUMN IF NOT EXISTS "unlockPinFingerprint" character varying,
        ADD COLUMN IF NOT EXISTS "unlockPinSetAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_branch_staff_unlock_pin_fingerprint"
        ON "branch_staff_assignments" ("branchId", "unlockPinFingerprint")
        WHERE "unlockPinFingerprint" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_branch_staff_unlock_pin_fingerprint"
    `);
    await queryRunner.query(`
      ALTER TABLE "branch_staff_assignments"
        DROP COLUMN IF EXISTS "unlockPinSetAt",
        DROP COLUMN IF EXISTS "unlockPinFingerprint",
        DROP COLUMN IF EXISTS "unlockPinHash"
    `);
  }
}
