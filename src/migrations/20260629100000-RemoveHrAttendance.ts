import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveHrAttendance20260629100000 implements MigrationInterface {
  name = 'RemoveHrAttendance20260629100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop any tenant entitlement rows that reference the retired module so
    //    the enum value can be removed without violating the column constraint.
    await queryRunner.query(
      `DELETE FROM "tenant_module_entitlements" WHERE "module" = 'HR_ATTENDANCE'`,
    );

    // 2. Drop the hr_attendance_logs table together with its FKs and index.
    //    Each step is guarded so a partially-applied state can still migrate.
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "hr_attendance_logs" DROP CONSTRAINT IF EXISTS "FK_hr_attendance_logs_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "hr_attendance_logs" DROP CONSTRAINT IF EXISTS "FK_hr_attendance_logs_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_hr_attendance_logs_branch_user_check_in"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "hr_attendance_logs"`);

    // 3. Remove 'HR_ATTENDANCE' from the module enum. Postgres cannot drop an
    //    enum value directly, so the type is recreated without it. The column
    //    has no DEFAULT, so none needs to be re-applied.
    const enumExists: Array<{ exists: boolean }> = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_module_entitlements_module_enum') AS "exists"`,
    );
    if (enumExists[0]?.exists) {
      await queryRunner.query(
        `ALTER TYPE "tenant_module_entitlements_module_enum" RENAME TO "tenant_module_entitlements_module_enum_old"`,
      );
      await queryRunner.query(
        `CREATE TYPE "tenant_module_entitlements_module_enum" AS ENUM ('POS_CORE', 'INVENTORY_CORE', 'INVENTORY_AUTOMATION', 'DESKTOP_BACKOFFICE', 'ACCOUNTING', 'ERP_CONNECTORS', 'AI_ANALYTICS')`,
      );
      await queryRunner.query(
        `ALTER TABLE "tenant_module_entitlements" ALTER COLUMN "module" TYPE "tenant_module_entitlements_module_enum" USING "module"::text::"tenant_module_entitlements_module_enum"`,
      );
      await queryRunner.query(
        `DROP TYPE "tenant_module_entitlements_module_enum_old"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add 'HR_ATTENDANCE' to the module enum (best-effort reverse).
    const enumExists: Array<{ exists: boolean }> = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_module_entitlements_module_enum') AS "exists"`,
    );
    if (enumExists[0]?.exists) {
      await queryRunner.query(
        `ALTER TYPE "tenant_module_entitlements_module_enum" ADD VALUE IF NOT EXISTS 'HR_ATTENDANCE'`,
      );
    }

    // Recreate the hr_attendance_logs table (data is not restored).
    if (!(await queryRunner.hasTable('hr_attendance_logs'))) {
      await queryRunner.query(`
        CREATE TABLE "hr_attendance_logs" (
          "id" SERIAL NOT NULL,
          "branchId" integer NOT NULL,
          "userId" integer NOT NULL,
          "checkInAt" TIMESTAMP NOT NULL,
          "checkOutAt" TIMESTAMP,
          "source" character varying(64),
          "note" text,
          "metadata" jsonb,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_hr_attendance_logs_id" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(
        `CREATE INDEX "IDX_hr_attendance_logs_branch_user_check_in" ON "hr_attendance_logs" ("branchId", "userId", "checkInAt")`,
      );
      await queryRunner.query(`
        ALTER TABLE "hr_attendance_logs"
        ADD CONSTRAINT "FK_hr_attendance_logs_branch"
        FOREIGN KEY ("branchId") REFERENCES "branches"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
      `);
      await queryRunner.query(`
        ALTER TABLE "hr_attendance_logs"
        ADD CONSTRAINT "FK_hr_attendance_logs_user"
        FOREIGN KEY ("userId") REFERENCES "user"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
      `);
    }
  }
}
