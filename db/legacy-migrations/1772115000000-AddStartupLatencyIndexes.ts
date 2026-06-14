import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStartupLatencyIndexes1772115000000
  implements MigrationInterface
{
  name = 'AddStartupLatencyIndexes1772115000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notification_recipient_created_at" ON "notification" ("recipientId", "createdAt" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notification_recipient_unread" ON "notification" ("recipientId") WHERE "isRead" = false`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_flash_sale_active_window" ON "flash_sale" ("isActive", "startTime", "endTime")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_flash_sale_active_window"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_notification_recipient_unread"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_notification_recipient_created_at"`,
    );
  }
}
