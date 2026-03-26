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
  ProcurementWebhookEventType,
  ProcurementWebhookSubscription,
} from './procurement-webhook-subscription.entity';

export enum ProcurementWebhookDeliveryStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

@Entity('procurement_webhook_deliveries')
export class ProcurementWebhookDelivery {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  subscriptionId!: number;

  @ManyToOne(() => ProcurementWebhookSubscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscriptionId' })
  subscription!: ProcurementWebhookSubscription;

  @Column({ type: 'enum', enum: ProcurementWebhookEventType })
  eventType!: ProcurementWebhookEventType;

  @Column({ type: 'varchar', length: 255 })
  eventKey!: string;

  @Column({ type: 'varchar', length: 1000 })
  requestUrl!: string;

  @Column({ type: 'jsonb' })
  requestHeaders!: Record<string, any>;

  @Column({ type: 'jsonb' })
  requestBody!: Record<string, any>;

  @Column({ type: 'int', nullable: true })
  branchId?: number | null;

  @Column({ type: 'int', nullable: true })
  supplierProfileId?: number | null;

  @Column({ type: 'int', nullable: true })
  purchaseOrderId?: number | null;

  @Column({
    type: 'enum',
    enum: ProcurementWebhookDeliveryStatus,
    default: ProcurementWebhookDeliveryStatus.PENDING,
  })
  status!: ProcurementWebhookDeliveryStatus;

  @Column({ type: 'int', default: 1 })
  attemptCount!: number;

  @Column({ type: 'int', nullable: true })
  responseStatus?: number | null;

  @Column({ type: 'text', nullable: true })
  responseBody?: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'int', nullable: true })
  durationMs?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  nextRetryAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finalFailureAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  replayedFromDeliveryId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
