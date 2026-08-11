import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { Product } from '../../products/entities/product.entity';
import { SupplierOffer } from '../../supplier-offers/entities/supplier-offer.entity';
import { SupplierProfile } from '../../suppliers/entities/supplier-profile.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? null : Number(value),
};

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  // Supplier counter-offered amended quantities/prices/delivery; awaiting the
  // buyer's accept (→ ACKNOWLEDGED) or reject (→ CANCELLED).
  CHANGES_PROPOSED = 'CHANGES_PROPOSED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  // Supplier shipped part of the order; the rest is still outstanding.
  PARTIALLY_SHIPPED = 'PARTIALLY_SHIPPED',
  SHIPPED = 'SHIPPED',
  RECEIVED = 'RECEIVED',
  RECONCILED = 'RECONCILED',
  // Supplier rejected the order outright (terminal, parallel to CANCELLED).
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
}

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  orderNumber!: string;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'int' })
  supplierProfileId!: number;

  @ManyToOne(() => SupplierProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplierProfileId' })
  supplierProfile!: SupplierProfile;

  @Column({
    type: 'enum',
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.DRAFT,
  })
  status!: PurchaseOrderStatus;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: 0,
  })
  subtotal!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: 0,
  })
  total!: number;

  @Column({ type: 'date', nullable: true })
  expectedDeliveryDate?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  acknowledgedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  shippedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  reconciledAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'::jsonb" })
  statusMeta?: Record<string, any> | null;

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder, {
    cascade: true,
    eager: true,
  })
  items!: PurchaseOrderItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('purchase_order_items')
export class PurchaseOrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  purchaseOrderId!: number;

  @ManyToOne(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder!: PurchaseOrder;

  @Column({ type: 'int' })
  productId!: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({ type: 'int', nullable: true })
  supplierOfferId?: number | null;

  @ManyToOne(() => SupplierOffer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplierOfferId' })
  supplierOffer?: SupplierOffer | null;

  @Column({ type: 'int' })
  orderedQuantity!: number;

  @Column({ type: 'int', default: 0 })
  receivedQuantity!: number;

  // Cumulative quantity the supplier has marked shipped across one or more
  // (partial) dispatches. Drives PARTIALLY_SHIPPED vs SHIPPED and the buyer's
  // per-line shipped progress.
  @Column({ type: 'int', default: 0 })
  shippedQuantity!: number;

  @Column({ type: 'int', default: 0 })
  shortageQuantity!: number;

  @Column({ type: 'int', default: 0 })
  damagedQuantity!: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  unitPrice!: number;
}
