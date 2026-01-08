import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum WithdrawalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('withdrawals')
export class Withdrawal {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user: User;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column()
  method: string; // e.g., 'BANK_TRANSFER', 'TELEBIRR'

  @Column('jsonb', { nullable: true })
  details: any; // Account number, etc.

  @Column({
    type: 'enum',
    enum: WithdrawalStatus,
    default: WithdrawalStatus.PENDING,
  })
  status: WithdrawalStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
