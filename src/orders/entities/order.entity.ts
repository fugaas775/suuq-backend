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

  @Column('decimal', { precision: 10, scale: 2 })
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

  @Column('decimal', { precision: 10, scale: 2 })
  price!: number; // Price at the time of purchase

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  order!: Order;
}