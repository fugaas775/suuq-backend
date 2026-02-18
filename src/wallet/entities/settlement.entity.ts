import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SettlementStatus {
  PENDING = 'PENDING', // Calculated but not sent to bank
  PROCESSING = 'PROCESSING', // In CSV export/queued
  COMPLETED = 'COMPLETED', // Confirmed sent
  FAILED = 'FAILED',
}

@Entity()
export class Settlement {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'vendorId' })
  vendor!: User;

  @Column()
  vendorId!: number;

  @Column('decimal', { precision: 12, scale: 2 })
  amount!: number; // Net payout amount

  @Column('decimal', { precision: 12, scale: 2 })
  grossSales!: number;

  @Column('decimal', { precision: 12, scale: 2 })
  platformFee!: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  gatewayFee!: number;

  @Column()
  currency!: string; // ETB, KES

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    default: SettlementStatus.PENDING,
  })
  status!: SettlementStatus;

  @Column({ nullable: true })
  transactionReference?: string; // Bank ref or batch ID

  @Column({ type: 'date' })
  periodStart!: Date; // Monday

  @Column({ type: 'date' })
  periodEnd!: Date; // Sunday

  @Column({ nullable: true })
  generatedPdfUrl?: string; // Link to stored PDF statement

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
