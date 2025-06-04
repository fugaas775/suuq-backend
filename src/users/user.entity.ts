import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
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
  email!: string;

  @Column()
  password!: string;

  @Column({
    type: 'simple-array',
    default: [UserRole.CUSTOMER],
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

  @Column({ nullable: true })
  displayName?: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ nullable: true }) // Added based on TS error in AuthService
  storeName?: string;

  @Column({ nullable: true })
  googleId?: string;
}
