import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';

export enum PaymentMethod {
  COD = 'COD',
  STRIPE = 'STRIPE',
  MPESA = 'MPESA',
  TELEBIRR = 'TELEBIRR',
}

export enum PaymentStatus {
  UNPAID = 'UNPAID',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED', // Vendor marks it as ready for pickup
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY', // Deliverer has picked it up
  DELIVERED = 'DELIVERED', // Deliverer confirms completion
  DELIVERY_FAILED = 'DELIVERY_FAILED', // Deliverer reports an issue
  CANCELLED = 'CANCELLED',
}

// Define Order first, because OrderItem depends on it
@Entity('order')
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { eager: true })
  user!: User;

  @ManyToOne(() => User, { nullable: true })
  deliverer?: User;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items!: OrderItem[];

  @Column('decimal', { precision: 10, scale: 2, transformer: {
    to: (value: number) => value,
    from: (value: string | number) => typeof value === 'string' ? parseFloat(value) : value,
  }})
  total!: number;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
  })
  paymentMethod!: PaymentMethod;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  paymentStatus!: PaymentStatus;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Column('jsonb')
  shippingAddress!: {
    fullName: string;
    address: string;
    city: string;
    country: string;
    phoneNumber: string;
  };

  @CreateDateColumn()
  createdAt!: Date;
}

// Define OrderItem second
@Entity('order_item')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Product, { eager: true })
  product!: Product;

  @Column()
  quantity!: number;

  @Column('decimal', { precision: 10, scale: 2, transformer: {
    to: (value: number) => value,
    from: (value: string | number) => typeof value === 'string' ? parseFloat(value) : value,
  }})
  price!: number; // Price at the time of purchase

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Column({ type: 'timestamp', nullable: true })
  shippedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  trackingCarrier?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  trackingNumber?: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  trackingUrl?: string | null;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  order!: Order;
}