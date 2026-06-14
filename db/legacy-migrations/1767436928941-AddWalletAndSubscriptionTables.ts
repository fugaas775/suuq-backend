import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletAndSubscriptionTables1767436928941
  implements MigrationInterface
{
  name = 'AddWalletAndSubscriptionTables1767436928941';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."top_up_request_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "top_up_request" ("id" SERIAL NOT NULL, "amount" numeric(10,2) NOT NULL, "method" character varying NOT NULL, "reference" character varying NOT NULL, "status" "public"."top_up_request_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, CONSTRAINT "PK_33c2d93fdc33054a3967f32fba3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."subscription_request_requestedtier_enum" AS ENUM('free', 'pro')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."subscription_request_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "subscription_request" ("id" SERIAL NOT NULL, "method" character varying NOT NULL, "reference" character varying, "requestedTier" "public"."subscription_request_requestedtier_enum" NOT NULL, "status" "public"."subscription_request_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, CONSTRAINT "PK_f65b2f436177ee123dfd199c493" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ALTER COLUMN "attributes" SET DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."wallet_transaction_type_enum" RENAME TO "wallet_transaction_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."wallet_transaction_type_enum" AS ENUM('EARNING', 'PAYOUT', 'REFUND', 'ADJUSTMENT', 'DEPOSIT', 'PAYMENT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transaction" ALTER COLUMN "type" TYPE "public"."wallet_transaction_type_enum" USING "type"::"text"::"public"."wallet_transaction_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."wallet_transaction_type_enum_old"`,
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
      `ALTER TABLE "top_up_request" ADD CONSTRAINT "FK_d720160633c094e8073b383f934" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_request" ADD CONSTRAINT "FK_4793d9b49ec86c4f1140c3dcaa6" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_request" DROP CONSTRAINT "FK_4793d9b49ec86c4f1140c3dcaa6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "top_up_request" DROP CONSTRAINT "FK_d720160633c094e8073b383f934"`,
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
      `CREATE TYPE "public"."wallet_transaction_type_enum_old" AS ENUM('EARNING', 'PAYOUT', 'REFUND', 'ADJUSTMENT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transaction" ALTER COLUMN "type" TYPE "public"."wallet_transaction_type_enum_old" USING "type"::"text"::"public"."wallet_transaction_type_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."wallet_transaction_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."wallet_transaction_type_enum_old" RENAME TO "wallet_transaction_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ALTER COLUMN "attributes" SET DEFAULT '{}'`,
    );
    await queryRunner.query(`DROP TABLE "subscription_request"`);
    await queryRunner.query(
      `DROP TYPE "public"."subscription_request_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."subscription_request_requestedtier_enum"`,
    );
    await queryRunner.query(`DROP TABLE "top_up_request"`);
    await queryRunner.query(`DROP TYPE "public"."top_up_request_status_enum"`);
  }
}
