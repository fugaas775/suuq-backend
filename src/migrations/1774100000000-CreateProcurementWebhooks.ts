import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProcurementWebhooks1774100000000
  implements MigrationInterface
{
  name = 'CreateProcurementWebhooks1774100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "procurement_webhook_subscriptions_status_enum" AS ENUM ('ACTIVE', 'PAUSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "procurement_webhook_subscriptions_lastdeliverystatus_enum" AS ENUM ('SUCCEEDED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "procurement_webhook_deliveries_eventtype_enum" AS ENUM ('PROCUREMENT_INTERVENTION_UPDATED', 'PROCUREMENT_PURCHASE_ORDER_UPDATED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "procurement_webhook_deliveries_status_enum" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "procurement_webhook_subscriptions" (
        "id" SERIAL NOT NULL,
        "name" character varying(255) NOT NULL,
        "endpointUrl" character varying(1000) NOT NULL,
        "signingSecret" character varying(255) NOT NULL,
        "eventTypes" text NOT NULL DEFAULT '',
        "status" "procurement_webhook_subscriptions_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "branchId" integer,
        "supplierProfileId" integer,
        "metadata" jsonb,
        "lastDeliveredAt" TIMESTAMP,
        "lastDeliveryStatus" "procurement_webhook_subscriptions_lastdeliverystatus_enum",
        "createdByUserId" integer,
        "updatedByUserId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_procurement_webhook_subscriptions_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "procurement_webhook_deliveries" (
        "id" SERIAL NOT NULL,
        "subscriptionId" integer NOT NULL,
        "eventType" "procurement_webhook_deliveries_eventtype_enum" NOT NULL,
        "eventKey" character varying(255) NOT NULL,
        "requestUrl" character varying(1000) NOT NULL,
        "requestHeaders" jsonb NOT NULL,
        "requestBody" jsonb NOT NULL,
        "branchId" integer,
        "supplierProfileId" integer,
        "purchaseOrderId" integer,
        "status" "procurement_webhook_deliveries_status_enum" NOT NULL DEFAULT 'PENDING',
        "attemptCount" integer NOT NULL DEFAULT 1,
        "responseStatus" integer,
        "responseBody" text,
        "errorMessage" text,
        "durationMs" integer,
        "deliveredAt" TIMESTAMP,
        "replayedFromDeliveryId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_procurement_webhook_deliveries_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_procurement_webhook_subscriptions_status" ON "procurement_webhook_subscriptions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_procurement_webhook_subscriptions_branch" ON "procurement_webhook_subscriptions" ("branchId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_procurement_webhook_subscriptions_supplier" ON "procurement_webhook_subscriptions" ("supplierProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_procurement_webhook_deliveries_subscription" ON "procurement_webhook_deliveries" ("subscriptionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_procurement_webhook_deliveries_status" ON "procurement_webhook_deliveries" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_procurement_webhook_deliveries_event" ON "procurement_webhook_deliveries" ("eventType")`,
    );
    await queryRunner.query(
      `ALTER TABLE "procurement_webhook_subscriptions" ADD CONSTRAINT "FK_procurement_webhook_subscriptions_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "procurement_webhook_subscriptions" ADD CONSTRAINT "FK_procurement_webhook_subscriptions_supplier" FOREIGN KEY ("supplierProfileId") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "procurement_webhook_deliveries" ADD CONSTRAINT "FK_procurement_webhook_deliveries_subscription" FOREIGN KEY ("subscriptionId") REFERENCES "procurement_webhook_subscriptions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "procurement_webhook_deliveries" DROP CONSTRAINT "FK_procurement_webhook_deliveries_subscription"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procurement_webhook_subscriptions" DROP CONSTRAINT "FK_procurement_webhook_subscriptions_supplier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procurement_webhook_subscriptions" DROP CONSTRAINT "FK_procurement_webhook_subscriptions_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_procurement_webhook_deliveries_event"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_procurement_webhook_deliveries_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_procurement_webhook_deliveries_subscription"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_procurement_webhook_subscriptions_supplier"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_procurement_webhook_subscriptions_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_procurement_webhook_subscriptions_status"`,
    );
    await queryRunner.query(`DROP TABLE "procurement_webhook_deliveries"`);
    await queryRunner.query(`DROP TABLE "procurement_webhook_subscriptions"`);
    await queryRunner.query(
      `DROP TYPE "procurement_webhook_deliveries_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "procurement_webhook_deliveries_eventtype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "procurement_webhook_subscriptions_lastdeliverystatus_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "procurement_webhook_subscriptions_status_enum"`,
    );
  }
}
