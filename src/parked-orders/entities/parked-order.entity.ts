import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ParkedOrderStatus {
  PARKED = 'PARKED',
  CONTACTED = 'CONTACTED',
  CONVERTED = 'CONVERTED',
  CANCELLED = 'CANCELLED',
}

export enum ParkedOrderSource {
  PRODUCT_DETAILS = 'PRODUCT_DETAILS',
  FEED = 'FEED',
  CHAT = 'CHAT',
  REQUEST = 'REQUEST',
}

/**
 * A "Parked Order" is a lightweight, no-payment purchase intent created by a
 * shopper. Vendors (and their branch operators) see parked orders in the Suuq S
 * app and the pos-s portal, then follow up with the customer over Call/WhatsApp
 * to confirm and fulfil. This deliberately avoids online payment, which East
 * African shoppers commonly distrust for high-value or trust-sensitive items.
 */
@Entity('parked_orders')
@Index(['vendorId', 'status'])
@Index(['branchId', 'status'])
export class ParkedOrder {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  productId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  productName?: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  productImageUrl?: string | null;

  /** Owning vendor (product.vendor.id). Required so vendors can see their leads. */
  @Column({ type: 'int' })
  vendorId!: number;

  /** Optional branch (resolved from product.vendorStoreId -> VendorStore.branchId). */
  @Column({ type: 'int', nullable: true })
  branchId?: number | null;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  unitPrice?: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  attributes?: Record<string, any> | null;

  /** Set when the shopper is authenticated. */
  @Column({ type: 'int', nullable: true })
  customerUserId?: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  customerName?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  customerPhone?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({
    type: 'enum',
    enum: ParkedOrderSource,
    default: ParkedOrderSource.PRODUCT_DETAILS,
  })
  source!: ParkedOrderSource;

  @Column({
    type: 'enum',
    enum: ParkedOrderStatus,
    default: ParkedOrderStatus.PARKED,
  })
  status!: ParkedOrderStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
