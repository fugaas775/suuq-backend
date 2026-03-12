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
import { PartnerCredential } from '../../partner-credentials/entities/partner-credential.entity';

export enum PosSyncType {
  STOCK_SNAPSHOT = 'STOCK_SNAPSHOT',
  STOCK_DELTA = 'STOCK_DELTA',
  SALES_SUMMARY = 'SALES_SUMMARY',
}

export enum PosSyncStatus {
  RECEIVED = 'RECEIVED',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

@Entity('pos_sync_jobs')
export class PosSyncJob {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  branchId?: number | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch | null;

  @Column({ type: 'int', nullable: true })
  partnerCredentialId?: number | null;

  @ManyToOne(() => PartnerCredential, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'partnerCredentialId' })
  partnerCredential?: PartnerCredential | null;

  @Column({ type: 'enum', enum: PosSyncType })
  syncType!: PosSyncType;

  @Column({
    type: 'enum',
    enum: PosSyncStatus,
    default: PosSyncStatus.RECEIVED,
  })
  status!: PosSyncStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalJobId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotencyKey?: string | null;

  @Column({ type: 'int', default: 0 })
  acceptedCount!: number;

  @Column({ type: 'int', default: 0 })
  rejectedCount!: number;

  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
