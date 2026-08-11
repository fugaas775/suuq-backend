import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SupplierOnboardingStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Billing/go-live lifecycle of a supplier account. Independent of the
 * onboardingStatus KYC track: payment (not admin review) is the go-live gate,
 * so a supplier can publish offers and receive purchase orders only once
 * activationStatus === ACTIVE. Mirrors the POS-workspace activation model.
 */
export enum SupplierActivationStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

@Entity('supplier_profiles')
export class SupplierProfile {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 255 })
  companyName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  legalName?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  taxId?: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  countriesServed!: string[];

  @Column({
    type: 'enum',
    enum: SupplierOnboardingStatus,
    default: SupplierOnboardingStatus.DRAFT,
  })
  onboardingStatus!: SupplierOnboardingStatus;

  @Column({
    type: 'enum',
    enum: SupplierActivationStatus,
    default: SupplierActivationStatus.PENDING_PAYMENT,
  })
  activationStatus!: SupplierActivationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastActivatedAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payoutDetails?: string | null;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
