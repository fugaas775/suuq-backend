import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PropertyReservationStatus {
  HOLD = 'HOLD',
  CONFIRMED = 'CONFIRMED',
  MOVED_IN = 'MOVED_IN',
  MOVED_OUT = 'MOVED_OUT',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

/**
 * A future property booking (reservation) before move-in. Month-based analogue
 * of HotelReservation. Independent of the HOTEL reservation table.
 */
@Entity('pos_property_reservations')
@Index('idx_pos_property_reservation_branch', ['branchId'])
@Index('idx_pos_property_reservation_branch_status', ['branchId', 'status'])
@Index('idx_pos_property_reservation_branch_start', [
  'branchId',
  'leaseStartAt',
])
export class PropertyReservation {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({
    type: 'varchar',
    length: 16,
    default: PropertyReservationStatus.HOLD,
  })
  status!: PropertyReservationStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  propertyCode!: string | null;

  @Column({ type: 'varchar', length: 255 })
  renterName!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  renterPhone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  renterEmail!: string | null;

  @Column({ type: 'int', nullable: true })
  numberOfOccupants!: number | null;

  @Column({ type: 'date', nullable: true })
  leaseStartAt!: string | null;

  @Column({ type: 'date', nullable: true })
  leaseEndAt!: string | null;

  @Column({ type: 'bigint', nullable: true })
  ratePlanId!: number | null;

  /** Set once the reservation is converted into an open booking. */
  @Column({ type: 'bigint', nullable: true })
  bookingId!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
