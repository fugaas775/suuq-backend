import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PayrollRun } from './payroll-run.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? value : Number(value),
};

/**
 * One run's claim on one person's month — HOW MUCH of the salary it paid.
 *
 * Payroll used to be all-or-nothing per month, then all-or-nothing per person.
 * Real branches pay a salary in PARTS too — an advance on the 10th when a
 * teacher asks, the remainder at month end — so a (person, month) may now hold
 * several rows, one per wave, and the invariant that survives is smaller
 * still: the rows for a (person, month) may never SUM past the salary.
 *
 * That cap cannot be a unique index, so the service enforces it inside a
 * branch-scoped advisory-locked transaction — the lock serialises payroll
 * writers per branch, deciding a double press the way the index used to.
 * Rows are written with the run and go with it (FK ON DELETE CASCADE), so
 * undoing an advance frees exactly that amount for a redo.
 */
@Entity('pos_payroll_run_members')
@Index('ix_pos_payroll_member_period', ['branchId', 'periodKey', 'employeeId'])
export class PayrollRunMember {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  runId!: number;

  @ManyToOne(() => PayrollRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run?: PayrollRun;

  @Column({ type: 'int' })
  branchId!: number;

  /** Denormalised from the run so the claim lookup needs no join. */
  @Column({ type: 'varchar', length: 32 })
  periodKey!: string;

  @Column({ type: 'bigint' })
  employeeId!: number;

  /** What this run paid this person — the rows for a month sum to ≤ salary. */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amount!: number;
}
