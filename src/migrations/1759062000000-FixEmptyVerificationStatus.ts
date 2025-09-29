import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Data hygiene migration: ensure user.verificationStatus never stores empty string.
 * We normalize any empty-string values to 'UNVERIFIED'.
 *
 * Safe on all envs: if no such rows exist, it becomes a no-op.
 */
export class FixEmptyVerificationStatus1759062000000 implements MigrationInterface {
  name = 'FixEmptyVerificationStatus1759062000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Some legacy rows may have an empty string in enum column due to prior schema inconsistencies.
    // Normalize them to a valid enum value 'UNVERIFIED'. We cast the enum to text for comparison and back using the enum literal.
    // Postgres accepts setting enum column directly to the literal string when it's a valid enum member.
    await queryRunner.query(`
      UPDATE "user"
      SET "verificationStatus" = 'UNVERIFIED'
      WHERE CAST("verificationStatus" AS text) = ''
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No reliable way to restore previous empty values; this is intentionally a no-op.
    // If needed, you could set empty values back, but it's undesirable. Leaving as NOP.
  }
}
