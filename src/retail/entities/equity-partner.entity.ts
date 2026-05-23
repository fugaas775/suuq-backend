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
import { User } from '../../users/entities/user.entity';
import { EquitySplitAssignment } from './equity-split-assignment.entity';
import { EquityPayout } from './equity-payout.entity';

export enum EquityPartnerStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity('equity_partners')
export class EquityPartner {
  @PrimaryGeneratedColumn()
  id!: number;

  /**
   * Optional link to the POS seller user who submitted the application.
   * Null when an admin creates a partner record directly.
   */
  @Column({ type: 'int', nullable: true })
  @Index({ unique: true, where: '"userId" IS NOT NULL' })
  userId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User | null;

  @Column({ type: 'varchar', length: 255 })
  displayName!: string;

  @Column({ type: 'varchar', length: 64 })
  phone!: string;

  /**
   * Optional bank / mobile-money details for manual payout transfers.
   * Example: { bankName: 'CBE', accountNumber: '1000123456789' }
   */
  @Column({ type: 'jsonb', nullable: true })
  bankAccountInfo?: Record<string, string> | null;

  /**
   * Unique referral code generated on approval.
   * Format: PART-XXXX (8 chars, uppercase alphanumeric).
   * Null until partner is approved (status → ACTIVE).
   */
  @Column({ type: 'varchar', length: 16, nullable: true, unique: true })
  referralCode?: string | null;

  /**
   * Optional referrer (another EquityPartner). When set, every payout to
   * this partner triggers a smaller cascade payout to the referrer using
   * the partner's tier numerator/denominator (default 1/10).
   */
  @Column({ type: 'int', nullable: true })
  referrerEquityPartnerId?: number | null;

  /** Cascade payout numerator (referrer's cut of this partner's payout). */
  @Column({ type: 'int', default: 1 })
  tierNumerator!: number;

  /** Cascade payout denominator. */
  @Column({ type: 'int', default: 10 })
  tierDenominator!: number;

  /**
   * Maximum number of simultaneously OUTSTANDING BNPL branch activations
   * the partner is allowed to carry at once. Admin-adjustable per partner.
   */
  @Column({ type: 'int', default: 5 })
  bnplCreditLimit!: number;

  @Column({
    type: 'enum',
    enum: EquityPartnerStatus,
    default: EquityPartnerStatus.PENDING,
  })
  status!: EquityPartnerStatus;

  /** Admin-only notes about this partner. */
  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  /**
   * The retail tenant this partner uses to host BNPL-funded branches.
   * Populated on first successful BNPL activation (resolved from the
   * partner's owned branch) and persisted here so branch transfers do
   * not break subsequent activations.
   */
  @Column({ type: 'int', nullable: true })
  hostRetailTenantId?: number | null;

  @OneToMany(() => EquitySplitAssignment, (a) => a.partner)
  assignments!: EquitySplitAssignment[];

  @OneToMany(() => EquityPayout, (p) => p.partner)
  payouts!: EquityPayout[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
