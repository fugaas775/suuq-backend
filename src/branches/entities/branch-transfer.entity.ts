import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Branch } from './branch.entity';

export enum BranchTransferStatus {
  REQUESTED = 'REQUESTED',
  DISPATCHED = 'DISPATCHED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

@Entity('branch_transfers')
@Index(['status', 'createdAt'])
@Index(['sourceType', 'sourceReferenceId'])
export class BranchTransfer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  transferNumber!: string;

  @Column({ type: 'int' })
  fromBranchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromBranchId' })
  fromBranch!: Branch;

  @Column({ type: 'int' })
  toBranchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toBranchId' })
  toBranch!: Branch;

  @Column({
    type: 'enum',
    enum: BranchTransferStatus,
    default: BranchTransferStatus.REQUESTED,
  })
  status!: BranchTransferStatus;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sourceType?: string | null;

  @Column({ type: 'int', nullable: true })
  sourceReferenceId?: number | null;

  @Column({ type: 'int', nullable: true })
  sourceEntryIndex?: number | null;

  @Column({ type: 'int', nullable: true })
  requestedByUserId?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  requestedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  dispatchedByUserId?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  dispatchedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  receivedByUserId?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  cancelledByUserId?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'::jsonb" })
  statusMeta?: Record<string, any> | null;

  @OneToMany(() => BranchTransferItem, (item) => item.transfer, {
    cascade: true,
    eager: true,
  })
  items!: BranchTransferItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('branch_transfer_items')
@Index(['transferId', 'productId'], { unique: true })
export class BranchTransferItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  transferId!: number;

  @ManyToOne(() => BranchTransfer, (transfer) => transfer.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transferId' })
  transfer!: BranchTransfer;

  @Column({ type: 'int' })
  productId!: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;
}
