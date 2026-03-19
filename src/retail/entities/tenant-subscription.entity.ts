import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RetailTenant } from './retail-tenant.entity';

export enum TenantSubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum TenantBillingInterval {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
  CUSTOM = 'CUSTOM',
}

@Entity('tenant_subscriptions')
export class TenantSubscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  @ManyToOne(() => RetailTenant, (tenant) => tenant.subscriptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenantId' })
  tenant!: RetailTenant;

  @Column({ type: 'varchar', length: 64 })
  planCode!: string;

  @Column({ type: 'enum', enum: TenantSubscriptionStatus })
  status!: TenantSubscriptionStatus;

  @Column({
    type: 'enum',
    enum: TenantBillingInterval,
    default: TenantBillingInterval.MONTHLY,
  })
  billingInterval!: TenantBillingInterval;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount?: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  currency?: string | null;

  @Column({ type: 'timestamp' })
  startsAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  endsAt?: Date | null;

  @Column({ type: 'boolean', default: false })
  autoRenew!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
