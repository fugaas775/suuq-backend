import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns "six free months from signup" into "free until 31 December 2026, one
 * workspace per account".
 *
 * Three things happen here, in this order:
 *
 *  1. `account_free_workspace_grants` is created — the record of which accounts
 *     have spent their one free workspace. It hangs off the USER rather than the
 *     branch so deleting the free branch does not hand out a second free one.
 *  2. Every account already holding a free POS branch is back-filled a grant, so
 *     the rule applies to them from today rather than only to new signups. The
 *     earliest free branch wins when an account somehow has more than one.
 *  3. Every live or lapsed free-period row is moved to the new deadline. Trials
 *     running today were sold as six months and would have ended in February
 *     2027; the promotion replaces that with one date for everybody. The
 *     fortnight-long trials from before the six-month change, already expired
 *     and locked out, are reopened to the same date — they were part of the same
 *     promise and there is nothing to be gained by leaving them shut.
 *
 * Paid subscriptions are not touched. A row that converted to a paid plan keeps
 * its paid end date; only its grant is back-filled, because the account did
 * spend its free workspace even though it later paid.
 */
export class OneFreeWorkspacePerAccount20260821160000
  implements MigrationInterface
{
  name = 'OneFreeWorkspacePerAccount20260821160000';

  /**
   * Must match FREE_PERIOD_ENDS_AT_DEFAULT in
   * src/free-workspace/free-period.policy.ts.
   *
   * Passed as a bound Date rather than an SQL literal so the driver serialises
   * it exactly the way the running app does. `tenant_subscriptions.endsAt` is a
   * naive `timestamp`: a literal cast under a session timezone that differs
   * from the Node process's would leave migrated rows three hours out of step
   * with rows the app writes afterwards.
   */
  private readonly freePeriodEndsAt = new Date('2026-12-31T23:59:59.999+03:00');

  private readonly posFreePlanCodes = [
    'POS_BRANCH_FREE_2026',
    'POS_BRANCH_TRIAL_6M',
    'POS_BRANCH_TRIAL_14D',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "account_free_workspace_grants" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "kind" character varying(16) NOT NULL,
        "branchId" integer,
        "retailTenantId" integer,
        "supplierProfileId" integer,
        "planCode" character varying(64) NOT NULL,
        "endsAt" TIMESTAMP WITH TIME ZONE,
        "grantedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "releasedAt" TIMESTAMP WITH TIME ZONE,
        "releasedReason" character varying(255),
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_account_free_workspace_grants" PRIMARY KEY ("id")
      )
    `);

    // CASCADE on userId only. branchId / retailTenantId / supplierProfileId
    // carry no foreign key on purpose: the whole point of the row is to outlive
    // the workspace it was spent on.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_account_free_workspace_grants_user'
        ) THEN
          ALTER TABLE "account_free_workspace_grants"
            ADD CONSTRAINT "FK_account_free_workspace_grants_user"
            FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_free_workspace_grants_user"
        ON "account_free_workspace_grants" ("userId")
    `);

    // Partial: one LIVE grant per account, with released ones kept for history.
    // This index is what actually enforces "one free workspace per account" —
    // FreeWorkspaceGrantService inserts ON CONFLICT DO NOTHING against it, so
    // two simultaneous signups cannot both win the slot.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_free_workspace_grants_active_user"
        ON "account_free_workspace_grants" ("userId")
        WHERE "releasedAt" IS NULL
    `);

    // Back-fill: every account that already holds a free POS branch has spent
    // its slot. `metadata->>'source'` catches the rows that have since been
    // converted to a paid plan — conversion overwrites planCode but merges the
    // old metadata forward, so the marker survives.
    //
    // The owner is the tenant's owner, falling back to the branch's: a branch
    // can be owned by someone other than the tenant owner (see the
    // vendorId/ownerId split), and either one identifies the account that was
    // given the workspace.
    await queryRunner.query(
      `
      INSERT INTO "account_free_workspace_grants"
        ("userId", "kind", "branchId", "retailTenantId", "planCode", "endsAt", "grantedAt", "metadata")
      SELECT DISTINCT ON (owner_id)
        owner_id,
        'BRANCH',
        "branchId",
        "tenantId",
        "planCode",
        $2::timestamptz,
        "startsAt",
        jsonb_build_object('backfilledFromSubscriptionId', id)
      FROM (
        SELECT
          ts.id,
          ts."branchId",
          ts."tenantId",
          ts."planCode",
          ts."startsAt",
          COALESCE(rt."ownerUserId", b."ownerId") AS owner_id
        FROM "tenant_subscriptions" ts
        LEFT JOIN "retail_tenants" rt ON rt."id" = ts."tenantId"
        LEFT JOIN "branches" b ON b."id" = ts."branchId"
        WHERE (
          ts."planCode" = ANY($1)
          OR ts."metadata"->>'source' = 'POS_SELF_SERVE_AUTO_TRIAL'
        )
      ) AS free_rows
      WHERE owner_id IS NOT NULL
      ORDER BY owner_id, "startsAt" ASC, id ASC
      ON CONFLICT DO NOTHING
      `,
      [this.posFreePlanCodes, this.freePeriodEndsAt],
    );

    // Move every unconverted free period — running or already lapsed — to the
    // one deadline, and reopen the lapsed ones. A row that has been paid for no
    // longer carries a free plan code, so it is not matched here.
    await queryRunner.query(
      `
      UPDATE "tenant_subscriptions"
      SET "endsAt" = $2::timestamp,
          "status" = 'TRIAL',
          "metadata" = COALESCE("metadata", '{}'::jsonb) || jsonb_build_object(
            'freePeriodDeadlineAppliedAt', now(),
            'previousEndsAt', to_jsonb("endsAt")
          ),
          "updatedAt" = now()
      WHERE "planCode" = ANY($1)
        AND "status" IN ('TRIAL', 'EXPIRED')
      `,
      [this.posFreePlanCodes, this.freePeriodEndsAt],
    );

    // Clear the reminder ledger off the free-period rows. Those keys recorded
    // which "your trial is ending" nudges had been sent; nothing sends them any
    // more — a free workspace is never told its free period is running out —
    // so what is left is stale bookkeeping for a mechanism that no longer
    // exists. Paid rows keep theirs: paid renewal reminders still go out.
    await queryRunner.query(
      `
      UPDATE "tenant_subscriptions"
      SET "metadata" = "metadata" - 'lifecycleRemindersSent' - 'trialEndedNotifiedAt'
      WHERE "planCode" = ANY($1)
        AND "status" = 'TRIAL'
      `,
      [this.posFreePlanCodes],
    );
  }

  /**
   * The grants table goes; the moved end dates do not come back. There is no
   * record of what each row's six-month date would have been beyond the
   * `previousEndsAt` stamped into metadata above, and guessing would hand
   * accounts an end date nobody chose. Restore from `previousEndsAt` by hand if
   * this ever has to be undone in anger.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "account_free_workspace_grants"`,
    );
  }
}
