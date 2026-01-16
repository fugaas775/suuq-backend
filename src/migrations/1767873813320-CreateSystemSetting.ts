import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSystemSetting1767873813320 implements MigrationInterface {
    name = 'CreateSystemSetting1767873813320'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "system_setting" ("id" SERIAL NOT NULL, "key" character varying NOT NULL, "value" jsonb NOT NULL, "description" character varying, CONSTRAINT "UQ_c6ce0e35b3c0d67dca93523ba1b" UNIQUE ("key"), CONSTRAINT "PK_88dbc9b10c8558420acf7ea642f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "attributes" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TYPE "public"."product_request_condition_enum" RENAME TO "product_request_condition_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."product_request_condition_enum" AS ENUM('ANY', 'NEW', 'USED')`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "condition" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "condition" TYPE "public"."product_request_condition_enum" USING "condition"::"text"::"public"."product_request_condition_enum"`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "condition" SET DEFAULT 'ANY'`);
        await queryRunner.query(`DROP TYPE "public"."product_request_condition_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."product_request_urgency_enum" RENAME TO "product_request_urgency_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."product_request_urgency_enum" AS ENUM('FLEXIBLE', 'THIS_WEEK', 'IMMEDIATE')`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "urgency" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "urgency" TYPE "public"."product_request_urgency_enum" USING "urgency"::"text"::"public"."product_request_urgency_enum"`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "urgency" SET DEFAULT 'FLEXIBLE'`);
        await queryRunner.query(`DROP TYPE "public"."product_request_urgency_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."product_request_status_enum" RENAME TO "product_request_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."product_request_status_enum" AS ENUM('OPEN', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED', 'EXPIRED')`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "status" TYPE "public"."product_request_status_enum" USING "status"::"text"::"public"."product_request_status_enum"`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "status" SET DEFAULT 'OPEN'`);
        await queryRunner.query(`DROP TYPE "public"."product_request_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TYPE "public"."product_request_offer_status_enum" RENAME TO "product_request_offer_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."product_request_offer_status_enum" AS ENUM('SENT', 'SEEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED')`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" TYPE "public"."product_request_offer_status_enum" USING "status"::"text"::"public"."product_request_offer_status_enum"`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" SET DEFAULT 'SENT'`);
        await queryRunner.query(`DROP TYPE "public"."product_request_offer_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "supply_outreach_task" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "supply_outreach_task" ALTER COLUMN "payload" SET DEFAULT '{}'`);
        await queryRunner.query(`CREATE TYPE "public"."product_request_offer_status_enum_old" AS ENUM('SENT', 'SEEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED')`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" TYPE "public"."product_request_offer_status_enum_old" USING "status"::"text"::"public"."product_request_offer_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" SET DEFAULT 'SENT'`);
        await queryRunner.query(`DROP TYPE "public"."product_request_offer_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."product_request_offer_status_enum_old" RENAME TO "product_request_offer_status_enum"`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "metadata" SET DEFAULT '{}'`);
        await queryRunner.query(`CREATE TYPE "public"."product_request_status_enum_old" AS ENUM('OPEN', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED', 'EXPIRED')`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "status" TYPE "public"."product_request_status_enum_old" USING "status"::"text"::"public"."product_request_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "status" SET DEFAULT 'OPEN'`);
        await queryRunner.query(`DROP TYPE "public"."product_request_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."product_request_status_enum_old" RENAME TO "product_request_status_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."product_request_urgency_enum_old" AS ENUM('FLEXIBLE', 'THIS_WEEK', 'IMMEDIATE')`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "urgency" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "urgency" TYPE "public"."product_request_urgency_enum_old" USING "urgency"::"text"::"public"."product_request_urgency_enum_old"`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "urgency" SET DEFAULT 'FLEXIBLE'`);
        await queryRunner.query(`DROP TYPE "public"."product_request_urgency_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."product_request_urgency_enum_old" RENAME TO "product_request_urgency_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."product_request_condition_enum_old" AS ENUM('ANY', 'NEW', 'USED')`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "condition" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "condition" TYPE "public"."product_request_condition_enum_old" USING "condition"::"text"::"public"."product_request_condition_enum_old"`);
        await queryRunner.query(`ALTER TABLE "product_request" ALTER COLUMN "condition" SET DEFAULT 'ANY'`);
        await queryRunner.query(`DROP TYPE "public"."product_request_condition_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."product_request_condition_enum_old" RENAME TO "product_request_condition_enum"`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "attributes" SET DEFAULT '{}'`);
        await queryRunner.query(`DROP TABLE "system_setting"`);
    }

}
