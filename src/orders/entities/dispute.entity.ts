import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { Order } from './order.entity';

export enum DisputeStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED', // Vendor wins / Delivered
  REFUNDED = 'REFUNDED', // Buyer wins / Refunded
}

@Entity('dispute')
export class Dispute {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => Order)
  @JoinColumn()
  order: Order;

  @Column()
  orderId: number;

  @Column()
  reason: string; // "Wrong item", "Damaged", "Driver behavior"

  @Column({ type: 'text', nullable: true })
  details: string;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.OPEN,
  })
  status: DisputeStatus;

  @Column({ nullable: true })
  resolutionNotes: string;

  @Column({ nullable: true })
  resolvedBy: number; // Admin User ID

  @Column({ nullable: true })
  resolvedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
