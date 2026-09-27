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
 * A parent's login at ONE school.
 *
 * The login itself is a `user` row — `posUsername` + password, `authMode`
 * MANUAL, no roles — exactly the shape a branch's manual staff account takes,
 * so the same sign-in code path answers it. What makes that user a PARENT is
 * this row: it names the school (branchId) and, through
 * `pos_school_guardian_pupils`, the children the login may read. A guardian
 * is NOT staff: there is deliberately no `branch_staff_assignments` row, so
 * the roster, payroll, the staff register and every POS route stay closed to
 * them, and the only doors that open are the guardian-portal routes, which
 * read nothing but the pupils linked here.
 *
 * One user may hold a guardianship at more than one school (a family with
 * children at both); the unique index is per (branch, user).
 */
@Entity('pos_school_guardians')
@Unique('uq_pos_school_guardians_branch_user', ['branchId', 'userId'])
@Index('idx_pos_school_guardians_user', ['userId'])
export class SchoolGuardian {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** `user.id` of the login. */
  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'varchar', length: 160, nullable: true })
  displayName!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;

  /** FATHER | MOTHER | GUARDIAN | OTHER — what the office recorded. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  relationship!: string | null;

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

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
