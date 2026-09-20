import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TextbookLoanStatus = 'ISSUED' | 'RETURNED' | 'LOST';

/**
 * One book, in one pupil's hands: issued, then returned — or lost.
 *
 * Keyed to the pupil's FOLIO id like attendance is, not written onto the
 * folio: a fee payment rebuilds the folio snapshot and would drop anything
 * the cart does not own, and a withdrawal wants to ask "does this child still
 * hold books" before the folio goes. One row per (pupil, title): a book
 * issued again after a return is the same row back to ISSUED.
 */
@Entity('pos_school_textbook_loans')
@Index('idx_pos_school_textbook_loans_branch_class', ['branchId', 'classCode'])
@Index('idx_pos_school_textbook_loans_branch_folio', ['branchId', 'folioId'])
export class SchoolTextbookLoan {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** `pos_suspended_carts.id`. No foreign key — the row outlives the folio. */
  @Column({ type: 'int' })
  folioId!: number;

  @Column({ type: 'varchar', length: 64 })
  classCode!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: TextbookLoanStatus;

  @Column({ type: 'date' })
  issuedAt!: string;

  @Column({ type: 'date', nullable: true })
  returnedAt!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;

  @Column({ type: 'int', nullable: true })
  issuedByUserId!: number | null;

  @Column({ type: 'int', nullable: true })
  updatedByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
