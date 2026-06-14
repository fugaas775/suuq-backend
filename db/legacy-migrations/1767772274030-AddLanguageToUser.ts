import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLanguageToUser1767772274030 implements MigrationInterface {
  name = 'AddLanguageToUser1767772274030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // User Language
    await queryRunner.query(
      `ALTER TABLE "user" ADD "language" character varying(5) NOT NULL DEFAULT 'en'`,
    );

    // User Firebase UID
    // Column already exists according to error logs, so skipping ADD COLUMN.

    // Index might or might not exist.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_firebaseUid" ON "user" ("firebaseUid")`,
    );

    // Country Default Language
    await queryRunner.query(
      `ALTER TABLE "country" ADD "defaultLanguage" character varying(5)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "country" DROP COLUMN "defaultLanguage"`,
    );
    // await queryRunner.query(`DROP INDEX "public"."IDX_firebaseUid"`); // Don't drop if we didn't create or if it was pre-existing
    // await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "firebaseUid"`); // Don't drop
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "language"`);
  }
}
