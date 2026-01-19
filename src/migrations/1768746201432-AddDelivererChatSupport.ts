import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDelivererChatSupport1768746201432 implements MigrationInterface {
    name = 'AddDelivererChatSupport1768746201432'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_05122673ca1395257fb71e90f8"`);
        await queryRunner.query(`ALTER TABLE "conversation" ADD "delivererId" integer`);
        await queryRunner.query(`ALTER TABLE "conversation" ADD "orderId" integer`);
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
        await queryRunner.query(`ALTER TABLE "conversation" DROP CONSTRAINT "FK_4ca3d8a73b4ef8519ff4c3de8a7"`);
        await queryRunner.query(`ALTER TABLE "conversation" DROP CONSTRAINT "FK_b13072faa2e7e7e6c2674066277"`);
        await queryRunner.query(`ALTER TABLE "conversation" ALTER COLUMN "buyerId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "conversation" ALTER COLUMN "vendorId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "supply_outreach_task" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_77ae7d03d8bf7792870aedaf09" ON "conversation" ("vendorId", "delivererId", "orderId") WHERE "orderId" IS NOT NULL AND "vendorId" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_30cf5ad1c7b5543a9347ebd48c" ON "conversation" ("buyerId", "delivererId", "orderId") WHERE "orderId" IS NOT NULL AND "buyerId" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_034c9d2a2b28cf101fe675b8e8" ON "conversation" ("buyerId", "vendorId", "productId") WHERE "productId" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "conversation" ADD CONSTRAINT "FK_4ca3d8a73b4ef8519ff4c3de8a7" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversation" ADD CONSTRAINT "FK_b13072faa2e7e7e6c2674066277" FOREIGN KEY ("vendorId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversation" ADD CONSTRAINT "FK_a9d6f5e62c7f7d560b0d10e31f0" FOREIGN KEY ("delivererId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversation" ADD CONSTRAINT "FK_50b0d958b00eb89e45af69c6a58" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "conversation" DROP CONSTRAINT "FK_50b0d958b00eb89e45af69c6a58"`);
        await queryRunner.query(`ALTER TABLE "conversation" DROP CONSTRAINT "FK_a9d6f5e62c7f7d560b0d10e31f0"`);
        await queryRunner.query(`ALTER TABLE "conversation" DROP CONSTRAINT "FK_b13072faa2e7e7e6c2674066277"`);
        await queryRunner.query(`ALTER TABLE "conversation" DROP CONSTRAINT "FK_4ca3d8a73b4ef8519ff4c3de8a7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_034c9d2a2b28cf101fe675b8e8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_30cf5ad1c7b5543a9347ebd48c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_77ae7d03d8bf7792870aedaf09"`);
        await queryRunner.query(`ALTER TABLE "supply_outreach_task" ALTER COLUMN "payload" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "conversation" ALTER COLUMN "vendorId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "conversation" ALTER COLUMN "buyerId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "conversation" ADD CONSTRAINT "FK_b13072faa2e7e7e6c2674066277" FOREIGN KEY ("vendorId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversation" ADD CONSTRAINT "FK_4ca3d8a73b4ef8519ff4c3de8a7" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
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
        await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "orderId"`);
        await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "delivererId"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_05122673ca1395257fb71e90f8" ON "conversation" ("buyerId", "vendorId", "productId") `);
    }

}
