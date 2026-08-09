import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? value : Number(value),
};

export enum BranchExpenseCategory {
  RENT = 'RENT',
  UTILITIES = 'UTILITIES',
  PAYROLL = 'PAYROLL',
  SUPPLIES = 'SUPPLIES',
  MARKETING = 'MARKETING',
  MAINTENANCE = 'MAINTENANCE',
  /** A tax that is a real cost of trading — a licence, a municipal levy. */
  TAXES = 'TAXES',
  OTHER = 'OTHER',
  /**
   * Paying collected sales tax (VAT) over to the authority.
   *
   * NOT an expense, despite living in this table: the money was never revenue,
   * so it debits TAX_PAYABLE rather than an expense account and stays out of the
   * P&L. It shares the table because the cash leg — money leaving the branch on
   * a date — is identical to an expense's, and every cash and CRUD path here
   * already handles that. See {@link isLiabilitySettlementCategory}.
   */
  TAX_REMITTANCE = 'TAX_REMITTANCE',
}

/**
 * True for rows in this table that settle a liability rather than incur a cost.
 *
 * Every reader of branch_expenses has to make the same call — the ledger posting
 * picks the debit account from it, the P&L leaves these out of operating
 * expenses, and the balance sheet nets them off tax payable — so the test lives
 * in one place. Cash is the exception that needs no test: the money left the
 * branch either way, so every cash path treats all rows alike.
 */
export function isLiabilitySettlementCategory(
  category?: string | null,
): boolean {
  return (
    String(category || '').toUpperCase() ===
    BranchExpenseCategory.TAX_REMITTANCE
  );
}

@Entity('branch_expenses')
@Index(['branchId', 'occurredAt'])
export class BranchExpense {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;

  @Column({ type: 'enum', enum: BranchExpenseCategory })
  category!: BranchExpenseCategory;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: number;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'timestamp' })
  occurredAt!: Date;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'int', nullable: true })
  recordedByUserId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
