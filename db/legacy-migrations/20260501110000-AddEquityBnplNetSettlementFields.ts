import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEquityBnplNetSettlementFields20260501110000
  implements MigrationInterface
{
  name = 'AddEquityBnplNetSettlementFields20260501110000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equity_partner_bnpl_activations" ADD COLUMN IF NOT EXISTS "equityCreditAmount" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partner_bnpl_activations" ADD COLUMN IF NOT EXISTS "settlementAmountDue" numeric(12,2) NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(
      `UPDATE "equity_partner_bnpl_activations"
       SET "equityCreditAmount" = FLOOR(COALESCE("amountDue", 0) / 3),
           "settlementAmountDue" = GREATEST(COALESCE("amountDue", 0) - FLOOR(COALESCE("amountDue", 0) / 3), 0)
       WHERE COALESCE("equityCreditAmount", 0) = 0
          OR COALESCE("settlementAmountDue", 0) = 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equity_partner_bnpl_activations" DROP COLUMN IF EXISTS "settlementAmountDue"`,
    );
    await queryRunner.query(
      `ALTER TABLE "equity_partner_bnpl_activations" DROP COLUMN IF EXISTS "equityCreditAmount"`,
    );
  }
}
