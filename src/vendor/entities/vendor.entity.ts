import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity()
export class Vendor {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: false })
  store_name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  legal_name?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  business_license_number?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  tax_id?: string | null;

  @Column({ nullable: false, length: 2 })
  @Index()
  registration_country!: string; // "ET", "SO", "DJ", "KE"

  @Column({ type: 'varchar', length: 128, nullable: true })
  registration_region?: string | null; // e.g., Oromia, Nairobi

  @Column({ type: 'varchar', length: 128, nullable: true })
  registration_city?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  business_type?: string | null; // e.g., "Sole Proprietor", "PLC"

  @Column({ type: 'varchar', length: 128, nullable: true })
  contact_name?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone_number?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  postal_code?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar_url?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  facebook_url?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  instagram_url?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  twitter_url?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  telegram_url?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tiktok_url?: string | null;

  @Column({ default: false })
  verified!: boolean;

  @Column({ type: 'text', nullable: true })
  about?: string | null;

  @Column({ type: 'boolean', nullable: true, default: true })
  is_active?: boolean;

  @Column({ type: 'boolean', nullable: true, default: false })
  featured?: boolean;

  @Column({ type: 'int', nullable: true })
  years_on_platform?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at?: Date | null;

  @Column({ type: 'float', nullable: true, default: 0 })
  rating?: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  number_of_sales?: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  preferred_language?: string | null; // "en", "am", "so", "sw", "fr"

  @Column('simple-array', { nullable: true })
  supported_currencies?: string[] | null; // ["ETB", "USD", "KES", "SOS", "DJF"]

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone?: string | null; // e.g., "Africa/Nairobi"

  // Payment Fields
  @Column({ type: 'varchar', length: 64, nullable: true })
  bank_account_number?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  bank_name?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  mobile_money_number?: string | null; // e.g., M-Pesa, Telebirr, Hormuud

  @Column({ type: 'varchar', length: 32, nullable: true })
  mobile_money_provider?: string | null; // "M-Pesa", "Telebirr", etc.

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
