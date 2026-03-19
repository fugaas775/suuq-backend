import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';

export enum PurchaseOrderReceiptDiscrepancyStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  APPROVED = 'APPROVED',
}

@Entity('purchase_order_receipt_events')
export class PurchaseOrderReceiptEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  purchaseOrderId!: number;

  @ManyToOne(() => PurchaseOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder!: PurchaseOrder;

  @Column({ type: 'int', nullable: true })
  actorUserId?: number | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'jsonb' })
  receiptLines!: Array<{
    itemId: number;
    productId: number;
    receivedQuantity: number;
    shortageQuantity: number;
    damagedQuantity: number;
    note?: string | null;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  supplierAcknowledgedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  supplierAcknowledgedByUserId?: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  supplierAcknowledgementNote?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  discrepancyStatus?: PurchaseOrderReceiptDiscrepancyStatus | null;

  @Column({ type: 'text', nullable: true })
  discrepancyResolutionNote?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  discrepancyMetadata?: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  discrepancyResolvedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  discrepancyResolvedByUserId?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  discrepancyApprovedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  discrepancyApprovedByUserId?: number | null;

  @Column({ type: 'text', nullable: true })
  discrepancyApprovalNote?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
