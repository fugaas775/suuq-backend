import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Header for a physical / cycle stock count sheet. The per-line quantity resets
 * are recorded as ADJUSTMENT stock_movements (sourceType 'STOCK_COUNT',
 * sourceReferenceId = this id) through the shared InventoryLedgerService, so the
 * movement ledger remains the single audit trail and on-hand stays consistent.
 */
@Entity('stock_counts')
@Index(['branchId', 'createdAt'])
export class StockCount {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 16, default: 'CYCLE' })
  countType!: string;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'int', nullable: true })
  countedByUserId?: number | null;

  @Column({ type: 'int', default: 0 })
  lineCount!: number;

  @Column({ type: 'int', default: 0 })
  totalVariance!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
