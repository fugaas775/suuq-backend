import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** What the payment is for. */
export type SubscriptionPaymentClaimKind =
  | 'POS_BRANCH'
  | 'POS_BRANCH_CREATE'
  | 'SUPPLIER'
  | 'BNPL';

export type SubscriptionPaymentClaimStatus =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED';

/**
 * A customer's statement that they have paid for a subscription: how much, by
 * which channel, the transaction number their bank or wallet gave them, and the
 * receipt they attached. Nothing is granted on the customer's word — an admin
 * checks it against the account and approves, and approval is what creates the
 * term.
 *
 * `referenceId` is the same reference the term-granting code keys on
 * (`POSACT-…`, `POSBRANCH-…`, `SUPACT-…`, `BNPLACT-…`), so approving a claim
 * runs exactly the path a confirmed payment always ran.
 */
@Entity('subscription_payment_claims')
export class SubscriptionPaymentClaim {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 96 })
  referenceId!: string;

  @Column({ type: 'varchar', length: 24 })
  kind!: SubscriptionPaymentClaimKind;

  @Index()
  @Column({ type: 'varchar', length: 12, default: 'SUBMITTED' })
  status!: SubscriptionPaymentClaimStatus;

  /** Who submitted it. */
  @Column({ type: 'int' })
  userId!: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  branchId?: number | null;

  @Column({ type: 'int', nullable: true })
  tenantId?: number | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  supplierProfileId?: number | null;

  @Column({ type: 'int', nullable: true })
  bnplActivationId?: number | null;

  /** Branch / supplier name at the time, so the queue reads without joins. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  subjectName?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  period?: string | null;

  @Column({ type: 'int', nullable: true })
  periodMonths?: number | null;

  /** The amount billed — what the transfer must be for. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  /** EBIRR | CBE — which of the two destinations the money was sent to. */
  @Column({ type: 'varchar', length: 12 })
  channel!: string;

  /** The transaction number on the customer's own receipt. */
  @Column({ type: 'varchar', length: 80 })
  payerReference!: string;

  /** Name or number the money came from, as the customer gave it. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  payerName?: string | null;

  /** The attached receipt (image or PDF), when one was attached. */
  @Column({ type: 'text', nullable: true })
  receiptUrl?: string | null;

  @Column({ type: 'int', nullable: true })
  reviewedByUserId?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;

  /** Why it was rejected, or a note left on approval. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  reviewNote?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
