import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserReport1767280803680 implements MigrationInterface {
  name = 'CreateUserReport1767280803680';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "wallet" ("id" SERIAL NOT NULL, "balance" numeric(10,2) NOT NULL DEFAULT '0', "currency" character varying NOT NULL DEFAULT 'KES', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, CONSTRAINT "REL_35472b1fe48b6330cd34970956" UNIQUE ("userId"), CONSTRAINT "PK_bec464dd8d54c39c54fd32e2334" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."wallet_transaction_type_enum" AS ENUM('EARNING', 'PAYOUT', 'REFUND', 'ADJUSTMENT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "wallet_transaction" ("id" SERIAL NOT NULL, "type" "public"."wallet_transaction_type_enum" NOT NULL, "amount" numeric(10,2) NOT NULL, "orderId" integer, "description" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "walletId" integer, CONSTRAINT "PK_62a01b9c3a734b96a08c621b371" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_report" ("id" SERIAL NOT NULL, "reason" character varying NOT NULL, "details" text, "status" character varying NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "reporterId" integer NOT NULL, "productId" integer NOT NULL, CONSTRAINT "PK_58c08f0e20fa66561b119421eb2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_142ad20f8e4e5385b548940b62" ON "user_report" ("reporterId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_58bbb26043e19510876a579390" ON "user_report" ("productId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD "original_creator_contact" json`,
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
      `ALTER TABLE "wallet" ADD CONSTRAINT "FK_35472b1fe48b6330cd349709564" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transaction" ADD CONSTRAINT "FK_07de5136ba8e92bb97d45b9a7af" FOREIGN KEY ("walletId") REFERENCES "wallet"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_report" ADD CONSTRAINT "FK_142ad20f8e4e5385b548940b62c" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_report" ADD CONSTRAINT "FK_58bbb26043e19510876a5793900" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_report" DROP CONSTRAINT "FK_58bbb26043e19510876a5793900"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_report" DROP CONSTRAINT "FK_142ad20f8e4e5385b548940b62c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transaction" DROP CONSTRAINT "FK_07de5136ba8e92bb97d45b9a7af"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet" DROP CONSTRAINT "FK_35472b1fe48b6330cd349709564"`,
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
      `ALTER TABLE "product" DROP COLUMN "original_creator_contact"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_58bbb26043e19510876a579390"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_142ad20f8e4e5385b548940b62"`,
    );
    await queryRunner.query(`DROP TABLE "user_report"`);
    await queryRunner.query(`DROP TABLE "wallet_transaction"`);
    await queryRunner.query(
      `DROP TYPE "public"."wallet_transaction_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE "wallet"`);
  }
}
