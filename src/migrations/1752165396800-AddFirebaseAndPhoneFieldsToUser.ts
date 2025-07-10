import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFirebaseAndPhoneFieldsToUser1752165396800 implements MigrationInterface {
    name = 'AddFirebaseAndPhoneFieldsToUser1752165396800'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD "firebaseUid" character varying`);
        await queryRunner.query(`ALTER TABLE "user" ADD CONSTRAINT "UQ_905432b2c46bdcfe1a0dd3cdeff" UNIQUE ("firebaseUid")`);
        await queryRunner.query(`ALTER TABLE "user" ADD "phoneCountryCode" character varying(10)`);
        await queryRunner.query(`ALTER TABLE "user" ADD "passwordResetToken" character varying`);
        await queryRunner.query(`ALTER TABLE "user" ADD "passwordResetExpires" TIMESTAMP`);
        await queryRunner.query(`CREATE INDEX "IDX_905432b2c46bdcfe1a0dd3cdef" ON "user" ("firebaseUid") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_905432b2c46bdcfe1a0dd3cdef"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "passwordResetExpires"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "passwordResetToken"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "phoneCountryCode"`);
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "UQ_905432b2c46bdcfe1a0dd3cdeff"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "firebaseUid"`);
    }

}
