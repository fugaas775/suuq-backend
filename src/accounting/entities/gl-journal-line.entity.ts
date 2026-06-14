import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GlJournalEntry } from './gl-journal-entry.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? value : Number(value),
};

/**
 * One leg of a journal entry. Exactly one of debit/credit is non-zero in
 * practice (both default to 0). `branchId` and `occurredAt` are denormalized
 * from the entry so account-balance queries are index-only.
 */
@Entity('gl_journal_lines')
@Index(['branchId', 'accountCode', 'occurredAt'])
export class GlJournalLine {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => GlJournalEntry, (entry) => entry.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'entryId' })
  entry?: GlJournalEntry;

  @Column({ type: 'int' })
  entryId!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 8 })
  accountCode!: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  debit!: number;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  credit!: number;

  @Column({ type: 'timestamp' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;
}
