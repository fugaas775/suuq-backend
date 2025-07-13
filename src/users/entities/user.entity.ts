import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { DeviceToken } from '../../notifications/entities/device-token.entity';
import { MediaEntity } from '../../media/entities/media.entity';
import { Product } from '../../products/entities/product.entity';
import { Review } from '../../reviews/entities/review.entity';
import { UserRole } from '../../auth/roles.enum'; // <-- IMPORT the centralized UserRole enum


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
    type: 'simple-array',
    enum: UserRole, // Use the imported enum
    default: UserRole.CUSTOMER,
  })
  roles!: UserRole[];

  // --- Profile fields ---
  @Column({ nullable: true })
  displayName?: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ nullable: true })
  storeName?: string;

  // --- Phone Number Block ---
  @Column({ nullable: true, length: 10 }) // For codes like '+251'
  phoneCountryCode?: string;

  @Column({ nullable: true, length: 20 }) // For the main number
  phoneNumber?: string;

  @Column({ default: false })
  isPhoneVerified!: boolean;
  
  @Column({ default: true })
  isActive!: boolean;

  // --- Google SSO ---
  @Column({ nullable: true })
  @Index()
  googleId?: string;

  // --- Relationships ---
  @OneToMany(() => DeviceToken, (token: DeviceToken) => token.user)
  deviceTokens!: DeviceToken[];

  @OneToMany(() => MediaEntity, (media: MediaEntity) => media.owner)
  media!: MediaEntity[];

  @OneToMany(() => Product, (product: Product) => product.vendor)
  products!: Product[];

  // --- Currency for vendor profile ---
  @Column({ nullable: true, length: 3 })
  currency?: string; // e.g., 'ETB', 'KES'

  @OneToMany(() => Review, review => review.user)
  reviews!: Review[];

  // --- Password Reset ---
  @Column({ nullable: true })
  passwordResetToken?: string;

  @Column({ nullable: true })
  passwordResetExpires?: Date;
  
  // --- Timestamps & Audit ---
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @Column({ nullable: true })
  createdBy?: string;

  @Column({ nullable: true })
  updatedBy?: string;

  @Column({ nullable: true })
  deletedBy?: string;
}