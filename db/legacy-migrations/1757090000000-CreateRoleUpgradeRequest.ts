import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoleUpgradeRequest1757090000000
  implements MigrationInterface
{
  name = 'CreateRoleUpgradeRequest1757090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for status
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_upgrade_status_enum') THEN CREATE TYPE role_upgrade_status_enum AS ENUM ('PENDING','APPROVED','REJECTED'); END IF; END $$;`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS role_upgrade_request (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        roles TEXT[] NOT NULL,
        country VARCHAR(2),
        "phoneCountryCode" VARCHAR(10),
        "phoneNumber" VARCHAR(20),
        "storeName" VARCHAR(255),
        "businessLicenseNumber" VARCHAR(128),
        documents JSONB DEFAULT '[]',
        status role_upgrade_status_enum NOT NULL DEFAULT 'PENDING',
        "decisionReason" TEXT,
        "decidedBy" VARCHAR(255),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_role_upgrade_request_user ON role_upgrade_request(user_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_role_upgrade_request_user;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS role_upgrade_request;`);
    // drop enum type if no longer used
    await queryRunner.query(
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_upgrade_status_enum') THEN DROP TYPE role_upgrade_status_enum; END IF; END $$;`,
    );
  }
}
