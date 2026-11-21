import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets the platform grant one branch a discount on its POS subscription.
 *
 * A percentage of the branch's list price: 0 is none and is where every
 * existing branch starts, so nothing changes for anyone until an admin sets
 * one. 100 marks a complimentary branch. The reason is kept beside it.
 */
export class AddBranchSubscriptionDiscount20261122100000
  implements MigrationInterface
{
  name = 'AddBranchSubscriptionDiscount20261122100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "subscriptionDiscountPercent" numeric(5,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "subscriptionDiscountReason" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "subscriptionDiscountReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN IF EXISTS "subscriptionDiscountPercent"`,
    );
  }
}
