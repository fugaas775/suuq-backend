import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PayrollRun } from './payroll-run.entity';

/**
 * One person's claim on one month's pay — the row whose unique index decides a
 * double payment.
 *
 * Payroll used to be all-or-nothing: `(branchId, periodKey)` was unique on the
 * run itself, so one run claimed the whole month and paying a subset locked
 * everyone else out. Real branches pay in waves — the teachers on the 1st, the
 * guards when the fees clear — so a period may now hold several runs, and the
 * thing that must stay unique is smaller: no PERSON is paid twice for the same
 * month.
 *
 * `(branchId, periodKey, employeeId)` is that guarantee, enforced by the index
 * rather than by a prior read, for the same reason the old run index was: a
 * nervous double press or a lost race must be decided by the database, not by
 * whoever read stale state last. Rows are written with the run and go with it
 * (FK ON DELETE CASCADE), so undoing a run frees its people for a redo.
 */
@Entity('pos_payroll_run_members')
@Index(
  'uq_pos_payroll_member_period',
  ['branchId', 'periodKey', 'employeeId'],
  {
    unique: true,
  },
)
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

  /** Denormalised from the run so the unique index needs no join. */
  @Column({ type: 'varchar', length: 32 })
  periodKey!: string;

  @Column({ type: 'bigint' })
  employeeId!: number;
}
