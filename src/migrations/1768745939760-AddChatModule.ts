import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChatModule1768745939760 implements MigrationInterface {
    name = 'AddChatModule1768745939760'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "conversation" ("id" SERIAL NOT NULL, "lastMessage" character varying, "lastMessageAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "buyerId" integer NOT NULL, "vendorId" integer NOT NULL, "productId" integer, CONSTRAINT "PK_864528ec4274360a40f66c29845" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_05122673ca1395257fb71e90f8" ON "conversation" ("buyerId", "vendorId", "productId") `);
        await queryRunner.query(`CREATE TABLE "message" ("id" SERIAL NOT NULL, "content" text NOT NULL, "readAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "conversationId" integer, "senderId" integer NOT NULL, CONSTRAINT "PK_ba01f0a3e0123651915008bc578" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "cart_item" ADD "attributes" jsonb NOT NULL DEFAULT '{}'`);
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
        await queryRunner.query(`ALTER TABLE "conversation" ADD CONSTRAINT "FK_4ca3d8a73b4ef8519ff4c3de8a7" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversation" ADD CONSTRAINT "FK_b13072faa2e7e7e6c2674066277" FOREIGN KEY ("vendorId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversation" ADD CONSTRAINT "FK_85c39e2d694cd46df2c78576072" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "FK_7cf4a4df1f2627f72bf6231635f" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "FK_bc096b4e18b1f9508197cd98066" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_bc096b4e18b1f9508197cd98066"`);
        await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_7cf4a4df1f2627f72bf6231635f"`);
        await queryRunner.query(`ALTER TABLE "conversation" DROP CONSTRAINT "FK_85c39e2d694cd46df2c78576072"`);
        await queryRunner.query(`ALTER TABLE "conversation" DROP CONSTRAINT "FK_b13072faa2e7e7e6c2674066277"`);
        await queryRunner.query(`ALTER TABLE "conversation" DROP CONSTRAINT "FK_4ca3d8a73b4ef8519ff4c3de8a7"`);
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
        await queryRunner.query(`ALTER TABLE "cart_item" DROP COLUMN "attributes"`);
        await queryRunner.query(`DROP TABLE "message"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_05122673ca1395257fb71e90f8"`);
        await queryRunner.query(`DROP TABLE "conversation"`);
    }

}
