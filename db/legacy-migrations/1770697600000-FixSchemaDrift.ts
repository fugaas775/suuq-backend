import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSchemaDrift1770697600000 implements MigrationInterface {
  name = 'FixSchemaDrift1770697600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add flaggedForReview to User
    // Use raw SQL to handle existence check
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "flaggedForReview" boolean DEFAULT false`,
    );

    // 2. Add deliveryCount to Order
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deliveryAttemptCount" integer DEFAULT 0`,
    );

    // 3. Add DISPUTED status
    try {
      // Postgres 12+ supports IF NOT EXISTS
      await queryRunner.query(
        `ALTER TYPE "public"."order_status_enum" ADD VALUE IF NOT EXISTS 'DISPUTED'`,
      );
    } catch {
      // Fallback for older PG: check if value exists
      // But typically this just throws if exists and doesn't support IF NOT EXISTS
    }

    // 4. Create Dispute Table if not exists
    const hasDisputeTable = await queryRunner.hasTable('dispute');
    if (!hasDisputeTable) {
      // Create ENUM
      try {
        await queryRunner.query(
          `CREATE TYPE "public"."dispute_status_enum" AS ENUM('OPEN', 'RESOLVED', 'REFUNDED')`,
        );
      } catch {
        // ignore if exists
      } // specific catch

      await queryRunner.query(
        `CREATE TABLE "dispute" (
            "id" SERIAL NOT NULL, 
            "orderId" integer NOT NULL, 
            "reason" character varying NOT NULL, 
            "details" text, 
            "status" "public"."dispute_status_enum" NOT NULL DEFAULT 'OPEN', 
            "resolutionNotes" character varying, 
            "resolvedBy" integer, 
            "resolvedAt" TIMESTAMP, 
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), 
            CONSTRAINT "REL_dispute_order" UNIQUE ("orderId"), 
            CONSTRAINT "PK_dispute_id" PRIMARY KEY ("id")
          )`,
      );
      await queryRunner.query(
        `ALTER TABLE "dispute" ADD CONSTRAINT "FK_dispute_order" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Partial rollback
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "deliveryAttemptCount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "flaggedForReview"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "dispute"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."dispute_status_enum"`,
    );
  }
}
