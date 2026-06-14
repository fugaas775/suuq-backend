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
import { Branch } from './branch.entity';
import { ProductVariant } from '../../products/entities/product-variant.entity';

/**
 * Per-branch stock for a single product variant. Mirrors the relevant subset of
 * BranchInventory. The product-level BranchInventory row stays the rollup of all
 * its variants — kept consistent by VariantInventoryService.recordVariantMovement,
 * which cascades every variant movement to InventoryLedgerService.recordMovement.
 * `productId` is denormalized so a branch's variant stock can be fetched for a
 * set of products in one query.
 */
@Entity('branch_inventory_variant')
@Index(['branchId', 'variantId'], { unique: true })
@Index(['branchId', 'productId'])
export class BranchInventoryVariant {
  @Expose()
  @PrimaryGeneratedColumn()
  id!: number;

  @Expose()
  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Expose()
  @Column({ type: 'int' })
  variantId!: number;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variantId' })
  variant!: ProductVariant;

  @Expose()
  @Column({ type: 'int' })
  productId!: number;

  @Expose()
  @Column({ type: 'int', default: 0 })
  quantityOnHand!: number;

  @Expose()
  @Column({ type: 'int', default: 0 })
  reservedQuantity!: number;

  @Expose()
  @Column({ type: 'int', default: 0 })
  safetyStock!: number;

  @Expose()
  @Column({ type: 'int', default: 0 })
  availableToSell!: number;

  @Column({ type: 'int', default: 0 })
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
