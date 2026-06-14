import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosRegisterSessionFloats20260423000000
  implements MigrationInterface
{
  name = 'AddPosRegisterSessionFloats20260423000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_register_sessions" ADD COLUMN IF NOT EXISTS "openingFloat" numeric(12,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_register_sessions" ADD COLUMN IF NOT EXISTS "closingFloat" numeric(12,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_register_sessions" DROP COLUMN IF EXISTS "closingFloat"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_register_sessions" DROP COLUMN IF EXISTS "openingFloat"`,
    );
  }
}
