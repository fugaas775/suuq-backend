import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity'; // <-- FIXED IMPORT

export enum WithdrawalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity()
export class Withdrawal {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar' })
  mobileMoneyNumber!: string;

  @Column({
    type: 'enum',
    enum: WithdrawalStatus,
    default: WithdrawalStatus.PENDING,
  })
  status!: WithdrawalStatus;

  @ManyToOne(() => User, { eager: true })
  vendor!: User;

  @CreateDateColumn()
  createdAt!: Date;
}