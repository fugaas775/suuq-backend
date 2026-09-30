import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Ingredient, decimalTransformer } from './ingredient.entity';

export enum IngredientMovementType {
  /** The quantity the ingredient was created with. */
  OPENING = 'OPENING',
  /** Stock in, at a price. Blends into the weighted average. */
  PURCHASE = 'PURCHASE',
  /** A recipe drew it down at sale time. Negative for a sale, positive for a return. */
  CONSUMPTION = 'CONSUMPTION',
  /** Waste, spoilage, a correction — a signed delta the kitchen entered. */
  ADJUSTMENT = 'ADJUSTMENT',
  /** A physical count reset on-hand; the delta is the variance. */
  COUNT = 'COUNT',
  /** The exact undoing of one earlier movement. */
  VOID = 'VOID',
}

/** What caused a movement. A string, not an enum, so a new caller adds a name. */
export const IngredientMovementSource = {
  MANUAL: 'MANUAL',
  PURCHASE_RUN: 'PURCHASE_RUN',
  PURCHASE_RUN_VOID: 'PURCHASE_RUN_VOID',
  POS_CHECKOUT: 'POS_CHECKOUT',
  POS_CHECKOUT_VOID: 'POS_CHECKOUT_VOID',
} as const;

/**
 * Every change to an ingredient's on-hand, and the cost it carried.
 *
 * `costDelta` is the money view of the same row: what the receipt cost, or
 * what the consumption was worth at the average of the moment. The P&L sums
 * these — consumption into cost of goods, run receipts out of "goods
 * purchased" so the same sugar is not charged on the day it was bought AND
 * the day it was used.
 *
 * A VOID row reverses exactly one earlier row and stamps
 * `reversedByMovementId` on it. Readers that want "what really happened"
 * skip both halves of a reversed pair: the original because it was undone,
 * the VOID because it is the undoing. That is also why a voided run's receipt
 * vanishes from every range rather than posting a dated negative — the same
 * behaviour as its expense.
 *
 * `onHandAfter` / `avgUnitCostAfter` are the row's own snapshot of the
 * ingredient, so a history reads as a running balance without replaying it.
 */
@Entity('pos_ingredient_movements')
@Index('idx_pos_ingredient_movements_ingredient_time', [
  'ingredientId',
  'occurredAt',
])
@Index('idx_pos_ingredient_movements_branch_time', ['branchId', 'occurredAt'])
@Index('idx_pos_ingredient_movements_source', [
  'sourceType',
  'sourceReferenceId',
])
export class IngredientMovement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'int' })
  ingredientId!: number;

  @ManyToOne(() => Ingredient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ingredientId' })
  ingredient?: Ingredient;

  @Column({ type: 'varchar', length: 16 })
  movementType!: IngredientMovementType;

  /** Signed, in the ingredient's unit. */
  @Column('decimal', {
    precision: 14,
    scale: 4,
    transformer: decimalTransformer,
  })
  quantityDelta!: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  unitCost!: number;

  /** Signed money. See the class comment. */
  @Column('decimal', {
    precision: 14,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  costDelta!: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    transformer: decimalTransformer,
  })
  onHandAfter!: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    transformer: decimalTransformer,
  })
  avgUnitCostAfter!: number;

  @Column({ type: 'varchar', length: 32 })
  sourceType!: string;

  @Column({ type: 'int', nullable: true })
  sourceReferenceId?: number | null;

  /**
   * Which line of the source document. With `sourceReferenceId` it is the
   * idempotency key — the partial unique index in the migration.
   */
  @Column({ type: 'varchar', length: 160, nullable: true })
  sourceLineRef?: string | null;

  /** The menu item a CONSUMPTION row was cooked for. */
  @Column({ type: 'int', nullable: true })
  productId?: number | null;

  @Column({ type: 'int', nullable: true })
  reversesMovementId?: number | null;

  @Column({ type: 'int', nullable: true })
  reversedByMovementId?: number | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  reason?: string | null;

  @Column({ type: 'int', nullable: true })
  actorUserId?: number | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /**
   * When it happened in the business — the sale's own time, the run's own
   * date — not when this row was written. The P&L buckets by this.
   */
  @Column({ type: 'timestamp' })
  occurredAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
