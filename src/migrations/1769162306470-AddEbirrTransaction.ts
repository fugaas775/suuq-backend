import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEbirrTransaction1769162306470 implements MigrationInterface {
    name = 'AddEbirrTransaction1769162306470'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_impression" DROP CONSTRAINT "FK_product_impression_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_product_impression_userId"`);
        await queryRunner.query(`CREATE TABLE "ebirr_transaction" ("id" SERIAL NOT NULL, "merch_order_id" character varying NOT NULL, "invoiceId" character varying, "trans_id" character varying, "issuer_trans_id" character varying, "status" character varying NOT NULL DEFAULT 'PENDING', "amount" numeric(10,2) NOT NULL, "currency" character varying, "payer_name" character varying, "payer_account" character varying, "req_transaction_id" character varying, "request_timestamp" character varying, "raw_request_payload" text, "raw_response_payload" text, "response_code" character varying, "response_msg" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6259e19db4d67c875966eee8c0e" UNIQUE ("merch_order_id"), CONSTRAINT "PK_d545b4e0b1e9a6362cbfd9e23b7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "commissionRate" SET DEFAULT '0.05'`);
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
        await queryRunner.query(`ALTER TABLE "product_impression" ADD CONSTRAINT "FK_5745616022b9f0348088098f646" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_impression" DROP CONSTRAINT "FK_5745616022b9f0348088098f646"`);
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
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "commissionRate" SET DEFAULT 0.05`);
        await queryRunner.query(`DROP TABLE "ebirr_transaction"`);
        await queryRunner.query(`CREATE INDEX "IDX_product_impression_userId" ON "product_impression" ("userId") `);
        await queryRunner.query(`ALTER TABLE "product_impression" ADD CONSTRAINT "FK_product_impression_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
