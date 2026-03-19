import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosSyncFailedEntries1773208000000
  implements MigrationInterface
{
  name = 'AddPosSyncFailedEntries1773208000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_sync_jobs" ADD COLUMN IF NOT EXISTS "failedEntries" jsonb DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_sync_jobs" DROP COLUMN IF EXISTS "failedEntries"`,
    );
  }
}
