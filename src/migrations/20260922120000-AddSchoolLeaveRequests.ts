import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Staff leave: a request per person and range of days, the kind of leave,
 * the school days it covers (frozen at the request), and the head's
 * decision. No backfill; a request exists because somebody asked.
 */
export class AddSchoolLeaveRequests20260922120000 implements MigrationInterface {
  name = 'AddSchoolLeaveRequests20260922120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_leave_requests" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "employeeId" integer NOT NULL,
        "employeeName" character varying(160),
        "requestedByUserId" integer,
        "requestedByName" character varying(160),
        "leaveType" character varying(24) NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "schoolDays" integer NOT NULL DEFAULT 0,
        "reason" character varying(1000),
        "status" character varying(16) NOT NULL DEFAULT 'PENDING',
        "decidedByUserId" integer,
        "decidedByName" character varying(160),
        "decidedAt" TIMESTAMP WITH TIME ZONE,
        "decisionNote" character varying(400),
        "coverNote" character varying(400),
        "cancelledByUserId" integer,
        "cancelledByName" character varying(160),
        "cancelledAt" TIMESTAMP WITH TIME ZONE,
        "cancelNote" character varying(400),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_leave_branch_start"
        ON "pos_school_leave_requests" ("branchId", "startDate")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_leave_branch_employee"
        ON "pos_school_leave_requests" ("branchId", "employeeId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_leave_branch_status"
        ON "pos_school_leave_requests" ("branchId", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_leave_requests"`);
  }
}
