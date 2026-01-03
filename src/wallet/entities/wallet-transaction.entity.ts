import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';

export enum TransactionType {
  EARNING = 'EARNING',
  PAYOUT = 'PAYOUT',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
  DEPOSIT = 'DEPOSIT',
  PAYMENT = 'PAYMENT',
}

@Entity('wallet_transaction')
export class WalletTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Wallet)
  wallet: Wallet;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  orderId: number; // Reference to the Order ID if applicable

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}
