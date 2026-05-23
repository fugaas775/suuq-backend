import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranchShiftTables20260511000000
  implements MigrationInterface
{
  name = 'CreateBranchShiftTables20260511000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "branch_shifts" (
        "id"          SERIAL PRIMARY KEY,
        "branchId"    integer NOT NULL,
        "name"        varchar(100) NOT NULL,
        "startTime"   varchar(5) NOT NULL,
        "endTime"     varchar(5) NOT NULL,
        "daysOfWeek"  text NOT NULL DEFAULT '',
        "isActive"    boolean NOT NULL DEFAULT true,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_branch_shifts_branch"
          FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "branch_shift_staff" (
        "id"        SERIAL PRIMARY KEY,
        "shiftId"   integer NOT NULL,
        "branchId"  integer NOT NULL,
        "userId"    integer NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_branch_shift_staff_shift_user" UNIQUE ("shiftId", "userId"),
        CONSTRAINT "FK_branch_shift_staff_shift"
          FOREIGN KEY ("shiftId") REFERENCES "branch_shifts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_branch_shift_staff_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_branch_shifts_branchId" ON "branch_shifts" ("branchId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_branch_shift_staff_shiftId" ON "branch_shift_staff" ("shiftId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_branch_shift_staff_branchId_userId"
        ON "branch_shift_staff" ("branchId", "userId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_shift_staff"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_shifts"`);
  }
}
