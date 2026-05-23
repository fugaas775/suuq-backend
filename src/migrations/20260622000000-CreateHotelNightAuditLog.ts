import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHotelNightAuditLog20260622000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pos_hotel_night_audit_logs (
        id                   BIGSERIAL PRIMARY KEY,
        "branchId"           BIGINT        NOT NULL,
        "auditDate"          VARCHAR(10)   NOT NULL,
        "foliosProcessed"    INT           NOT NULL DEFAULT 0,
        "chargesPosted"      INT           NOT NULL DEFAULT 0,
        "totalAmount"        NUMERIC(14,2) NOT NULL DEFAULT 0,
        currency             VARCHAR(8)    NOT NULL DEFAULT 'ETB',
        "triggeredByUserId"  BIGINT,
        "createdAt"          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_hotel_night_audit_branch_date
        ON pos_hotel_night_audit_logs ("branchId", "auditDate");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS pos_hotel_night_audit_logs;');
  }
}
