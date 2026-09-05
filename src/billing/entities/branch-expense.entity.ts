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
  /**
   * Goods bought to be sold or cooked — a restaurant's market run, a shop's
   * cash purchase of stock.
   *
   * NOT an operating expense, despite living in this table: it is a direct cost
   * of what the branch sells, so it debits COGS (5000) and is reported against
   * gross profit rather than below it. A QSR buying its meat and vegetables at
   * the market had nowhere to put that money before this — SUPPLIES posts to
   * EXPENSE_SUPPLIES, which put the single largest cost a restaurant has below
   * the gross-profit line and left every one of them showing a 100% margin.
   *
   * See {@link isPurchasesCategory}.
   */
  INGREDIENTS = 'INGREDIENTS',
  /**
   * The owner putting their own money INTO the business — the one row in this
   * table where cash moves toward the branch instead of away from it.
   *
   * NOT an expense, and not income either: capital contributed is not earned,
   * so it never touches the P&L. It debits CASH and credits OWNER_EQUITY
   * (3000), raises balance-sheet cash and equity by the same amount, and that
   * is all. It shares the table because everything else about it — an amount
   * on a date with a note, recorded by someone, voidable but never deletable —
   * is exactly what this table's CRUD, void and amend paths already do.
   *
   * See {@link isCapitalContributionCategory}.
   */
  OWNER_CONTRIBUTION = 'OWNER_CONTRIBUTION',
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
/**
 * True for rows in this table that buy goods rather than incur an operating
 * expense.
 *
 * Same shape as {@link isLiabilitySettlementCategory} and for the same reason:
 * every reader has to make the call, so the test lives in one place. The ledger
 * posting picks COGS from it and the P&L reports it against gross profit
 * instead of inside operating expenses. Cash is again the exception that needs
 * no test — the money left the branch either way.
 */
export function isPurchasesCategory(category?: string | null): boolean {
  return (
    String(category || '').toUpperCase() === BranchExpenseCategory.INGREDIENTS
  );
}

export function isLiabilitySettlementCategory(
  category?: string | null,
): boolean {
  return (
    String(category || '').toUpperCase() ===
    BranchExpenseCategory.TAX_REMITTANCE
  );
}

/**
 * True for rows in this table where the money came IN — owner capital put into
 * the business.
 *
 * Same shape as {@link isLiabilitySettlementCategory}, but here even cash needs
 * the test: every other row reduces the branch's cash and these raise it, so
 * any reader summing this table as "money out" must call this first. The ledger
 * posting reverses its legs on it (debit CASH, credit OWNER_EQUITY), the P&L
 * skips it entirely, and the balance sheet adds it to cash instead of
 * subtracting.
 */
export function isCapitalContributionCategory(
  category?: string | null,
): boolean {
  return (
    String(category || '').toUpperCase() ===
    BranchExpenseCategory.OWNER_CONTRIBUTION
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

  /**
   * When this row was voided, or null while it still counts.
   *
   * Money that was spent cannot be un-spent, so a mis-keyed expense is VOIDED,
   * never deleted. The row survives with who voided it and why; the ledger entry
   * it posted is reversed in the same transaction, so the P&L and the balance
   * sheet stop counting it the moment the void lands. Every reader that answers
   * "what did this branch spend" filters on `voidedAt IS NULL` — see
   * `listBranchExpenses` and `findExpenses`.
   *
   * Before this, the Delete button ran a hard DELETE: the amount, the note and
   * the date left no trace anywhere, and a manager could quietly remove a cost
   * from a month the owner had already been shown.
   */
  @Column({ type: 'timestamp', nullable: true })
  voidedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  voidedByUserId?: number | null;

  /**
   * Name of whoever voided it, frozen at the moment of the void — the same
   * reason `PurchaseRun.decidedByName` is stored rather than joined: the person
   * may later be renamed, or lose their staff assignment entirely, and the books
   * still have to say who did this.
   */
  @Column({ type: 'varchar', length: 160, nullable: true })
  voidedByName?: string | null;

  /** Required to void. Never null on a voided row. */
  @Column({ type: 'text', nullable: true })
  voidReason?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
