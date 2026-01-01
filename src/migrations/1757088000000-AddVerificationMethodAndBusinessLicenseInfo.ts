import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVerificationMethodAndBusinessLicenseInfo1757088000000
  implements MigrationInterface
{
  name = 'AddVerificationMethodAndBusinessLicenseInfo1757088000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure enum exists (if enum based storage was intended earlier) but we stored as varchar so skip enum creation.
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "verificationMethod" varchar(255) DEFAULT 'NONE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "businessLicenseInfo" jsonb`,
    );

    // Backfill default values for existing NULL verificationMethod rows (if any created before default applied)
    await queryRunner.query(
      `UPDATE "user" SET "verificationMethod"='NONE' WHERE "verificationMethod" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Safe rollback (will not remove column if other code depends on it; but for completeness we drop)
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "businessLicenseInfo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "verificationMethod"`,
    );
  }
}
