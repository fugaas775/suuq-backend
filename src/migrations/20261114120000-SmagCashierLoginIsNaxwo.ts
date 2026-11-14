import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SMAG School's cashier login carries the cashier's name — and so do the
 * receipts she has taken on it.
 *
 * Login #2381 (`smag.cashier`, `pos.m.smag.cashier@sys.internal`) was created
 * with the display name "Cashier", and a receipt is stamped with the name of
 * the login that rang it. So every fee SMAG collected through its fee desk —
 * 437 receipts by 2026-11-14 — read "Cashier" in Receipts, History, the Today
 * tab and every pupil's payment history: nobody.
 *
 * The owner (2026-11-14): the cashier is Naxwo, and she alone has used this
 * login from Tikimt 1 to now. Before Tikimt somebody else used it, so the
 * Meskerem receipts are NOT renamed — calling them Naxwo's would be the same
 * fault the other way round.
 *
 * Tikimt 1, 2019 E.C. = 2026-10-11, midnight in Addis Ababa. `occurredAt` is a
 * NAIVE timestamp written from a JS Date by the API process, which runs in EAT
 * (see the naive-timestamp note), so the column holds Addis Ababa wall-clock
 * time and the cut is the wall-clock value '2026-10-11 00:00:00' — not the UTC
 * instant. (Either reads the same 175 rows: nothing was rung between 8 and 11
 * October.) Live read the same day: the last
 * "Cashier" receipt before that is 2026-10-08 11:07Z and the first after it
 * 2026-10-11 10:38Z — 262 before (left alone), 175 from (renamed), all SALEs.
 *
 * Narrow on every axis — branch 128, cashier user 2381, the name still
 * "Cashier", on or after the cut — and it refuses to run at all if user 2381
 * is not the branch-made SMAG cashier login. Idempotent: a re-run matches no
 * row. Down() restores exactly the rows this renamed, by the same filter.
 */
export class SmagCashierLoginIsNaxwo20261114120000
  implements MigrationInterface
{
  name = 'SmagCashierLoginIsNaxwo20261114120000';

  private static readonly BRANCH_ID = 128;
  private static readonly USER_ID = 2381;
  private static readonly LOGIN_EMAIL = 'pos.m.smag.cashier@sys.internal';
  private static readonly OLD_NAME = 'Cashier';
  private static readonly NEW_NAME = 'Naxwo';
  private static readonly FROM = '2026-10-11 00:00:00';

  private async assertTheLogin(queryRunner: QueryRunner): Promise<boolean> {
    const k = SmagCashierLoginIsNaxwo20261114120000;
    const rows: Array<{ email: string | null }> = await queryRunner.query(
      `SELECT u.email
         FROM "user" u
         JOIN branch_staff_assignments a ON a."userId" = u.id AND a."branchId" = $2
        WHERE u.id = $1`,
      [k.USER_ID, k.BRANCH_ID],
    );
    const ok =
      rows.length > 0 &&
      String(rows[0].email || '').toLowerCase() === k.LOGIN_EMAIL;
    if (!ok) {
      console.log(
        `[SmagCashierLoginIsNaxwo] skipped: user ${k.USER_ID} is not ${k.LOGIN_EMAIL} on branch ${k.BRANCH_ID}`,
      );
    }
    return ok;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const k = SmagCashierLoginIsNaxwo20261114120000;
    if (!(await this.assertTheLogin(queryRunner))) return;

    await queryRunner.query(
      `UPDATE "user" SET "displayName" = $2
        WHERE id = $1 AND ("displayName" = $3 OR "displayName" IS NULL)`,
      [k.USER_ID, k.NEW_NAME, k.OLD_NAME],
    );

    const renamed: unknown[] = await queryRunner.query(
      `UPDATE pos_checkouts SET "cashierName" = $3
        WHERE "branchId" = $1 AND "cashierUserId" = $2
          AND "cashierName" = $4 AND "occurredAt" >= $5
        RETURNING id`,
      [k.BRANCH_ID, k.USER_ID, k.NEW_NAME, k.OLD_NAME, k.FROM],
    );
    const count = Array.isArray(renamed)
      ? Array.isArray(renamed[0])
        ? (renamed[0] as unknown[]).length
        : renamed.length
      : 0;
    console.log(
      `[SmagCashierLoginIsNaxwo] login ${k.USER_ID} → "${k.NEW_NAME}"; receipts renamed: ${count} (expected 175 on 2026-11-14, plus any taken since)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const k = SmagCashierLoginIsNaxwo20261114120000;
    if (!(await this.assertTheLogin(queryRunner))) return;
    await queryRunner.query(
      `UPDATE pos_checkouts SET "cashierName" = $3
        WHERE "branchId" = $1 AND "cashierUserId" = $2
          AND "cashierName" = $4 AND "occurredAt" >= $5`,
      [k.BRANCH_ID, k.USER_ID, k.OLD_NAME, k.NEW_NAME, k.FROM],
    );
    await queryRunner.query(
      `UPDATE "user" SET "displayName" = $2 WHERE id = $1 AND "displayName" = $3`,
      [k.USER_ID, k.OLD_NAME, k.NEW_NAME],
    );
  }
}
