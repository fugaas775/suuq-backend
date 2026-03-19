import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFulfillmentBranchToOrders1773302000000
  implements MigrationInterface
{
  name = 'AddFulfillmentBranchToOrders1773302000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "fulfillmentBranchId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "onlineReservationReleasedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_fulfillment_branch" ON "order" ("fulfillmentBranchId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_order_fulfillment_branch" FOREIGN KEY ("fulfillmentBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT IF EXISTS "FK_order_fulfillment_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_order_fulfillment_branch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "onlineReservationReleasedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "fulfillmentBranchId"`,
    );
  }
}
