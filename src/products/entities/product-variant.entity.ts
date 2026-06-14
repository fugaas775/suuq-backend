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
import { Expose } from 'class-transformer';
import { Product } from './product.entity';

// pg returns numeric/decimal columns as strings; convert to a JS number.
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * A sellable RETAIL product variant — a specific combination of category
 * attribute values (Size×Color×Material), each with its own per-branch stock
 * (branch_inventory_variant). `variantKey` is the deterministic, order- and
 * case-independent key from variant-key.util.ts.
 */
@Entity('product_variant')
@Index(['productId', 'variantKey'], { unique: true })
export class ProductVariant {
  @Expose()
  @PrimaryGeneratedColumn()
  id!: number;

  @Expose()
  @Column({ type: 'int' })
  productId!: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Expose()
  @Column({ type: 'varchar', length: 255 })
  variantKey!: string;

  // e.g. { "size": "M", "color": "Red", "material": "Cotton" }
  @Expose()
  @Column({ type: 'jsonb', nullable: true })
  attributes?: Record<string, string> | null;

  // Optional per-variant price; null = use the parent product price.
  @Expose()
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  priceOverride?: number | null;

  @Expose()
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
