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
import {
  EquityPartnerBnplActivation,
  EquityPartnerBnplStatus,
} from './equity-partner-bnpl-activation.entity';

export enum EquityPartnerBnplCreditLedgerEntryType {
  CREDIT_APPLIED = 'CREDIT_APPLIED',
}

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? null : Number(value),
};

@Entity('equity_partner_bnpl_credit_ledger')
@Index(['equityPartnerId', 'createdAt'])
@Index(['bnplActivationId'], { unique: true })
export class EquityPartnerBnplCreditLedgerEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  equityPartnerId!: number;

  @ManyToOne(() => EquityPartner, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equityPartnerId' })
  partner?: EquityPartner;

  @Column({ type: 'int' })
  bnplActivationId!: number;

  @ManyToOne(() => EquityPartnerBnplActivation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bnplActivationId' })
  activation?: EquityPartnerBnplActivation;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'int' })
  targetOwnerUserId!: number;

  @Column({ type: 'varchar', length: 16 })
  period!: string;

  @Column({
    type: 'enum',
    enum: EquityPartnerBnplCreditLedgerEntryType,
    default: EquityPartnerBnplCreditLedgerEntryType.CREDIT_APPLIED,
  })
  entryType!: EquityPartnerBnplCreditLedgerEntryType;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  grossAmount!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  equityCreditAmount!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
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
  activationStatus!: EquityPartnerBnplStatus;

  @Column({ type: 'varchar', length: 128, nullable: true })
  settlementReferenceId?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
