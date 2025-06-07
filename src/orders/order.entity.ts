import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Product } from '../products/entities/product.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
}

@Entity()
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  productId!: number;

  @Column()
  customerEmail!: string;

  @Column()
  quantity!: number;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Product, { eager: true })
  product!: Product;
}