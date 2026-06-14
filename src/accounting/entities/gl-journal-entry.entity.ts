import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GlJournalLine } from './gl-journal-line.entity';

/**
 * The kind of source event a journal entry was posted from. Used for audit and
 * to find the entry to reverse on void/correction.
 */
export enum GlJournalSourceType {
  POS_CHECKOUT = 'POS_CHECKOUT',
  POS_RETURN = 'POS_RETURN',
  POS_VOID_REVERSAL = 'POS_VOID_REVERSAL',
  AR_SETTLEMENT = 'AR_SETTLEMENT',
  HOSPITALITY_PAYMENT = 'HOSPITALITY_PAYMENT',
  HOSPITALITY_SETTLEMENT = 'HOSPITALITY_SETTLEMENT',
  DEPOSIT_OPEN = 'DEPOSIT_OPEN',
  DEPOSIT_REFUND = 'DEPOSIT_REFUND',
  DEPOSIT_FORFEIT = 'DEPOSIT_FORFEIT',
  REVENUE_ACCRUAL = 'REVENUE_ACCRUAL',
  EXPENSE = 'EXPENSE',
  FIXED_ASSET = 'FIXED_ASSET',
  DEPRECIATION = 'DEPRECIATION',
  ACCRUED_LIABILITY = 'ACCRUED_LIABILITY',
  ACCRUED_SETTLEMENT = 'ACCRUED_SETTLEMENT',
  LONG_TERM_DEBT = 'LONG_TERM_DEBT',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  OPENING_BALANCE = 'OPENING_BALANCE',
  MANUAL = 'MANUAL',
}

/**
 * A balanced double-entry journal entry. The invariant SUM(line.debit) ==
 * SUM(line.credit) is enforced by GeneralLedgerService before insert.
 *
 * Idempotency: (branchId, idempotencyKey) is unique, so re-posting the same
 * source event (e.g. a retried checkout ingest) is a no-op.
 */
@Entity('gl_journal_entries')
@Index(['branchId', 'idempotencyKey'], { unique: true })
@Index(['branchId', 'occurredAt'])
export class GlJournalEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** Financial date — drives period / as-of filtering in the reports. */
  @Column({ type: 'timestamp' })
  occurredAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  postedAt?: Date | null;

  @Column({
    type: 'enum',
    enum: GlJournalSourceType,
    enumName: 'gl_journal_source_type',
  })
  sourceType!: GlJournalSourceType;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sourceId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  memo?: string | null;

  /** Set on this entry when it reverses another (e.g. a void reversal). */
  @Column({ type: 'int', nullable: true })
  reversesEntryId?: number | null;

  /** Set on the original entry once it has been reversed. */
  @Column({ type: 'int', nullable: true })
  reversedByEntryId?: number | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId?: number | null;

  @OneToMany(() => GlJournalLine, (line) => line.entry, { cascade: true })
  lines!: GlJournalLine[];

  @CreateDateColumn()
  createdAt!: Date;
}
