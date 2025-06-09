import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTypeCaptionAltTextToMedia1749386673425 implements MigrationInterface {
    name = 'AddTypeCaptionAltTextToMedia1749386673425'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_user_googleId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_email"`);
        await queryRunner.query(`ALTER TABLE "media" ALTER COLUMN "type" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "product" DROP CONSTRAINT "FK_921582066aa70b502e78ea92012"`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "price" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "sale_price" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "average_rating" TYPE numeric(3,2)`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "vendorId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "password" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "roles" SET DEFAULT 'CUSTOMER'`);
        await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "theme"`);
        await queryRunner.query(`CREATE TYPE "public"."user_settings_theme_enum" AS ENUM('light', 'dark')`);
        await queryRunner.query(`ALTER TABLE "user_settings" ADD "theme" "public"."user_settings_theme_enum" NOT NULL DEFAULT 'light'`);
        await queryRunner.query(`CREATE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user" ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_470355432cc67b2c470c30bef7" ON "user" ("googleId") `);
        await queryRunner.query(`ALTER TABLE "product" ADD CONSTRAINT "FK_921582066aa70b502e78ea92012" FOREIGN KEY ("vendorId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP CONSTRAINT "FK_921582066aa70b502e78ea92012"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_470355432cc67b2c470c30bef7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e12875dfb3b1d92d7d7c5377e2"`);
        await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "theme"`);
        await queryRunner.query(`DROP TYPE "public"."user_settings_theme_enum"`);
        await queryRunner.query(`ALTER TABLE "user_settings" ADD "theme" character varying NOT NULL DEFAULT 'light'`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "roles" SET DEFAULT '["CUSTOMER"]'`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "password" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "vendorId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "average_rating" TYPE numeric`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "sale_price" TYPE numeric`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "price" TYPE numeric`);
        await queryRunner.query(`ALTER TABLE "product" ADD CONSTRAINT "FK_921582066aa70b502e78ea92012" FOREIGN KEY ("vendorId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "media" ALTER COLUMN "type" DROP NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_user_email" ON "user" ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_googleId" ON "user" ("googleId") `);
    }
}