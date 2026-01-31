import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum PayoutStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum PayoutProvider {
  EBIRR = 'EBIRR',
  MPESA = 'MPESA',
  TELEBIRR = 'TELEBIRR',
}

@Entity('payout_log')
export class PayoutLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  @Index()
  vendor: User;

  @Column({
    type: 'enum',
    enum: PayoutProvider,
    default: PayoutProvider.EBIRR,
  })
  provider: PayoutProvider;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 3 })
  currency: string;

  @Column()
  phoneNumber: string;

  @Column()
  transactionReference: string; // The ID from the provider (e.g. payout ID)

  @Column({ nullable: true })
  orderId: number; // Linked Order ID

  @Column({ nullable: true })
  orderItemId: number; // Linked Order Item ID

  @Column({
    type: 'enum',
    enum: PayoutStatus,
    default: PayoutStatus.SUCCESS,
  })
  status: PayoutStatus;

  @Column({ nullable: true })
  failureReason: string;

  @CreateDateColumn()
  createdAt: Date;
}
