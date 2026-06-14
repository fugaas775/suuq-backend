import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryAttentionNotificationStateToOrder1773145200000
  implements MigrationInterface
{
  name = 'AddDeliveryAttentionNotificationStateToOrder1773145200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deliveryAttentionNotificationState" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "deliveryAttentionNotificationState"`,
    );
  }
}
