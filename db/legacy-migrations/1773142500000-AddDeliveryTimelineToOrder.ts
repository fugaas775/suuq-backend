import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryTimelineToOrder1773142500000
  implements MigrationInterface
{
  name = 'AddDeliveryTimelineToOrder1773142500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deliveryAssignedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "outForDeliveryAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deliveryResolvedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "deliveryResolvedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "outForDeliveryAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "deliveryAssignedAt"`,
    );
  }
}
