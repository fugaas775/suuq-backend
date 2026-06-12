import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * pos_suspended_carts.createdAt / updatedAt were `timestamp` (WITHOUT time zone),
 * populated by the column's DB `now()` default. The Node process runs in EAT
 * (UTC+3), so node-postgres parses those naive values back as local time, shifting
 * them ~3 hours early — e.g. a folio actually created at 08:48Z came back as 05:48Z.
 * That tripped the hotel-room "early check-in" elapsed badge (createdAt fell before
 * the 11:00-EAT anchor), so a folio opened minutes ago showed ~3h.
 *
 * Register sessions are unaffected because `openedAt` is written as a JS Date, not
 * via a DB default — so it round-trips through the same EAT process tz correctly.
 *
 * Fix: convert both columns to timezone-aware `timestamptz`, which stores/returns
 * absolute instants regardless of the process timezone. Existing naive values were
 * stored as UTC wall-clock (the DB `now()` ran with the session tz = UTC), so we tag
 * them `AT TIME ZONE 'UTC'` to recover their true instants.
 */
export class FixSuspendedCartCreatedAtTimezone20260703000000
  implements MigrationInterface
{
  name = 'FixSuspendedCartCreatedAtTimezone20260703000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_suspended_carts" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_suspended_carts" ALTER COLUMN "updatedAt" TYPE timestamptz USING "updatedAt" AT TIME ZONE 'UTC'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_suspended_carts" ALTER COLUMN "createdAt" TYPE timestamp USING "createdAt" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_suspended_carts" ALTER COLUMN "updatedAt" TYPE timestamp USING "updatedAt" AT TIME ZONE 'UTC'`,
    );
  }
}
