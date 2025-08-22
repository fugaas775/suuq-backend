export enum VerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
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
import { Product } from '../../products/entities/product.entity';
import { Review } from '../../reviews/entities/review.entity';

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

  @Column({ nullable: true })
  password?: string;

  @Column({
    type: 'text',
    array: true,
    enum: UserRole,
    default: [UserRole.CUSTOMER],
  })
  roles!: UserRole[];

  // --- Profile fields ---
  @Column({ nullable: true })
  displayName?: string;

  @Column({ nullable: true })
  avatarUrl?: string;

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
    type: 'jsonb',
    nullable: true,
    default: '[]',
  })
  verificationDocuments?: VerificationDocument[] | null;

  @Column({ default: false })
  verified!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt?: Date | null;

  @Column({ default: true })
  isActive!: boolean;

  // --- Google SSO ---
  @Column({ nullable: true })
  @Index()
  googleId?: string;

  // --- Relationships ---
  @OneToMany(() => Product, (product: Product) => product.vendor)
  products!: Product[];

  @OneToMany(() => Review, (review) => review.user)
  reviews!: Review[];

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
  @Column({ type: 'varchar', length: 64, nullable: true })
  bankAccountNumber?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  bankName?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  mobileMoneyNumber?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  mobileMoneyProvider?: string | null;

  // --- Password Reset ---
  @Column({ nullable: true })
  passwordResetToken?: string;

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