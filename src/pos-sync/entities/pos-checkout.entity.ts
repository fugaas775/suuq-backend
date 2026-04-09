import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { PartnerCredential } from '../../partner-credentials/entities/partner-credential.entity';
import { ProductAliasType } from '../../product-aliases/entities/product-alias.entity';
import { PosRegisterSession } from './pos-register-session.entity';
import { PosSuspendedCart } from './pos-suspended-cart.entity';

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string | number) =>
    typeof value === 'string' ? parseFloat(value) : value,
};

export enum PosCheckoutTransactionType {
  SALE = 'SALE',
  RETURN = 'RETURN',
}

export enum PosCheckoutStatus {
  RECEIVED = 'RECEIVED',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export type PosCheckoutItem = {
  productId?: number | null;
  aliasType?: ProductAliasType | null;
  aliasValue?: string | null;
  sku?: string | null;
  title?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount?: number | null;
  taxAmount?: number | null;
  lineTotal: number;
  note?: string | null;
  reasonCode?: string | null;
  metadata?: Record<string, any> | null;
};

export type PosCheckoutTender = {
  method: string;
  amount: number;
  reference?: string | null;
  note?: string | null;
  metadata?: Record<string, any> | null;
};

@Entity('pos_checkouts')
@Index(['branchId', 'idempotencyKey'], { unique: true })
@Index(['branchId', 'externalCheckoutId'], { unique: true })
export class PosCheckout {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'int', nullable: true })
  partnerCredentialId?: number | null;

  @ManyToOne(() => PartnerCredential, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'partnerCredentialId' })
  partnerCredential?: PartnerCredential | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalCheckoutId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotencyKey?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  registerId?: string | null;

  @Column({ type: 'int', nullable: true })
  registerSessionId?: number | null;

  @ManyToOne(() => PosRegisterSession, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'registerSessionId' })
  registerSession?: PosRegisterSession | null;

  @Column({ type: 'int', nullable: true })
  suspendedCartId?: number | null;

  @ManyToOne(() => PosSuspendedCart, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'suspendedCartId' })
  suspendedCart?: PosSuspendedCart | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  receiptNumber?: string | null;

  @Column({ type: 'enum', enum: PosCheckoutTransactionType })
  transactionType!: PosCheckoutTransactionType;

  @Column({
    type: 'enum',
    enum: PosCheckoutStatus,
    default: PosCheckoutStatus.RECEIVED,
  })
  status!: PosCheckoutStatus;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  subtotal!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  discountAmount!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  taxAmount!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  total!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  paidAmount!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  changeDue!: number;

  @Column({ type: 'int', default: 0 })
  itemCount!: number;

  @Column({ type: 'timestamp' })
  occurredAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  cashierUserId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cashierName?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tenders!: PosCheckoutTender[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  items!: PosCheckoutItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
