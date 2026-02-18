import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum CreditTransactionType {
  USAGE = 'USAGE', // Buying with credit
  REPAYMENT = 'REPAYMENT', // Paying back
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity()
export class CreditTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user: User;

  @Column({ type: 'enum', enum: CreditTransactionType })
  type: CreditTransactionType;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  referenceId: string; // e.g., Order ID

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}
