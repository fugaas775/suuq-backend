import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryFailureReasonToOrder1773139500000
  implements MigrationInterface
{
  name = 'AddDeliveryFailureReasonToOrder1773139500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deliveryFailureReasonCode" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deliveryFailureNotes" character varying(1024)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "deliveryFailureNotes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN IF EXISTS "deliveryFailureReasonCode"`,
    );
  }
}
