import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHrAttendanceLogs1773942000000 implements MigrationInterface {
  name = 'CreateHrAttendanceLogs1773942000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hr_attendance_logs" DROP CONSTRAINT "FK_hr_attendance_logs_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hr_attendance_logs" DROP CONSTRAINT "FK_hr_attendance_logs_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_hr_attendance_logs_branch_user_check_in"`,
    );
    await queryRunner.query(`DROP TABLE "hr_attendance_logs"`);
  }
}
