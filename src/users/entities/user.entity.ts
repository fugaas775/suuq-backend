export enum VerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export enum SubscriptionTier {
  FREE = 'free',
  PRO = 'pro',
}

export enum CertificationStatus {
  CERTIFIED = 'certified',
  UNCERTIFIED = 'uncertified',
}

export const isCertifiedVendor = (
  user:
    | Pick<User, 'verified' | 'verificationStatus'>
    | { verified?: boolean; verificationStatus?: VerificationStatus },
): boolean => {
  return (
    !!user?.verified || user?.verificationStatus === VerificationStatus.APPROVED
  );
};

export const resolveCertificationStatus = (
  user:
    | Pick<User, 'verified' | 'verificationStatus'>
    | { verified?: boolean; verificationStatus?: VerificationStatus },
): CertificationStatus => {
  return isCertifiedVendor(user)
    ? CertificationStatus.CERTIFIED
    : CertificationStatus.UNCERTIFIED;
};

export enum BusinessModel {
  SUBSCRIPTION = 'SUBSCRIPTION',
  COMMISSION = 'COMMISSION',
}

import {
  Entity,
  PrimaryGeneratedColumn, // <-- ADDED THIS
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { UserRole } from '../../auth/roles.enum';
import { Exclude } from 'class-transformer';
import { Product } from '../../products/entities/product.entity';
import { Review } from '../../reviews/entities/review.entity';
import { Notification } from '../../notifications/entities/notification.entity';

export interface BusinessLicenseInfo {
  tradeName: string;
  legalCondition: string;
  capital: string;
  registeredDate: string;
  renewalDate: string;
  status: string;
}

export enum VerificationMethod {
  AUTOMATIC = 'AUTOMATIC',
  MANUAL = 'MANUAL',
  NONE = 'NONE',
}

export interface VerificationDocument {
  url: string;
  name: string;
}

@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  // --- ADDED: Firebase UID for linking accounts ---
  @Column({ unique: true, nullable: true }) // Must be unique; nullable for flexibility
  @Index()
  firebaseUid?: string;

  @Column({ unique: true })
  @Index()
  email!: string;

  @Exclude()
  @Column({ nullable: true })
  password?: string;

  @Column({
    type: 'text',
    array: true,
    enum: UserRole,
    default: [UserRole.CUSTOMER],
  })
  roles!: UserRole[];

  @Column({
    type: 'enum',
    enum: SubscriptionTier,
    default: SubscriptionTier.FREE,
  })
  subscriptionTier!: SubscriptionTier;

  @Column({
    type: 'enum',
    enum: BusinessModel,
    default: BusinessModel.COMMISSION,
  })
  businessModel!: BusinessModel;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0.05, // 5%
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) =>
        typeof value === 'string' ? parseFloat(value) : value,
    },
  })
  commissionRate!: number;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionExpiry?: Date | null;

  @Column({ default: true })
  autoRenew!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastRenewalReminderAt?: Date | null;

  @Column({ default: 0 })
  renewalReminderCount!: number;

  // --- Profile fields ---
  @Column({ nullable: true })
  displayName?: string;

  @Column({ default: false })
  telebirrVerified!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  telebirrVerifiedAt?: Date | null;

  @Column({ nullable: true })
  avatarUrl?: string;

  // New language preference field
  @Column({ default: 'en', length: 5 })
  language!: string;

  @Column({ nullable: true })
  storeName?: string;

  // --- Vendor Business Fields (from Vendor entity) ---
  @Column({ type: 'varchar', length: 255, nullable: true })
  legalName?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  businessLicenseNumber?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  taxId?: string | null;

  @Column({ nullable: true, length: 2 })
  registrationCountry?: string; // "ET", "SO", "DJ", "KE"

  @Column({ type: 'varchar', length: 128, nullable: true })
  registrationRegion?: string | null; // e.g., Oromia, Nairobi

  @Column({ type: 'varchar', length: 128, nullable: true })
  registrationCity?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  businessType?: string | null; // e.g., "Sole Proprietor", "PLC"

  @Column({ type: 'varchar', length: 128, nullable: true })
  contactName?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  vendorPhoneNumber?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vendorEmail?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  postalCode?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vendorAvatarUrl?: string | null;

  // (telegramUrl removed)

  // --- Phone Number Block ---
  @Column({ nullable: true, length: 10 }) // For codes like '+251'
  phoneCountryCode?: string;

  @Column({ nullable: true, length: 20 }) // For the main number
  phoneNumber?: string;

  @Column({ default: false })
  isPhoneVerified!: boolean;

  // --- User Verification Fields ---
  @Column({
    type: 'enum',
    enum: VerificationStatus,
    default: VerificationStatus.UNVERIFIED,
  })
  verificationStatus!: VerificationStatus;

  @Column({
    type: 'enum',
    enum: VerificationMethod,
    default: VerificationMethod.NONE,
  })
  verificationMethod!: VerificationMethod;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  businessLicenseInfo?: BusinessLicenseInfo | null;

  @Exclude()
  @Column({
    type: 'jsonb',
    nullable: true,
    default: '[]',
  })
  verificationDocuments?: VerificationDocument[] | null;

  @Column({ default: false })
  verified!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt?: Date | null;

  // Reason provided when verification is rejected (admin supplied)
  @Column({ type: 'text', nullable: true })
  verificationRejectionReason?: string | null;

  // Reviewer metadata
  @Column({ type: 'varchar', length: 255, nullable: true })
  verificationReviewedBy?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  verificationReviewedAt?: Date | null;

  @Column({ default: true })
  isActive!: boolean;

  // --- Google SSO ---
  @Column({ nullable: true })
  @Index()
  googleId?: string;

  // --- Apple SSO ---
  @Column({ nullable: true })
  @Index()
  appleId?: string;

  // --- Relationships ---
  @OneToMany(() => Product, (product: Product) => product.vendor)
  products!: Product[];

  @OneToMany(() => Review, (review) => review.user)
  reviews!: Review[];

  @OneToMany(() => Notification, (notification) => notification.recipient)
  notifications: Notification[];

  // --- Vendor currency (for unified vendor logic) ---
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string | null;

  @Column({ type: 'int', nullable: true })
  yearsOnPlatform?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date | null;

  @Column({ type: 'float', nullable: true, default: 0 })
  rating?: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  numberOfSales?: number | null;

  @Column({ type: 'int', array: true, nullable: true })
  interestedCategoryIds?: number[];

  @Column({ type: 'timestamp', nullable: true })
  interestedCategoriesLastUpdated?: Date | null;

  // --- Optional location for proximity sorting (deliverers/vendors) ---
  @Column({ type: 'float', nullable: true })
  locationLat?: number | null;

  @Column({ type: 'float', nullable: true })
  locationLng?: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  preferredLanguage?: string | null;

  @Column('simple-array', { nullable: true })
  supportedCurrencies?: string[] | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone?: string | null;

  // Payment Fields
  @Exclude()
  @Column({ type: 'varchar', length: 64, nullable: true })
  bankAccountNumber?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  bankName?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  bankAccountHolderName?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  mobileMoneyNumber?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  telebirrAccount?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  mobileMoneyProvider?: string | null;

  // --- Password Reset ---
  @Exclude()
  @Column({ nullable: true })
  passwordResetToken?: string;

  @Exclude()
  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpires?: Date;

  // --- Timestamps & Audit ---
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @Column({ nullable: true })
  updatedBy?: string;

  @Column({ nullable: true })
  deletedBy?: string;
}
