import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stamps the branch's tax rate onto each property booking when it is opened, so
 * the ledger can split rent into revenue and tax payable.
 *
 * A lease is not a point-in-time sale. Cash is deferred when an instalment is
 * paid, recognized in slices by the daily accrual job, and the remainder cleared
 * at move-out — three postings, months apart, that all have to agree on how much
 * of the money was tax. Reading the branch's CURRENT rate at each of them would
 * break that the moment an owner touches the toggle mid-lease: rent deferred at
 * 0% and recognized at 15% would move less out of deferred revenue than went in,
 * stranding the difference on the balance sheet permanently. A rate stamped once
 * at lease inception is both self-consistent and the right answer — the lease was
 * contracted under that rate.
 *
 * DEFAULT 0, deliberately not the branch's 15%. Every booking that already
 * exists was deferred, recognized and settled with no tax split at all, and its
 * posted history has to keep balancing. A zero rate reproduces exactly today's
 * arithmetic, so this migration changes no existing booking and no existing
 * journal entry. Only bookings opened after the deploy carry a real rate.
 *
 * The hotel side needs no equivalent: a folio posts once, at settlement, so the
 * live branch rate at that instant is both correct and self-consistent.
 *
 * Mirrored into db/baseline/schema.sql so fresh environments bootstrap with it.
 */
export class AddPropertyBookingTaxRate20260809000100
  implements MigrationInterface
{
  name = 'AddPropertyBookingTaxRate20260809000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_property_rental_bookings" ADD COLUMN IF NOT EXISTS "taxRate" numeric(5,4) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_property_rental_bookings" DROP COLUMN IF EXISTS "taxRate"`,
    );
  }
}
