import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PropertyRentalBookingStatus {
  OPEN = 'OPEN',
  SETTLED = 'SETTLED',
  VOIDED = 'VOIDED',
}

export enum PropertyRentalBillingCycle {
  MONTH = 'MONTH',
  WEEK = 'WEEK',
}

export enum PropertyTenantType {
  INDIVIDUAL = 'INDIVIDUAL',
  BUSINESS = 'BUSINESS',
}

/**
 * One instalment recorded against an OPEN booking (partial rent payment).
 * The cumulative sum is kept on `paidAmount`; this array is the audit ledger.
 */
export interface PropertyBookingPaymentRecord {
  amount: number;
  method: string;
  currency: string;
  reference: string | null;
  checkoutId: string | null;
  idempotencyKey: string | null;
  paidAt: string;
}

/**
 * A property rental booking (lease) — the month-based analogue of a hotel
 * folio. One row per renter occupying one property unit. Independent of the
 * HOTEL `pos_hotel_folios` table.
 */
@Entity('pos_property_rental_bookings')
@Index('idx_pos_property_booking_branch_status', ['branchId', 'status'])
@Index('idx_pos_property_booking_local_ref', ['localRef'])
@Index('idx_pos_property_booking_branch_created', ['branchId', 'createdAt'])
export class PropertyRentalBooking {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** Client-side local suspended-cart id (e.g. 'property-local-92') */
  @Column({ type: 'varchar', length: 255, nullable: true })
  localRef!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: PropertyRentalBookingStatus.OPEN,
  })
  status!: PropertyRentalBookingStatus;

  /** Free-form property code/identifier, e.g. 'APT-3B'. */
  @Column({ type: 'varchar', length: 64 })
  propertyCode!: string;

  /** FK to pos_property_units.id — null when the property is not in the registry. */
  @Column({ type: 'bigint', nullable: true })
  propertyId!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  renterName!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  renterPhone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  renterEmail!: string | null;

  /** INDIVIDUAL | BUSINESS */
  @Column({
    type: 'varchar',
    length: 16,
    default: PropertyTenantType.INDIVIDUAL,
  })
  tenantType!: PropertyTenantType;

  @Column({ type: 'varchar', length: 64, nullable: true })
  renterNationality!: string | null;

  /** PASSPORT, NATIONAL_ID, BUSINESS_REG, etc. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  idType!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  idNumber!: string | null;

  /** Floor area captured at move-in (square metres). */
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  areaSqm!: number | null;

  /** FK to pos_property_rate_plans.id — null if no rate plan selected at move-in. */
  @Column({ type: 'bigint', nullable: true })
  ratePlanId!: number | null;

  /** FK to pos_property_reservations.id — set when opened from a reservation. */
  @Column({ type: 'bigint', nullable: true })
  reservationId!: number | null;

  /** Move-in date. */
  @Column({ type: 'date', nullable: true })
  leaseStartAt!: string | null;

  /** Lease end date. */
  @Column({ type: 'date', nullable: true })
  leaseEndAt!: string | null;

  /** Billing cadence — MONTH (default) or WEEK for short-stay units. */
  @Column({
    type: 'varchar',
    length: 8,
    default: PropertyRentalBillingCycle.MONTH,
  })
  billingCycle!: PropertyRentalBillingCycle;

  /** Number of whole billing periods between lease start and end. */
  @Column({ type: 'int', default: 0 })
  periodsBilled!: number;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  /** Security deposit collected at move-in. */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  depositAmount!: number;

  /** Amount of the deposit refunded at settlement (move-out). */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  depositRefund!: number | null;

  /** Amount of the deposit kept (forfeited) at settlement — recognized as income. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  depositForfeit!: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  chargesTotal!: number;

  /** Backend checkout id after settlement */
  @Column({ type: 'varchar', length: 128, nullable: true })
  settledCheckoutId!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  paidAmount!: number | null;

  /**
   * Cumulative rent recognized into revenue by the daily accrual job while the
   * booking is OPEN. Settlement recognizes only the still-deferred remainder, so
   * collected rent is recognized exactly once.
   */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  recognizedAmount!: number;

  /** Instalment payment ledger (partial payments collected while OPEN). */
  @Column({ type: 'jsonb', nullable: true })
  payments!: PropertyBookingPaymentRecord[] | null;

  @Column({ type: 'text', nullable: true })
  voidReason!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  transferredToProperty!: string | null;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'int', nullable: true })
  openedByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  voidedAt!: Date | null;
}
