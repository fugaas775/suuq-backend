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

export const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? value : Number(value),
};

/**
 * One thing the kitchen keeps and cooks from: sugar, flour, cooking oil, goat.
 *
 * Not a product. A product is something the branch SELLS, counted in whole
 * units and shown on the till; an ingredient is something it USES, measured
 * in kilos and litres and drawn down a few grams per plate. `onHand` and
 * `avgUnitCost` are the two numbers every read wants and every write moves,
 * so they live on the row — the movements table is the audit of how they got
 * there, not the source they are recomputed from on every request.
 *
 * `avgUnitCost` is a weighted average: each receipt blends its price into
 * whatever was already on the shelf. A sale then consumes at that average,
 * which is what the P&L calls cost of goods for a plate.
 *
 * The unique index on (branchId, lower(name)) is a raw-SQL expression index in
 * the migration; TypeORM cannot declare it, so it is not repeated here.
 */
@Entity('pos_ingredients')
@Index('idx_pos_ingredients_branch_active', ['branchId'], {
  where: '"isActive"',
})
export class Ingredient {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** KG | G | L | ML | PCS — see ingredient-units.ts. */
  @Column({ type: 'varchar', length: 8 })
  unit!: string;

  /** In `unit`. May be negative: a sale is never refused for the ledger. */
  @Column('decimal', {
    precision: 14,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  onHand!: number;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  avgUnitCost!: number;

  /** Below this the ingredient reads "running low". Null = never warned. */
  @Column('decimal', {
    precision: 14,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  lowStockThreshold?: number | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
