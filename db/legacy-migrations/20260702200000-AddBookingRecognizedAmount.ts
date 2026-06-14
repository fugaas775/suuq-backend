import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingRecognizedAmount20260702200000
  implements MigrationInterface
{
  name = 'AddBookingRecognizedAmount20260702200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_property_rental_bookings" ADD COLUMN IF NOT EXISTS "recognizedAmount" numeric(14,2) NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_property_rental_bookings" DROP COLUMN IF EXISTS "recognizedAmount"`,
    );
  }
}
