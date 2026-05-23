import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendHotelReservationConsumer_20260624000000
  implements MigrationInterface
{
  name = 'ExtendHotelReservationConsumer_20260624000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pos_hotel_reservations"
        ADD COLUMN IF NOT EXISTS "source"            VARCHAR(32)  NOT NULL DEFAULT 'POS',
        ADD COLUMN IF NOT EXISTS "customerUserId"    INT          NULL,
        ADD COLUMN IF NOT EXISTS "paymentSessionId"  VARCHAR(128) NULL,
        ADD COLUMN IF NOT EXISTS "prepaymentStatus"  VARCHAR(24)  NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_hotel_res_customer"
        ON "pos_hotel_reservations" ("customerUserId")
        WHERE "customerUserId" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_hotel_res_source"
        ON "pos_hotel_reservations" ("source");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_pos_hotel_res_customer"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pos_hotel_res_source"`);
    await queryRunner.query(`
      ALTER TABLE "pos_hotel_reservations"
        DROP COLUMN IF EXISTS "source",
        DROP COLUMN IF EXISTS "customerUserId",
        DROP COLUMN IF EXISTS "paymentSessionId",
        DROP COLUMN IF EXISTS "prepaymentStatus";
    `);
  }
}
