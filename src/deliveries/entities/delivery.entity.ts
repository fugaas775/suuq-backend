import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';

export enum DeliveryStatus {
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
    default: DeliveryStatus.ASSIGNED,
  })
  status!: DeliveryStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}