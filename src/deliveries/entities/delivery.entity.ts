import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/order.entity';
import { User } from '../../users/user.entity';

export enum DeliveryStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
}

@Entity()
export class Delivery {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Order, { eager: true, onDelete: 'CASCADE' })
  order!: Order;

  @ManyToOne(() => User, { eager: true, nullable: false })
  deliverer!: User;

  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING, // default to PENDING for new deliveries
  })
  status!: DeliveryStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}