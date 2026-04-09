import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignPosCheckoutsWithRegisterState1774108000000
  implements MigrationInterface
{
  name = 'AlignPosCheckoutsWithRegisterState1774108000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const registerSessionIdType = await queryRunner.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'pos_checkouts'
        AND column_name = 'registerSessionId'
    `);

    if (registerSessionIdType[0]?.data_type !== 'integer') {
      await queryRunner.query(
        `ALTER TABLE "pos_checkouts" ALTER COLUMN "registerSessionId" TYPE integer USING NULLIF("registerSessionId", '')::integer`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" ADD COLUMN IF NOT EXISTS "suspendedCartId" integer`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_class rt ON rt.oid = c.confrelid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
          WHERE c.contype = 'f'
            AND t.relname = 'pos_checkouts'
            AND rt.relname = 'pos_register_sessions'
            AND a.attname = 'registerSessionId'
        ) THEN
          ALTER TABLE "pos_checkouts" ADD CONSTRAINT "FK_pos_checkouts_register_session" FOREIGN KEY ("registerSessionId") REFERENCES "pos_register_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_class rt ON rt.oid = c.confrelid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
          WHERE c.contype = 'f'
            AND t.relname = 'pos_checkouts'
            AND rt.relname = 'pos_suspended_carts'
            AND a.attname = 'suspendedCartId'
        ) THEN
          ALTER TABLE "pos_checkouts" ADD CONSTRAINT "FK_pos_checkouts_suspended_cart" FOREIGN KEY ("suspendedCartId") REFERENCES "pos_suspended_carts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" DROP CONSTRAINT IF EXISTS "FK_pos_checkouts_suspended_cart"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" DROP CONSTRAINT IF EXISTS "FK_pos_checkouts_register_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" DROP COLUMN IF EXISTS "suspendedCartId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pos_checkouts" ALTER COLUMN "registerSessionId" TYPE character varying(128) USING CASE WHEN "registerSessionId" IS NULL THEN NULL ELSE "registerSessionId"::text END`,
    );
  }
}
