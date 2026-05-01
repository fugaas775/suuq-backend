import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { EquityPartner } from './equity-partner.entity';

export enum EquityPayoutStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('equity_payouts')
export class EquityPayout {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  equityPartnerId!: number;

  @ManyToOne(() => EquityPartner, (p) => p.payouts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equityPartnerId' })
  partner!: EquityPartner;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'timestamp' })
  billingPeriodStart!: Date;

  @Column({ type: 'timestamp' })
  billingPeriodEnd!: Date;

  /** Full monthly subscription amount (stored for audit trail). */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 1900 })
  grossAmount!: number;

  /** Partner's share: floor(grossAmount * numerator / denominator). Default 633. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 633 })
  splitAmount!: number;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({
    type: 'enum',
    enum: EquityPayoutStatus,
    default: EquityPayoutStatus.PENDING,
  })
  status!: EquityPayoutStatus;

  /** Timestamp when an admin marked this payout as PAID. */
  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date | null;

  /** Transfer reference or other admin notes. */
  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
