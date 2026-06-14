import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTranslations1767772274029 implements MigrationInterface {
  name = 'AddTranslations1767772274029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category" ADD "nameTranslations" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "country" ADD "nameTranslations" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "country" ADD "descriptionTranslations" jsonb`,
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
      `ALTER TABLE "country" DROP COLUMN "descriptionTranslations"`,
    );
    await queryRunner.query(
      `ALTER TABLE "country" DROP COLUMN "nameTranslations"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" DROP COLUMN "nameTranslations"`,
    );
  }
}
