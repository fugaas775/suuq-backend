import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum HotelReservationStatus {
  HOLD = 'HOLD',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  CHECKED_OUT = 'CHECKED_OUT',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

@Entity('pos_hotel_reservations')
@Index('idx_pos_hotel_res_branch', ['branchId'])
@Index('idx_pos_hotel_res_branch_status', ['branchId', 'status'])
@Index('idx_pos_hotel_res_checkin', ['branchId', 'checkInAt'])
export class HotelReservation {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({
    type: 'varchar',
    length: 24,
    default: HotelReservationStatus.CONFIRMED,
  })
  status!: HotelReservationStatus;

  /** Specific room assigned, or null until check-in */
  @Column({ type: 'varchar', length: 64, nullable: true })
  roomNumber!: string | null;

  /** Room type requested (e.g. 'STANDARD', 'SUITE') */
  @Column({ type: 'varchar', length: 64, nullable: true })
  roomType!: string | null;

  @Column({ type: 'varchar', length: 255 })
  guestName!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  guestPhone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  guestEmail!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  guestNationality!: string | null;

  /** PASSPORT, NATIONAL_ID, DRIVING_LICENSE, etc. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  guestIdType!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  guestIdNumber!: string | null;

  @Column({ type: 'int', nullable: true, default: 1 })
  numberOfGuests!: number | null;

  /** Expected check-in date (YYYY-MM-DD) */
  @Column({ type: 'date' })
  checkInAt!: string;

  /** Expected check-out date (YYYY-MM-DD) */
  @Column({ type: 'date' })
  checkOutAt!: string;

  /** FK to pos_hotel_rate_plans.id — nullable until assigned */
  @Column({ type: 'bigint', nullable: true })
  ratePlanId!: number | null;

  /** FK to pos_hotel_folios.id — set when guest checks in */
  @Column({ type: 'bigint', nullable: true })
  folioId!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /** User id who created the reservation */
  @Column({ type: 'int', nullable: true })
  createdByUserId!: number | null;

  /**
   * Origin of the reservation.
   * 'POS' = created via the POS terminal.
   * 'CONSUMER_APP' = created by the customer through the Suuq consumer app.
   */
  @Column({ type: 'varchar', length: 32, default: 'POS' })
  source!: string;

  /**
   * FK to users.id — the consumer who booked via the app.
   * Null for walk-in / POS-created reservations.
   */
  @Column({ type: 'int', nullable: true })
  customerUserId!: number | null;

  /**
   * Payment session or transaction reference from the payment gateway
   * (Ebirr, Telebirr, M-Pesa, etc.). Null until consumer pays.
   */
  @Column({ type: 'varchar', length: 128, nullable: true })
  paymentSessionId!: string | null;

  /**
   * Status of the consumer prepayment.
   * PENDING → PAID → REFUNDED | FAILED
   */
  @Column({ type: 'varchar', length: 24, nullable: true })
  prepaymentStatus!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
