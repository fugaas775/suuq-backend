import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { SupplierProfile } from '../../suppliers/entities/supplier-profile.entity';

export enum ProcurementWebhookEventType {
  INTERVENTION_UPDATED = 'PROCUREMENT_INTERVENTION_UPDATED',
  PURCHASE_ORDER_UPDATED = 'PROCUREMENT_PURCHASE_ORDER_UPDATED',
  RECEIPT_DISCREPANCY_RESOLVED = 'PROCUREMENT_RECEIPT_DISCREPANCY_RESOLVED',
  RECEIPT_DISCREPANCY_APPROVED = 'PROCUREMENT_RECEIPT_DISCREPANCY_APPROVED',
}

export enum ProcurementWebhookSubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
}

export enum ProcurementWebhookLastDeliveryStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

@Entity('procurement_webhook_subscriptions')
export class ProcurementWebhookSubscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 1000 })
  endpointUrl!: string;

  @Column({ type: 'varchar', length: 255 })
  signingSecret!: string;

  @Column({ type: 'simple-array', default: '' })
  eventTypes!: ProcurementWebhookEventType[];

  @Column({
    type: 'enum',
    enum: ProcurementWebhookSubscriptionStatus,
    default: ProcurementWebhookSubscriptionStatus.ACTIVE,
  })
  status!: ProcurementWebhookSubscriptionStatus;

  @Column({ type: 'int', nullable: true })
  branchId?: number | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch | null;

  @Column({ type: 'int', nullable: true })
  supplierProfileId?: number | null;

  @ManyToOne(() => SupplierProfile, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplierProfileId' })
  supplierProfile?: SupplierProfile | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  lastDeliveredAt?: Date | null;

  @Column({
    type: 'enum',
    enum: ProcurementWebhookLastDeliveryStatus,
    nullable: true,
  })
  lastDeliveryStatus?: ProcurementWebhookLastDeliveryStatus | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId?: number | null;

  @Column({ type: 'int', nullable: true })
  updatedByUserId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
