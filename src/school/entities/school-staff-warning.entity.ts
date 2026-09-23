import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type StaffWarningLevel = 'VERBAL' | 'WRITTEN' | 'FINAL';
export type StaffWarningStatus = 'ACTIVE' | 'WITHDRAWN';

/**
 * One formal warning to a member of staff: a level (verbal, written, final
 * written), what it is about, the words, who gave it and when, and how
 * long it stands. The steps a school takes before anyone is dismissed —
 * kept where the dismissal check can read them.
 *
 * The person is a `pos_branch_employees` row, as leave is; `employeeName`
 * is denormalised like every other register's name. No foreign keys, by
 * the same rule. A warning is never deleted: withdrawn stays on file as
 * withdrawn, so the record still says what was given and taken back.
 */
@Entity('pos_school_staff_warnings')
@Index('idx_pos_school_staff_warnings_branch_employee', [
  'branchId',
  'employeeId',
])
@Index('idx_pos_school_staff_warnings_branch_issued', ['branchId', 'issuedOn'])
export class SchoolStaffWarning {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'int' })
  employeeId!: number;

  @Column({ type: 'varchar', length: 160, nullable: true })
  employeeName!: string | null;

  /** VERBAL | WRITTEN | FINAL */
  @Column({ type: 'varchar', length: 16 })
  level!: StaffWarningLevel;

  /** ABSENCE | LATENESS | CONDUCT | PERFORMANCE | NEGLECT | OTHER */
  @Column({ type: 'varchar', length: 24 })
  category!: string;

  @Column({ type: 'text' })
  reason!: string;

  /** What the person must do differently — the letter's second paragraph. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  expectation!: string | null;

  @Column({ type: 'date' })
  issuedOn!: string;

  /** The day the warning lapses; null = it stands until withdrawn. */
  @Column({ type: 'date', nullable: true })
  expiresOn!: string | null;

  @Column({ type: 'int', nullable: true })
  issuedByUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  issuedByName!: string | null;

  /** The person's own acknowledgement, from their page. */
  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  acknowledgedByUserId!: number | null;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status!: StaffWarningStatus;

  @Column({ type: 'timestamptz', nullable: true })
  withdrawnAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  withdrawnByUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  withdrawnByName!: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  withdrawNote!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
