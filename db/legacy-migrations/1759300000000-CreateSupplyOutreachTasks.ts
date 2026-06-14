import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupplyOutreachTasks1759300000000
  implements MigrationInterface
{
  name = 'CreateSupplyOutreachTasks1759300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supply_outreach_status_enum') THEN
          CREATE TYPE supply_outreach_status_enum AS ENUM ('PENDING','ASSIGNED','COMPLETED','CANCELLED');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supply_outreach_task (
        id SERIAL PRIMARY KEY,
        term VARCHAR(180) NOT NULL,
        status supply_outreach_status_enum NOT NULL DEFAULT 'PENDING',
        request_ids INTEGER[] NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0,
        payload JSONB DEFAULT '{}'::jsonb,
        note TEXT NULL,
        created_by_admin_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        assigned_vendor_id INTEGER NULL REFERENCES "user"(id) ON DELETE SET NULL,
        assigned_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_supply_outreach_status ON supply_outreach_task(status);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_supply_outreach_created ON supply_outreach_task(created_by_admin_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_supply_outreach_assigned ON supply_outreach_task(assigned_vendor_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_supply_outreach_assigned;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_supply_outreach_created;`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supply_outreach_status;`);
    await queryRunner.query(`DROP TABLE IF EXISTS supply_outreach_task;`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supply_outreach_status_enum') THEN
          DROP TYPE supply_outreach_status_enum;
        END IF;
      END $$;
    `);
  }
}
