import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes the order-slip verification token.
 *
 * Unlike a receipt's token, a slip's lives in the cart's existing metadata,
 * beside the print record that is already written when the slip is printed —
 * so a slip becomes checkable without a second round trip or a column of its
 * own. That leaves the public lookup reading a jsonb path, which needs an
 * expression index to stay a single-row probe rather than a scan of every
 * parked basket on the platform.
 *
 * Partial, because only printed slips carry a token and the rest would be
 * dead weight in the index.
 */
export class AddPosSuspendedCartVerificationIndex20260805000000
  implements MigrationInterface
{
  name = 'AddPosSuspendedCartVerificationIndex20260805000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pos_suspended_carts_verification_code" ` +
        `ON "pos_suspended_carts" (("metadata" -> 'qsrPrint' ->> 'code')) ` +
        `WHERE "metadata" -> 'qsrPrint' ->> 'code' IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_pos_suspended_carts_verification_code"`,
    );
  }
}
