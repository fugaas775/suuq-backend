import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../../retail/entities/tenant-subscription.entity';
import { SupplierProfile } from './supplier-profile.entity';

/**
 * Paid subscription for a supplier (wholesaler) account. Deliberately a
 * SEPARATE table from `tenant_subscriptions` — that table is hard-bound to
 * RetailTenant/Branch (NOT-NULL tenantId CASCADE FK) and the whole POS billing
 * engine keys off it; a supplier has neither tenant nor branch. We reuse the
 * status/interval ENUMS and the activation pattern, not the table, to keep the
 * live POS billing path untouched.
 */
@Entity('supplier_subscriptions')
export class SupplierSubscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  supplierProfileId!: number;

  @ManyToOne(() => SupplierProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplierProfileId' })
  supplierProfile!: SupplierProfile;

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

  /** Number of months the subscription covers. */
  @Column({ type: 'int', nullable: true })
  periodMonths?: number | null;

  /** Total amount billed for the full period (amount × months). */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amountTotal?: number | null;

  @Column({ type: 'timestamptz' })
  startsAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
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
