import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosCheckoutVoidedStatus20260425100000
  implements MigrationInterface
{
  name = 'AddPosCheckoutVoidedStatus20260425100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add VOIDED to the pos_checkout_status_enum
    await queryRunner.query(
      `ALTER TYPE "pos_checkouts_status_enum" ADD VALUE IF NOT EXISTS 'VOIDED'`,
    );

    // 2. Add void audit columns
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts"
        ADD COLUMN IF NOT EXISTS "voidedAt"        TIMESTAMP     DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "voidedByUserId"  INTEGER       DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "voidReason"      TEXT          DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns (enum value removal is not supported in Postgres — leave it)
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts"
        DROP COLUMN IF EXISTS "voidedAt",
        DROP COLUMN IF EXISTS "voidedByUserId",
        DROP COLUMN IF EXISTS "voidReason"`,
    );
  }
}
