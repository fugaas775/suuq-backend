import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveInterestFromCredit1770732000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the interestRate column
    await queryRunner.query(
      `ALTER TABLE "credit_limit" DROP COLUMN IF EXISTS "interestRate"`,
    );

    // 2. Remove 'INTEREST' from the enum
    // First delete any rows that might use it (though likely none exist yet)
    await queryRunner.query(
      `DELETE FROM "credit_transaction" WHERE "type" = 'INTEREST'`,
    );

    // Rename old type
    await queryRunner.query(
      `ALTER TYPE "credit_transaction_type_enum" RENAME TO "credit_transaction_type_enum_old"`,
    );

    // Create new type without INTEREST
    await queryRunner.query(
      `CREATE TYPE "credit_transaction_type_enum" AS ENUM('USAGE', 'REPAYMENT', 'ADJUSTMENT')`,
    );

    // Update column to use new type
    await queryRunner.query(
      `ALTER TABLE "credit_transaction" ALTER COLUMN "type" TYPE "credit_transaction_type_enum" USING "type"::text::"credit_transaction_type_enum"`,
    );

    // Drop old type
    await queryRunner.query(`DROP TYPE "credit_transaction_type_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert enum
    await queryRunner.query(
      `ALTER TYPE "credit_transaction_type_enum" RENAME TO "credit_transaction_type_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "credit_transaction_type_enum" AS ENUM('USAGE', 'REPAYMENT', 'INTEREST', 'ADJUSTMENT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "credit_transaction" ALTER COLUMN "type" TYPE "credit_transaction_type_enum" USING "type"::text::"credit_transaction_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "credit_transaction_type_enum_new"`);

    // Restore column
    await queryRunner.query(
      `ALTER TABLE "credit_limit" ADD COLUMN "interestRate" numeric(5,2) DEFAULT 0`,
    );
  }
}
