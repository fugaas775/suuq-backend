import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? value : Number(value),
};

export enum BranchEmployeeStatus {
  ACTIVE = 'ACTIVE',
  /**
   * Left, or not on this year's payroll. Kept rather than deleted because
   * payroll runs they appear in are history, and because a school re-hires the
   * same teacher next September more often than it invents a new one.
   */
  INACTIVE = 'INACTIVE',
}

/**
 * A person the branch employs — the record that says what someone does and what
 * they are paid, independent of whether they can log in.
 *
 * This is deliberately NOT `BranchStaffAssignment`. That table answers "who may
 * open the till and what may they press"; every row there is a login account.
 * A school of 22 has 3 people who touch a register and 19 who never will, and
 * the 19 still have to be paid. Modelling an employee as a login would mean
 * minting a password for a cleaner so the books could see her wage.
 *
 * `userId` is the optional join between the two. Null is the common case.
 *
 * Two columns are nullable on purpose:
 *
 *   - `jobTitle` is free text, not an enum. The first real roster to arrive held
 *     General Director, Deputy Director, Cashier, Teacher, School Guard, Cleaner
 *     and Camera man. No fixed list would have had the last one, and a roster
 *     that cannot describe a job forces it into OTHER, where it stops being
 *     answerable.
 *   - `monthlySalary` may be unknown. A payroll sheet arrives with a blank in it
 *     more often than not, and refusing the row would lose the person entirely;
 *     they are recorded, excluded from every run, and REPORTED as excluded, so
 *     the gap is visible instead of silent.
 */
@Entity('pos_branch_employees')
@Index('idx_pos_branch_employees_branch_status', ['branchId', 'status'])
export class BranchEmployee {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 255 })
  fullName!: string;

  /** Free text, as the school writes it: 'Teacher', 'School Guard', 'Camera man'. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  jobTitle!: string | null;

  /** Gross monthly pay. Null = not yet known; excluded from runs, never guessed. */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  monthlySalary!: number | null;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'varchar', length: 16, default: BranchEmployeeStatus.ACTIVE })
  status!: BranchEmployeeStatus;

  /** The login account this person uses, when they have one. Usually null. */
  @Column({ type: 'int', nullable: true })
  userId!: number | null;

  @Column({ type: 'date', nullable: true })
  startedAt!: string | null;

  @Column({ type: 'date', nullable: true })
  endedAt!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  /** Phone, next of kin, subjects taught — whatever the branch keeps beside it. */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
