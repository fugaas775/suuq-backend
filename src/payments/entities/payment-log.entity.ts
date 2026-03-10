import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payment_logs')
export class PaymentLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ type: 'varchar', length: 32 })
  channel!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  orderId?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  eventType?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  processingStatus?: string | null;

  @Column({ type: 'boolean', nullable: true })
  signatureValid?: boolean | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  webhookTimestamp?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  requestHeaders?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  rawPayload?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  processingMeta?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
