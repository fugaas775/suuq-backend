import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateUserVerificationDocumentsToJsonb1754559224101
  implements MigrationInterface
{
  name = 'UpdateUserVerificationDocumentsToJsonb1754559224101';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "verificationDocuments" TYPE jsonb USING "verificationDocuments"::jsonb`,
    );
    await queryRunner.query(
      `UPDATE "user" SET "verificationDocuments" = '[]'::jsonb WHERE "verificationDocuments" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "verificationDocuments" SET DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "verificationDocuments" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "verificationDocuments" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "verificationDocuments" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "verificationDocuments" TYPE text`,
    );
  }
}
