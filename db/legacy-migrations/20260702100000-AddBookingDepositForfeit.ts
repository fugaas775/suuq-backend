import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingDepositForfeit20260702100000
  implements MigrationInterface
{
  name = 'AddBookingDepositForfeit20260702100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_property_rental_bookings" ADD COLUMN IF NOT EXISTS "depositForfeit" numeric(14,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_property_rental_bookings" DROP COLUMN IF EXISTS "depositForfeit"`,
    );
  }
}
