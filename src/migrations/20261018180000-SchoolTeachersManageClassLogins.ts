import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Teachers manage their own classes' parents' and students' logins.
 *
 * Owner 2026-10-18: "Teachers should also manage Students' login and parents'
 * login for their respective class like cashiers." Every row on the
 * SCHOOL_TEACHER lane gains MANAGE_CLASS_LOGINS — the two login desks, held
 * to the teacher's assigned classes by SchoolLoginScopeService. `permissions`
 * is a TypeORM simple-array (comma-joined text). Prints the ids changed;
 * `down` takes the permission back off that lane.
 */
export class SchoolTeachersManageClassLogins20261018180000
  implements MigrationInterface
{
  name = 'SchoolTeachersManageClassLogins20261018180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const result: unknown = await queryRunner.query(`
      UPDATE "branch_staff_assignments"
         SET "permissions" = array_to_string(
               array_append(
                 array_remove(string_to_array(COALESCE("permissions", ''), ','), ''),
                 'MANAGE_CLASS_LOGINS'
               ), ',')
       WHERE "posExperienceProfileCode" = 'SCHOOL_TEACHER'
         AND NOT ('MANAGE_CLASS_LOGINS' = ANY(string_to_array(COALESCE("permissions", ''), ',')))
      RETURNING "id"
    `);
    const rows = (
      Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result
    ) as Array<{ id: number }>;

    console.log(
      `[SchoolTeachersManageClassLogins] teacher rows given MANAGE_CLASS_LOGINS: ${rows.length} [${rows.map((r) => r.id).join(',')}]`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "branch_staff_assignments"
         SET "permissions" = array_to_string(
               array_remove(string_to_array("permissions", ','), 'MANAGE_CLASS_LOGINS'), ',')
       WHERE "posExperienceProfileCode" = 'SCHOOL_TEACHER'
         AND 'MANAGE_CLASS_LOGINS' = ANY(string_to_array("permissions", ','))
    `);
  }
}
