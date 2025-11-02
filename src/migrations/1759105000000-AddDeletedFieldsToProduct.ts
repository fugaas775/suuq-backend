import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedFieldsToProduct1759105000000 implements MigrationInterface {
  name = 'AddDeletedFieldsToProduct1759105000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL`);
    await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "deleted_by_admin_id" integer NULL`);
    await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "deleted_reason" varchar(512) NULL`);
    // Optional FK (best-effort). PostgreSQL doesn't support IF NOT EXISTS for ADD CONSTRAINT before v15, so use a DO block.
    try {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = 'product' AND c.conname = 'FK_product_deleted_by_admin'
          ) THEN
            ALTER TABLE "product"
            ADD CONSTRAINT "FK_product_deleted_by_admin"
            FOREIGN KEY ("deleted_by_admin_id") REFERENCES "user"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END
        $$;
      `);
    } catch {}
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop FK first (best-effort)
    try {
      await queryRunner.query(`ALTER TABLE "product" DROP CONSTRAINT IF EXISTS "FK_product_deleted_by_admin"`);
    } catch {}
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "deleted_reason"`);
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "deleted_by_admin_id"`);
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
