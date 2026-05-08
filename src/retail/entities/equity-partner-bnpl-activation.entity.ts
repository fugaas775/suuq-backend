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

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'int', nullable: true })
  tenantSubscriptionId?: number | null;

  @Column({ type: 'int' })
  targetOwnerUserId!: number;

  /** 'SIX_MONTHS' | 'ONE_YEAR' (mirrors PosBranchSubscriptionPeriod). */
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
