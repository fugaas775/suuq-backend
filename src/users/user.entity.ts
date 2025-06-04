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
import { DeviceToken } from '../notifications/device-token.entity';
import { MediaEntity } from '../media/media.entity';
import { Product } from '../products/entities/product.entity';

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

  @Column()
  password!: string;

  @Column({
    type: 'simple-array',
    default: UserRole.CUSTOMER,
  })
  roles!: UserRole[];

  @OneToMany(() => DeviceToken, (token) => token.user)
  deviceTokens!: DeviceToken[];

  @OneToMany(() => MediaEntity, (media) => media.owner)
  media!: MediaEntity[];

  @OneToMany(() => Product, (product) => product.vendor)
  products!: Product[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date; // Soft delete field

  // --- Audit fields ---
  @Column({ nullable: true })
  createdBy?: string; // Store user id or email of creator

  @Column({ nullable: true })
  updatedBy?: string; // Store user id or email of last updater

  @Column({ nullable: true })
  deletedBy?: string; // Store user id or email of deleter

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
