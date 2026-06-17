import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('branch_catalog_product_links')
@Index(['branchId', 'productId'], { unique: true })
export class BranchCatalogProductLink {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'int' })
  productId!: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  /**
   * Per-branch retail price override. When null the branch sells at the shared
   * Product.price (effective price everywhere = COALESCE(retailPrice, product.price)).
   * Lets two branches reselling the same supplier product set independent retail prices
   * without mutating the shared, supplier-owned Product row.
   */
  @Column('decimal', {
    name: 'retail_price',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number | null | undefined) => value ?? null,
      from: (value: string | number | null | undefined) =>
        value == null
          ? null
          : typeof value === 'string'
            ? parseFloat(value)
            : value,
    },
  })
  retailPrice?: number | null;

  /** Per-branch retail sale price override (COALESCE(retailSalePrice, product.salePrice)). */
  @Column('decimal', {
    name: 'retail_sale_price',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number | null | undefined) => value ?? null,
      from: (value: string | number | null | undefined) =>
        value == null
          ? null
          : typeof value === 'string'
            ? parseFloat(value)
            : value,
    },
  })
  retailSalePrice?: number | null;

  /**
   * Whether this linked product is listed to consumers on the suuq_s marketplace
   * for this branch. "On my shelf" (link exists → sellable at the counter) is
   * decoupled from "listed online" (consumerVisible = true).
   */
  @Column({ name: 'consumer_visible', type: 'boolean', default: false })
  consumerVisible!: boolean;

  /** How the link was created: a manual Seller-HQ link, or auto-staged from a received PO. */
  @Column({ name: 'source', type: 'varchar', length: 32, default: 'MANUAL' })
  source!: 'MANUAL' | 'PURCHASE_ORDER';

  /** Provenance: the supplier whose received goods seeded this link (PURCHASE_ORDER source). */
  @Column({ name: 'source_supplier_profile_id', type: 'int', nullable: true })
  sourceSupplierProfileId?: number | null;

  /** Provenance: the purchase order whose receipt seeded this link (PURCHASE_ORDER source). */
  @Column({ name: 'source_purchase_order_id', type: 'int', nullable: true })
  sourcePurchaseOrderId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
