import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `payments` instalment ledger (jsonb) to hotel folios so partial
 * payments can be recorded against an OPEN folio before check-out.
 *
 * Until now a HOTEL partial payment never reached the backend at all: the only
 * write path was settleFolio, which unconditionally flips the folio to SETTLED
 * (the Muntaha Room 210 incident), so the frontend deliberately skipped it on the
 * partial branch. That left `paidAmount` wrong across instalments and — because
 * settleFolio books `receivable = recognised - paid` — posted phantom accounts
 * receivable equal to every earlier instalment on each instalment-settled folio.
 *
 * The ledger (rather than a bare accrual) is what makes recordPayment idempotent:
 * a retried call is recognised by its idempotencyKey already being in `payments`.
 *
 * Mirrors pos_property_rental_bookings.payments, which solves the same problem
 * for the sibling format. Additive and nullable — safe to deploy ahead of the
 * endpoint that writes it.
 */
export class AddHotelFolioPayments20260802000000 implements MigrationInterface {
  name = 'AddHotelFolioPayments20260802000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_hotel_folios" ADD COLUMN IF NOT EXISTS "payments" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_hotel_folios" DROP COLUMN IF EXISTS "payments"`,
    );
  }
}
