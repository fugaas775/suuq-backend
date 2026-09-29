import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * The verification token printed on a pupil's fee statement.
 *
 * A receipt's token rides on the receipt row and an order slip's on the
 * cart's metadata; a fee statement is printed off a pupil's record that the
 * till rewrites on every payment, so its token lives in a row of its own —
 * one per pupil, minted the first time a statement is printed, never lost to
 * a folio save and never re-minted, so every statement ever printed for the
 * child scans to the same place. What the scan shows is the record as it
 * stands NOW, not the paper's figures: the point of the square.
 */
@Entity('pos_school_statement_codes')
@Unique('uq_pos_school_statement_codes_folio', ['folioId'])
@Unique('uq_pos_school_statement_codes_code', ['code'])
@Index('idx_pos_school_statement_codes_branch', ['branchId'])
export class SchoolStatementCode {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** The pupil's record — `pos_suspended_carts.id`. */
  @Column({ type: 'int' })
  folioId!: number;

  /** 14 chars of Crockford base32, like a receipt's. */
  @Column({ type: 'varchar', length: 16 })
  code!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
