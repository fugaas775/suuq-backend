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
 * `(branchId, periodKey)` is UNIQUE. Payroll is the one figure a nervous user
 * will press twice, and a double-posted month overstates costs by a whole
 * month's wages with nothing on screen to suggest it happened.
 */
@Entity('pos_payroll_runs')
@Index('uq_pos_payroll_runs_branch_period', ['branchId', 'periodKey'], {
  unique: true,
})
export class PayrollRun {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** The month being paid, as 'YYYY-MM'. One run per branch per period. */
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
