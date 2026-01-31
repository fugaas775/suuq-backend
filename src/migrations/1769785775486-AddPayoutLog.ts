import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayoutLog1769785775486 implements MigrationInterface {
  name = 'AddPayoutLog1769785775486';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."payout_log_provider_enum" AS ENUM('EBIRR', 'MPESA', 'TELEBIRR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payout_log_status_enum" AS ENUM('PENDING', 'SUCCESS', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payout_log" ("id" SERIAL NOT NULL, "provider" "public"."payout_log_provider_enum" NOT NULL DEFAULT 'EBIRR', "amount" numeric(10,2) NOT NULL, "currency" character varying(3) NOT NULL, "phoneNumber" character varying NOT NULL, "transactionReference" character varying NOT NULL, "orderId" integer, "orderItemId" integer, "status" "public"."payout_log_status_enum" NOT NULL DEFAULT 'SUCCESS', "failureReason" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "vendorId" integer, CONSTRAINT "PK_d0326ceb2bec65a7114e7cd9e5c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9af208dc3f34e4bd254c38057d" ON "payout_log" ("vendorId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "commissionRate" SET DEFAULT '0.05'`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ALTER COLUMN "attributes" SET DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."product_request_offer_status_enum" RENAME TO "product_request_offer_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_request_offer_status_enum" AS ENUM('SENT', 'SEEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request_offer" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request_offer" ALTER COLUMN "status" TYPE "public"."product_request_offer_status_enum" USING "status"::"text"::"public"."product_request_offer_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request_offer" ALTER COLUMN "status" SET DEFAULT 'SENT'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."product_request_offer_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."product_request_condition_enum" RENAME TO "product_request_condition_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_request_condition_enum" AS ENUM('ANY', 'NEW', 'USED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "condition" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "condition" TYPE "public"."product_request_condition_enum" USING "condition"::"text"::"public"."product_request_condition_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "condition" SET DEFAULT 'ANY'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."product_request_condition_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."product_request_urgency_enum" RENAME TO "product_request_urgency_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_request_urgency_enum" AS ENUM('FLEXIBLE', 'THIS_WEEK', 'IMMEDIATE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "urgency" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "urgency" TYPE "public"."product_request_urgency_enum" USING "urgency"::"text"::"public"."product_request_urgency_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "urgency" SET DEFAULT 'FLEXIBLE'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."product_request_urgency_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."product_request_status_enum" RENAME TO "product_request_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_request_status_enum" AS ENUM('OPEN', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "status" TYPE "public"."product_request_status_enum" USING "status"::"text"::"public"."product_request_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "status" SET DEFAULT 'OPEN'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."product_request_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_outreach_task" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "payout_log" ADD CONSTRAINT "FK_9af208dc3f34e4bd254c38057d8" FOREIGN KEY ("vendorId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payout_log" DROP CONSTRAINT "FK_9af208dc3f34e4bd254c38057d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supply_outreach_task" ALTER COLUMN "payload" SET DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "metadata" SET DEFAULT '{}'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_request_status_enum_old" AS ENUM('OPEN', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "status" TYPE "public"."product_request_status_enum_old" USING "status"::"text"::"public"."product_request_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "status" SET DEFAULT 'OPEN'`,
    );
    await queryRunner.query(`DROP TYPE "public"."product_request_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."product_request_status_enum_old" RENAME TO "product_request_status_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_request_urgency_enum_old" AS ENUM('FLEXIBLE', 'THIS_WEEK', 'IMMEDIATE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "urgency" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "urgency" TYPE "public"."product_request_urgency_enum_old" USING "urgency"::"text"::"public"."product_request_urgency_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "urgency" SET DEFAULT 'FLEXIBLE'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."product_request_urgency_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."product_request_urgency_enum_old" RENAME TO "product_request_urgency_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_request_condition_enum_old" AS ENUM('ANY', 'NEW', 'USED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "condition" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "condition" TYPE "public"."product_request_condition_enum_old" USING "condition"::"text"::"public"."product_request_condition_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request" ALTER COLUMN "condition" SET DEFAULT 'ANY'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."product_request_condition_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."product_request_condition_enum_old" RENAME TO "product_request_condition_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_request_offer_status_enum_old" AS ENUM('SENT', 'SEEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request_offer" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request_offer" ALTER COLUMN "status" TYPE "public"."product_request_offer_status_enum_old" USING "status"::"text"::"public"."product_request_offer_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_request_offer" ALTER COLUMN "status" SET DEFAULT 'SENT'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."product_request_offer_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."product_request_offer_status_enum_old" RENAME TO "product_request_offer_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ALTER COLUMN "attributes" SET DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "commissionRate" SET DEFAULT 0.05`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9af208dc3f34e4bd254c38057d"`,
    );
    await queryRunner.query(`DROP TABLE "payout_log"`);
    await queryRunner.query(`DROP TYPE "public"."payout_log_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payout_log_provider_enum"`);
  }
}
