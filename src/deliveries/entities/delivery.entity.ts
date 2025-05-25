import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Order } from '../../orders/order.entity';


export enum DeliveryStatus {
  PENDING = 'PENDING',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
}

@Entity()
export class Delivery {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Order, { eager: true })
  order!: Order;

  @Column()
  delivererId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'varchar', default: DeliveryStatus.PENDING })
  status!: DeliveryStatus;

}
