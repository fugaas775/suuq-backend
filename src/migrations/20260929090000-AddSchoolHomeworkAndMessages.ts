import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Parents' portal, third pass — the teachers' side of it: homework set for a
 * class and read by its families, and a message thread per child between
 * the family's login and the school. Additive; nothing existing changes.
 */
export class AddSchoolHomeworkAndMessages20260929090000
  implements MigrationInterface
{
  name = 'AddSchoolHomeworkAndMessages20260929090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_homework" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "classCode" character varying(64) NOT NULL,
        "subject" character varying(120) NOT NULL,
        "title" character varying(200) NOT NULL,
        "body" text,
        "dueOn" date,
        "employeeId" integer,
        "teacherName" character varying(160),
        "createdByUserId" integer,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_homework_branch_class"
        ON "pos_school_homework" ("branchId", "classCode")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_homework_branch_due"
        ON "pos_school_homework" ("branchId", "dueOn")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_message_threads" (
        "id" BIGSERIAL PRIMARY KEY,
        "branchId" integer NOT NULL,
        "folioId" integer NOT NULL,
        "guardianId" bigint NOT NULL,
        "pupilName" character varying(160),
        "classCode" character varying(64),
        "lastMessageAt" TIMESTAMP WITH TIME ZONE,
        "lastPreview" character varying(200),
        "lastSenderKind" character varying(16),
        "guardianUnread" integer NOT NULL DEFAULT 0,
        "staffUnread" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "uq_pos_school_message_threads_pupil_guardian" UNIQUE ("branchId", "folioId", "guardianId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_message_threads_branch_last"
        ON "pos_school_message_threads" ("branchId", "lastMessageAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_message_threads_guardian"
        ON "pos_school_message_threads" ("guardianId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pos_school_messages" (
        "id" BIGSERIAL PRIMARY KEY,
        "threadId" bigint NOT NULL,
        "branchId" integer NOT NULL,
        "senderKind" character varying(16) NOT NULL,
        "senderUserId" integer,
        "senderName" character varying(160),
        "body" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pos_school_messages_thread"
        ON "pos_school_messages" ("threadId", "id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_messages"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "pos_school_message_threads"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_school_homework"`);
  }
}
