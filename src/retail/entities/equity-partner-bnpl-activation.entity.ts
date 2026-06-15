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
import { EquityPartner } from './equity-partner.entity';

export enum EquityPartnerBnplStatus {
  OUTSTANDING = 'OUTSTANDING',
  SETTLED = 'SETTLED',
  FORGIVEN = 'FORGIVEN',
  CANCELLED = 'CANCELLED',
}

/**
 * What an equity partner funded. 'BRANCH' (default, legacy) funds a POS branch;
 * 'SUPPLIER' funds a branch-independent supplier (wholesaler) account.
 */
export type EquityPartnerBnplAccountKind = 'BRANCH' | 'SUPPLIER';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * Records that an equity partner activated a branch on Buy-Now-Pay-Later
 * terms. The branch and its tenant subscription are created immediately and
 * transferred to the target end-user; `amountDue` stores the gross prepaid
 * branch fee, `equityCreditAmount` stores the partner's earned share for that
 * period, and `settlementAmountDue` is the net amount still owed until
 * `dueAt` (= subscription endsAt).
 */
@Entity('equity_partner_bnpl_activations')
@Index(['equityPartnerId', 'status'])
export class EquityPartnerBnplActivation {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  equityPartnerId!: number;

  @ManyToOne(() => EquityPartner, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equityPartnerId' })
  partner?: EquityPartner;

  /**
   * What was funded. 'BRANCH' rows carry a `branchId`; 'SUPPLIER' rows carry a
   * `supplierProfileId` and leave `branchId` null.
   */
  @Column({ type: 'varchar', length: 16, default: 'BRANCH' })
  accountKind!: EquityPartnerBnplAccountKind;

  /** Set for accountKind='BRANCH'; null for supplier-funded activations. */
  @Column({ type: 'int', nullable: true })
  branchId?: number | null;

  /** Set for accountKind='SUPPLIER'; null for branch-funded activations. */
  @Column({ type: 'int', nullable: true })
  supplierProfileId?: number | null;

  @Column({ type: 'int', nullable: true })
  tenantSubscriptionId?: number | null;

  @Column({ type: 'int' })
  targetOwnerUserId!: number;

  /** 'ONE_YEAR' for new BNPL activations (legacy rows may be 'SIX_MONTHS'). */
  @Column({ type: 'varchar', length: 16 })
  period!: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amountDue!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: 0,
  })
  equityCreditAmount!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: 0,
  })
  settlementAmountDue!: number;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({
    type: 'enum',
    enum: EquityPartnerBnplStatus,
    enumName: 'equity_partner_bnpl_status_enum',
    default: EquityPartnerBnplStatus.OUTSTANDING,
  })
  status!: EquityPartnerBnplStatus;

  @Column({ type: 'timestamp' })
  dueAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  settledAt?: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  settlementReferenceId?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
