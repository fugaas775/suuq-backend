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

/**
 * Represents a consumer-facing store profile that maps 1:1 to a POS branch.
 * When a branch is created, a VendorStore is automatically provisioned.
 * The ownerUserId links to the same User entity that serves as the Vendor identity.
 */
@Entity('vendor_stores')
export class VendorStore {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  ownerUserId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'ownerUserId' })
  owner!: User;

  /** FK to branches.id — unique so each branch has at most one consumer store. */
  @Column({ type: 'int', nullable: true, unique: true })
  branchId?: number | null;

  @Column({ type: 'varchar', length: 255 })
  storeName!: string;

  /** When false, the store is hidden from the consumer app listing. */
  @Column({ type: 'boolean', default: true })
  isConsumerVisible!: boolean;

  /** Mirrors branch.serviceFormat: RETAIL | HOTEL | CAFETERIA | QSR | FSR | BARBER */
  @Column({ type: 'varchar', length: 32, nullable: true })
  serviceFormat?: string | null;

  /** Public cover image URL (CDN path). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  coverImageUrl?: string | null;

  /**
   * Operating hours in a day-keyed JSON structure, e.g.:
   * { "MON": { "open": "08:00", "close": "22:00" }, "SUN": { "closed": true } }
   */
  @Column({ type: 'jsonb', nullable: true })
  operatingHours?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
