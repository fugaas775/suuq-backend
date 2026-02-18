import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryAttemptCountFallback1770730000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add deliveryAttemptCount if it doesn't exist
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deliveryAttemptCount" integer DEFAULT 0`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // We don't want to drop it in down usually, but for completeness:
    // await queryRunner.query(`ALTER TABLE "order" DROP COLUMN IF EXISTS "deliveryAttemptCount"`);
  }
}
