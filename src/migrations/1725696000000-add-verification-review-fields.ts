import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVerificationReviewFields1725696000000 implements MigrationInterface {
    name = 'AddVerificationReviewFields1725696000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "verificationRejectionReason" text`);
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "verificationReviewedBy" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "verificationReviewedAt" TIMESTAMP`);
        // Helpful index for filtering by status
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_verification_status" ON "user" ("verificationStatus")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_created_at" ON "user" ("createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_created_at"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_verification_status"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "verificationReviewedAt"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "verificationReviewedBy"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "verificationRejectionReason"`);
    }
}
