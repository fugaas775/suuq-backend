import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the opaque public verification token printed as the QR code on POS
 * receipts.
 *
 * The register mints the token when it creates the receipt — offline included,
 * since a sale can be captured with no connectivity and drained from the outbox
 * later — so the paper carries a pointer and the server keeps the truth. A
 * customer scans the QR, lands on the public verify page, and sees what THIS
 * server holds for that sale rather than whatever the paper claims.
 *
 * 10 chars of Crockford base32 (50 bits) in a 16-char column, leaving room for
 * a longer token later. The unique index is partial: every receipt issued
 * before this shipped stays NULL and is honestly reported as unverifiable
 * rather than back-filled with a token that was never printed.
 */
export class AddPosCheckoutVerificationCode20260804000000
  implements MigrationInterface
{
  name = 'AddPosCheckoutVerificationCode20260804000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" ADD COLUMN IF NOT EXISTS "verificationCode" character varying(16)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pos_checkouts_verification_code" ON "pos_checkouts" ("verificationCode") WHERE "verificationCode" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_pos_checkouts_verification_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" DROP COLUMN IF EXISTS "verificationCode"`,
    );
  }
}
