import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCascadeDeleteToProductRelations1769437572015
  implements MigrationInterface
{
  name = 'AddCascadeDeleteToProductRelations1769437572015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "review" DROP CONSTRAINT "FK_2a11d3c0ea1b2b5b1790f762b9a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_item" DROP CONSTRAINT "FK_75db0de134fe0f9fe9e4591b7bf"`,
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
      `ALTER TABLE "review" ADD CONSTRAINT "FK_2a11d3c0ea1b2b5b1790f762b9a" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_item" ADD CONSTRAINT "FK_75db0de134fe0f9fe9e4591b7bf" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cart_item" DROP CONSTRAINT "FK_75db0de134fe0f9fe9e4591b7bf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" DROP CONSTRAINT "FK_2a11d3c0ea1b2b5b1790f762b9a"`,
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
      `ALTER TABLE "cart_item" ADD CONSTRAINT "FK_75db0de134fe0f9fe9e4591b7bf" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" ADD CONSTRAINT "FK_2a11d3c0ea1b2b5b1790f762b9a" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
