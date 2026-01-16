import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTelebirr1768273369695 implements MigrationInterface {
    name = 'AddTelebirr1768273369695'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "telebirr_transaction" ("id" SERIAL NOT NULL, "merch_order_id" character varying NOT NULL, "trans_id" character varying, "payment_order_id" character varying, "status" character varying NOT NULL DEFAULT 'PENDING', "amount" numeric(10,2) NOT NULL, "payer_msisdn" character varying, "raw_response" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ab8e05e578a4f464f7a2b13b7b5" UNIQUE ("merch_order_id"), CONSTRAINT "PK_aef3e4b05c77fd66fa9a57c52ae" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "user" ADD "telebirrAccount" character varying(32)`);
        await queryRunner.query(`ALTER TABLE "vendor" ADD "telebirr_account" character varying(32)`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "attributes" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TYPE "public"."product_request_offer_status_enum" RENAME TO "product_request_offer_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."product_request_offer_status_enum" AS ENUM('SENT', 'SEEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED')`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" TYPE "public"."product_request_offer_status_enum" USING "status"::"text"::"public"."product_request_offer_status_enum"`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" SET DEFAULT 'SENT'`);
        await queryRunner.query(`DROP TYPE "public"."product_request_offer_status_enum_old"`);
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
        await queryRunner.query(`ALTER TABLE "supply_outreach_task" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "supply_outreach_task" ALTER COLUMN "payload" SET DEFAULT '{}'`);
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
        await queryRunner.query(`CREATE TYPE "public"."product_request_offer_status_enum_old" AS ENUM('SENT', 'SEEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED')`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" TYPE "public"."product_request_offer_status_enum_old" USING "status"::"text"::"public"."product_request_offer_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "product_request_offer" ALTER COLUMN "status" SET DEFAULT 'SENT'`);
        await queryRunner.query(`DROP TYPE "public"."product_request_offer_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."product_request_offer_status_enum_old" RENAME TO "product_request_offer_status_enum"`);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "attributes" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "vendor" DROP COLUMN "telebirr_account"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "telebirrAccount"`);
        await queryRunner.query(`DROP TABLE "telebirr_transaction"`);
    }

}
