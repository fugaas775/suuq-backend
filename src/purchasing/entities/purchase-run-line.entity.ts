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
import { PurchaseRun } from './purchase-run.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? value : Number(value),
};

/**
 * One thing bought, from one seller, at one price.
 *
 * `description` is free text and `vendorName` is free text, and both are that
 * way deliberately. The person selling tomatoes at the market is not a supplier
 * profile on this platform and will never be one — modelling them as one would
 * mean a purchaser cannot file a run until somebody has onboarded a market
 * stall. The autocomplete in the till reads these columns back, so the second
 * run types itself.
 *
 * `productId` is the optional bridge to the catalog. Most lines will not have
 * one: charcoal, cooking gas and carrier bags are costs, not menu items. A line
 * that DOES carry one raises that product's stock by `stockQuantity` when the
 * run is approved — and `stockQuantity` is entered separately from `quantity`
 * on purpose, because they are different units. Three kilos of goat meat is not
 * three portions of suqaar, and the only person who knows the yield is standing
 * in the kitchen. Asking is honest; guessing a conversion factor is not.
 */
@Entity('pos_purchase_run_lines')
@Index('idx_pos_purchase_run_lines_run', ['runId'])
@Index('idx_pos_purchase_run_lines_branch_desc', ['branchId', 'description'])
export class PurchaseRunLine {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  runId!: number;

  @ManyToOne(() => PurchaseRun, (run) => run.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run?: PurchaseRun;

  /**
   * Denormalised from the run so price history can be read for a branch without
   * joining every run it has ever filed. The whole point of keeping these lines
   * is being able to answer "what did we pay for tomatoes last month".
   */
  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 200 })
  description!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  vendorName?: string | null;

  @Column('decimal', {
    precision: 12,
    scale: 3,
    default: 1,
    transformer: decimalTransformer,
  })
  quantity!: number;

  /** kg, sack, crate, litre, pcs — the market's unit, not the catalog's. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  unitLabel?: string | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  unitPrice!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  lineTotal!: number;

  /** The optional catalog link. Null for anything that is not a stocked item. */
  @Column({ type: 'int', nullable: true })
  productId?: number | null;

  /** In the PRODUCT's unit, not the market's. See the class comment. */
  @Column('decimal', {
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  stockQuantity?: number | null;

  /**
   * The stock movement this line produced, and the reason a re-approval cannot
   * add the goods twice. Cleared when a void takes them back out.
   */
  @Column({ type: 'int', nullable: true })
  stockMovementId?: number | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /**
   * When a manager struck this line off, if they did.
   *
   * Marked rather than deleted: a struck line is a thing that happened, and the
   * reason it came off is the part somebody wants in a month. A voided line is
   * excluded from the run's total, from the price book, and from any stock the
   * run applies — but it stays on the document, greyed, with the reason.
   */
  @Column({ type: 'timestamp', nullable: true })
  voidedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  voidedByUserId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  voidedByName?: string | null;

  @Column({ type: 'text', nullable: true })
  voidReason?: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
