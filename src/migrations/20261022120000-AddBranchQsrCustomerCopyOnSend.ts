import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a QSR branch print the customer's copy with every order it sends to the
 * kitchen.
 *
 * Defaulting to false keeps every existing branch printing exactly the one
 * kitchen ticket it prints today; the board's 🧾 prints the customer's copy on
 * demand either way.
 */
export class AddBranchQsrCustomerCopyOnSend20261022120000
  implements MigrationInterface
{
  name = 'AddBranchQsrCustomerCopyOnSend20261022120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "qsrCustomerCopyOnSend" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "qsrCustomerCopyOnSend"`,
    );
  }
}
