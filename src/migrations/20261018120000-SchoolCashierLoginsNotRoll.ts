import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The school cashier manages logins, not the roll.
 *
 * Owner 2026-10-18: "do not allow cashiers to edit the whole student list,
 * except login only." The Cashier lane carried ENROL_STUDENT, which opens
 * enrolment, the class registry, rooms, the timetable and the textbook shelf
 * as well as the two login desks. Every OPERATOR row on the SCHOOL_CASHIER
 * lane holding it now holds MANAGE_SCHOOL_LOGINS instead — the logins alone.
 *
 * MANAGER rows are left alone: a manager holds every gate whatever the list
 * says. Office (SCHOOL_OFFICE) and unlaned rows are left alone: the office
 * is who enrols. `permissions` is a TypeORM simple-array (comma-joined text).
 *
 * The ids changed are printed, and `down` reverses exactly the rows that hold
 * the new permission on that lane.
 */
export class SchoolCashierLoginsNotRoll20261018120000
  implements MigrationInterface
{
  name = 'SchoolCashierLoginsNotRoll20261018120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ id: number }> = await queryRunner
      .query(
        `
      UPDATE "branch_staff_assignments"
         SET "permissions" = array_to_string(
               array_append(
                 array_remove(string_to_array("permissions", ','), 'ENROL_STUDENT'),
                 'MANAGE_SCHOOL_LOGINS'
               ), ',')
       WHERE "posExperienceProfileCode" = 'SCHOOL_CASHIER'
         AND "role" = 'OPERATOR'
         AND 'ENROL_STUDENT' = ANY(string_to_array("permissions", ','))
         AND NOT ('MANAGE_SCHOOL_LOGINS' = ANY(string_to_array("permissions", ',')))
      RETURNING "id"
    `,
      )
      .then((r: unknown) =>
        Array.isArray(r) && Array.isArray(r[0])
          ? r[0]
          : (r as Array<{ id: number }>),
      );

    console.log(
      `[SchoolCashierLoginsNotRoll] cashier rows moved to MANAGE_SCHOOL_LOGINS: ${rows.length} [${rows.map((r) => r.id).join(',')}]`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "branch_staff_assignments"
         SET "permissions" = array_to_string(
               array_append(
                 array_remove(string_to_array("permissions", ','), 'MANAGE_SCHOOL_LOGINS'),
                 'ENROL_STUDENT'
               ), ',')
       WHERE "posExperienceProfileCode" = 'SCHOOL_CASHIER'
         AND "role" = 'OPERATOR'
         AND 'MANAGE_SCHOOL_LOGINS' = ANY(string_to_array("permissions", ','))
         AND NOT ('ENROL_STUDENT' = ANY(string_to_array("permissions", ',')))
    `);
  }
}
