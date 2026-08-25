import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { PurchaseRunLine } from './purchase-run-line.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? value : Number(value),
};

export enum PurchaseRunStatus {
  /** Being written. Only the purchaser sees it; nothing has been claimed. */
  DRAFT = 'DRAFT',
  /** Filed, waiting for a signature. Locked to the purchaser from here on. */
  SUBMITTED = 'SUBMITTED',
  /** Signed. The expense is posted and any stock lines have been applied. */
  APPROVED = 'APPROVED',
  /** Sent back with a reason. Returns to the purchaser as an editable draft. */
  REJECTED = 'REJECTED',
  /** Approved, then reversed. The expense and the stock went back with it. */
  VOID = 'VOID',
}

/**
 * One trip to the market.
 *
 * A restaurant here does not restock from a supplier with an account on the
 * platform. Somebody is handed cash before service, walks to the market, buys
 * the day's meat and vegetables from whoever has them, and comes back with the
 * goods and the change. Until now that money left the business with no record
 * of any kind: the till came up short, the P&L showed a 100% margin, and the
 * only account of what anything cost was in somebody's head.
 *
 * A run is that trip as a document. It carries its own lines (see
 * {@link PurchaseRunLine}) and three money columns that have to agree at the
 * end: what was advanced, what was spent, what came back.
 *
 * `expenseId` is the idempotency key for the whole approval. It is set inside
 * the same transaction that posts the expense and applies the stock, so a
 * double-tapped Approve on a slow phone cannot post a second one — the second
 * call sees a run that already has one and returns it unchanged. It is also
 * what a void reverses through, which is why the id is stored rather than
 * recomputed: reversing by matching amount and date would find the wrong row the
 * first time a branch files two runs of 2,090 on one Tuesday.
 */
@Entity('pos_purchase_runs')
@Index('idx_pos_purchase_runs_branch_status', ['branchId', 'status'])
@Index('idx_pos_purchase_runs_branch_occurred', ['branchId', 'occurredAt'])
@Index('idx_pos_purchase_runs_purchaser', ['purchaserUserId', 'status'])
export class PurchaseRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;

  @Column({
    type: 'enum',
    enum: PurchaseRunStatus,
    default: PurchaseRunStatus.DRAFT,
  })
  status!: PurchaseRunStatus;

  /** Where the run went — "Jigjiga market", "Karamara wholesalers". */
  @Column({ type: 'varchar', length: 160, nullable: true })
  label?: string | null;

  /**
   * The id the DEVICE gave this run, unique per branch where present.
   *
   * Filing is a POST from a phone in a market: the write lands, the response
   * does not, the purchaser taps again, and one trip becomes two runs — two
   * expenses once both are signed off. The ref is minted when the draft is
   * started and travels with it, so every retry carries the same one and the
   * unique index turns the second write into a read of the first.
   *
   * Nullable: every run filed before this has none, and they must not collide.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  clientRef?: string | null;

  @Column({ type: 'int', nullable: true })
  purchaserUserId?: number | null;

  /**
   * Snapshotted, like every other name this codebase prints. A purchaser who
   * leaves the branch must not turn last month's runs into "User #412".
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  purchaserName?: string | null;

  /**
   * The till the advance came out of, when one was issued. Null for a run paid
   * for out of the owner's own pocket, which is how most of them start.
   */
  @Column({ type: 'int', nullable: true })
  registerSessionId?: number | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  advanceAmount?: number | null;

  /**
   * The sum of the lines, stored rather than derived.
   *
   * A line can be edited until the run is filed, so this is recomputed on every
   * write — but it is stored because the approved run is a DOCUMENT: the amount
   * that was signed for is the amount that posted, and re-deriving it later from
   * lines somebody has since corrected would make the books disagree with the
   * expense they came from.
   */
  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  spentTotal!: number;

  /** What came back to the till. Null until the run is reconciled. */
  @Column('decimal', {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  returnedAmount?: number | null;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  /** The day of the run, which is not always the day it was filed. */
  @Column({ type: 'timestamp' })
  occurredAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  decidedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  decidedByUserId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  decidedByName?: string | null;

  /** Why it was sent back, or why it was voided. Required for both. */
  @Column({ type: 'text', nullable: true })
  decisionReason?: string | null;

  /** The posted branch expense. Set at approval, cleared on void. */
  @Column({ type: 'int', nullable: true })
  expenseId?: number | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @OneToMany(() => PurchaseRunLine, (line) => line.run, {
    cascade: ['insert', 'update'],
  })
  lines?: PurchaseRunLine[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
