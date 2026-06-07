import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A single posted charge on a property rental booking (rent, utilities,
 * maintenance, deposit, late fee, etc.). Month-based analogue of
 * HotelFolioCharge. Independent of the HOTEL charge table.
 */
@Entity('pos_property_rental_booking_charges')
@Index('idx_pos_property_charge_booking', ['bookingId'])
@Index('idx_pos_property_charge_branch_created', ['branchId', 'createdAt'])
export class PropertyRentalBookingCharge {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  bookingId!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /**
   * RENT | UTILITIES | MAINTENANCE | CLEANING | SECURITY_DEPOSIT | LATE_FEES |
   * PARKING | OTHER_FEES
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  chargeGroupCode!: string | null;

  @Column({ type: 'varchar', length: 255 })
  chargeName!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  /** When true, this charge is mirrored onto the next billing cycle. */
  @Column({ type: 'boolean', default: false })
  recurring!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotencyKey!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
