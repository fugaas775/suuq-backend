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
import { Product } from '../../products/entities/product.entity';
import { Branch } from './branch.entity';

@Entity('branch_inventory')
@Index(['branchId', 'productId'], { unique: true })
export class BranchInventory {
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

  @Column({ type: 'int', default: 0 })
  quantityOnHand!: number;

  @Column({ type: 'int', default: 0 })
  reservedQuantity!: number;

  @Column({ type: 'int', default: 0 })
  reservedOnline!: number;

  @Column({ type: 'int', default: 0 })
  reservedStoreOps!: number;

  @Column({ type: 'int', default: 0 })
  inboundOpenPo!: number;

  @Column({ type: 'int', default: 0 })
  outboundTransfers!: number;

  @Column({ type: 'int', default: 0 })
  safetyStock!: number;

  // Target on-hand the branch wants to keep for this SKU (0 = unset). Purely
  // informational — does NOT feed the availableToSell projection.
  @Column({ type: 'int', default: 0 })
  parLevel!: number;

  // Re-order threshold: a breach is availableToSell < reorderPoint (0 = never
  // breaches). Also informational — separate from safetyStock.
  @Column({ type: 'int', default: 0 })
  reorderPoint!: number;

  @Column({ type: 'int', default: 0 })
  availableToSell!: number;

  @Column({ type: 'int', default: 0 })
  version!: number;

  @Column({ type: 'timestamp', nullable: true })
  lastReceivedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  lastPurchaseOrderId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
