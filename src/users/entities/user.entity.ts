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
import { MediaEntity } from '../../media/entities/media.entity'; // <-- FIXED IMPORT
import { Product } from '../../products/entities/product.entity'; // <-- FIXED IMPORT

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  VENDOR = 'VENDOR',
  ADMIN = 'ADMIN',
  DELIVERER = 'DELIVERER',
}

@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  @Index()
  email!: string;

  // Password is optional for SSO users
  @Column({ nullable: true })
  password?: string;

  @Column({
    type: 'simple-array',
    default: UserRole.CUSTOMER,
  })
  roles!: UserRole[];

  @OneToMany(() => DeviceToken, (token: DeviceToken) => token.user)
  deviceTokens!: DeviceToken[];

  @OneToMany(() => MediaEntity, (media: MediaEntity) => media.owner)
  media!: MediaEntity[];

  @OneToMany(() => Product, (product: Product) => product.vendor)
  products!: Product[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date; // Soft delete field

  // --- Audit fields ---
  @Column({ nullable: true })
  createdBy?: string;

  @Column({ nullable: true })
  updatedBy?: string;

  @Column({ nullable: true })
  deletedBy?: string;

  // --- Profile fields ---
  @Column({ nullable: true })
  displayName?: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ nullable: true })
  storeName?: string;

  @Column({ default: true })
  isActive!: boolean;

  // --- Google SSO ---
  @Column({ nullable: true })
  @Index()
  googleId?: string;

  // --- Phone Number & Verification ---
  @Column({ nullable: true, length: 20 })
  phoneNumber?: string;

  @Column({ default: false })
  isPhoneVerified!: boolean;
}