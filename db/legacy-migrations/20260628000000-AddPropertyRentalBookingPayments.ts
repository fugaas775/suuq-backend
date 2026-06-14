import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `payments` instalment ledger (jsonb) to property rental bookings so
 * partial rent payments can be recorded on an OPEN booking before move-out.
 * The cumulative total lives on the existing `paidAmount` column.
 */
export class AddPropertyRentalBookingPayments20260628000000
  implements MigrationInterface
{
  name = 'AddPropertyRentalBookingPayments20260628000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_property_rental_bookings" ADD COLUMN IF NOT EXISTS "payments" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_property_rental_bookings" DROP COLUMN IF EXISTS "payments"`,
    );
  }
}
