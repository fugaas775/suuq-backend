import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVerificationFieldsToUser1752778372804
  implements MigrationInterface
{
  name = 'AddVerificationFieldsToUser1752778372804';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_verificationstatus_enum" AS ENUM('UNVERIFIED', 'PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "verificationStatus" "public"."user_verificationstatus_enum" NOT NULL DEFAULT 'UNVERIFIED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "verificationDocuments" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "verified" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "verified"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "verificationDocuments"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "verificationStatus"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."user_verificationstatus_enum"`,
    );
  }
}
