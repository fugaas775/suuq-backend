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

/** One person as they were paid, frozen at the moment the run was posted. */
export interface PayrollRunLine {
  employeeId: number | null;
  fullName: string;
  jobTitle: string | null;
  amount: number;
}

/**
 * One month's payroll, posted.
 *
 * A run is a DOCUMENT, not a calculation — the same reason a checkout stores its
 * lines rather than re-deriving them from the catalog. `lines` is a snapshot of
 * who was paid what, so raising a teacher's salary in March does not silently
 * restate what February cost. Without it, "what did we pay last term" would be
 * answered by today's salary list multiplied by a headcount, which is the kind
 * of number that looks right and is never right.
 *
 * The money leaves through the ordinary expense path — one `branch_expenses` row
 * of category PAYROLL, which posts its own ledger entry and lands in the P&L as
 * labour. `expenseId` is that row. Deleting a run deletes the expense, which
 * reverses the ledger; the two must not drift apart.
 *
 * A period may hold SEVERAL runs — a month is paid in waves (the teachers on
 * the 1st, the guards when the fees clear). What stays unique is one level
 * down: `pos_payroll_run_members` guarantees no PERSON is paid twice for the
 * same month, index-enforced, exactly as the old run-level index was. Payroll
 * is still the one figure a nervous user will press twice; the double press is
 * now decided per person instead of per month.
 */
@Entity('pos_payroll_runs')
@Index('ix_pos_payroll_runs_branch_period', ['branchId', 'periodKey'])
export class PayrollRun {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** The month being paid, as 'YYYY-MM'. A period may hold several runs. */
  @Column({ type: 'varchar', length: 32 })
  periodKey!: string;

  /** How the branch says it: 'Meskerem 2019 E.C.', 'September 2026'. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  label!: string | null;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalTransformer,
  })
  total!: number;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'int', default: 0 })
  headcount!: number;

  @Column({ type: 'jsonb' })
  lines!: PayrollRunLine[];

  /** The branch_expenses row this run posted. Null only if posting failed. */
  @Column({ type: 'int', nullable: true })
  expenseId!: number | null;

  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'int', nullable: true })
  postedByUserId!: number | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
