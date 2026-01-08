import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User, SubscriptionTier } from './user.entity';

export enum SubscriptionRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('subscription_request')
export class SubscriptionRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { eager: true })
  user!: User;

  @Column()
  method!: string; // 'BANK_TRANSFER'

  @Column({ nullable: true })
  reference?: string; // For bank transfer

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount?: number;

  @Column({ nullable: true })
  currency?: string;

  @Column({
    type: 'enum',
    enum: SubscriptionTier,
  })
  requestedTier!: SubscriptionTier;

  @Column({
    type: 'enum',
    enum: SubscriptionRequestStatus,
    default: SubscriptionRequestStatus.PENDING,
  })
  status!: SubscriptionRequestStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
