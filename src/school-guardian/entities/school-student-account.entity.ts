import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A pupil's own login at ONE school.
 *
 * The login is a `user` row — `posUsername` + password, `authMode` MANUAL,
 * no roles — the shape a parent's login takes, so the same sign-in path
 * answers it. What makes that user a STUDENT is this row: it names the
 * school (branchId) and the one record (folioId, `pos_suspended_carts.id`)
 * the login may read. A pupil is NOT staff and NOT a guardian: there is no
 * `branch_staff_assignments` row and no `pos_school_guardians` row, so the
 * roster, payroll, the registers and every POS route stay closed, and the
 * only doors that open are the student-portal routes, which read nothing
 * but the pupil's own record.
 *
 * One record, one login (the unique index on branch + folio); a pupil with
 * records at two schools may hold a login at each.
 */
@Entity('pos_school_student_accounts')
@Unique('uq_pos_school_student_accounts_branch_folio', ['branchId', 'folioId'])
@Unique('uq_pos_school_student_accounts_branch_user', ['branchId', 'userId'])
@Index('idx_pos_school_student_accounts_user', ['userId'])
export class SchoolStudentAccount {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** `user.id` of the login. */
  @Column({ type: 'int' })
  userId!: number;

  /** The pupil's record — `pos_suspended_carts.id`. No foreign key: a withdrawn pupil's row is discarded, and the login should say "withdrawn", not vanish. */
  @Column({ type: 'int' })
  folioId!: number;

  /** The pupil's name as the office recorded it when the login was made. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  displayName!: string | null;

  /** False = the office switched this login off; the user row stays. */
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', nullable: true })
  createdByUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  createdByName!: string | null;

  /** When the office last SET the password (creation or a reset). */
  @Column({ type: 'timestamptz', nullable: true })
  passwordIssuedAt!: Date | null;

  /** When the PUPIL last changed the password themselves. */
  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
