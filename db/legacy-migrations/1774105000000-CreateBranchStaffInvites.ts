import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranchStaffInvites1774105000000
  implements MigrationInterface
{
  name = 'CreateBranchStaffInvites1774105000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "branch_staff_invites" (
        "id" SERIAL NOT NULL,
        "branchId" integer NOT NULL,
        "email" character varying(255) NOT NULL,
        "role" "branch_staff_assignments_role_enum" NOT NULL,
        "permissions" text NOT NULL DEFAULT '',
        "invitedByUserId" integer,
        "acceptedByUserId" integer,
        "isActive" boolean NOT NULL DEFAULT true,
        "acceptedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_staff_invites_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branch_staff_invites_branch_email" UNIQUE ("branchId", "email")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_branch_staff_invites_email_active" ON "branch_staff_invites" ("email", "isActive")`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_staff_invites" ADD CONSTRAINT "FK_branch_staff_invites_branch" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_staff_invites" ADD CONSTRAINT "FK_branch_staff_invites_invited_by" FOREIGN KEY ("invitedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_staff_invites" ADD CONSTRAINT "FK_branch_staff_invites_accepted_by" FOREIGN KEY ("acceptedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branch_staff_invites" DROP CONSTRAINT IF EXISTS "FK_branch_staff_invites_accepted_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_staff_invites" DROP CONSTRAINT IF EXISTS "FK_branch_staff_invites_invited_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_staff_invites" DROP CONSTRAINT IF EXISTS "FK_branch_staff_invites_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_branch_staff_invites_email_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "branch_staff_invites"`);
  }
}
