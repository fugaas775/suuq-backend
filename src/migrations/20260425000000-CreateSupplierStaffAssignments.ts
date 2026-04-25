import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupplierStaffAssignments20260425000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."supplier_staff_assignments_role_enum" AS ENUM ('MANAGER', 'OPERATOR');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "supplier_staff_assignments" (
        "id" SERIAL PRIMARY KEY,
        "supplierProfileId" integer NOT NULL,
        "userId" integer NOT NULL,
        "role" "public"."supplier_staff_assignments_role_enum" NOT NULL,
        "permissions" text NOT NULL DEFAULT '',
        "isActive" boolean NOT NULL DEFAULT true,
        "invitedByUserId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_supplier_staff_profile_user" UNIQUE ("supplierProfileId", "userId"),
        CONSTRAINT "FK_supplier_staff_profile" FOREIGN KEY ("supplierProfileId") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_supplier_staff_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_supplier_staff_user_active" ON "supplier_staff_assignments" ("userId", "isActive");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "supplier_staff_assignments";`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."supplier_staff_assignments_role_enum";`,
    );
  }
}
