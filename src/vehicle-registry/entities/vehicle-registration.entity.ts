import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VehicleRegistrationStatus {
  /**
   * Paid for, not yet issued.
   *
   * The state that exists so a citizen is never left holding a receipt and no
   * plate. Issuance runs after the fee is settled; if it fails in between, the
   * checkout still stands and the record waits here with a Resume action on the
   * desk, rather than the payment disappearing into a failed transaction.
   */
  PENDING_ISSUE = 'PENDING_ISSUE',
  ACTIVE = 'ACTIVE',
  /** Past its expiry and not yet renewed. Set by the clock, not by a clerk. */
  EXPIRED = 'EXPIRED',
  /** Withdrawn by the Bureau while the vehicle still exists. */
  SUSPENDED = 'SUSPENDED',
  /** Closed because the vehicle was sold. The successor row carries it on. */
  TRANSFERRED = 'TRANSFERRED',
  /** Closed because the vehicle is gone — scrapped, exported, written off. */
  DEREGISTERED = 'DEREGISTERED',
}

/**
 * A licence: one owner's registration of one vehicle, for one period.
 *
 * The time-sliced half of the identity/licence split described on
 * {@link Vehicle}. A vehicle has many of these over its life and exactly one
 * live at a time, enforced by a partial unique index on `vehicleId WHERE
 * status = 'ACTIVE'` — a database-level guarantee rather than a service-level
 * intention, because two live registrations on one chassis is precisely the
 * corruption the whole system exists to prevent.
 *
 * A transfer does not mutate this row. It closes it (`TRANSFERRED`, `endedAt`)
 * and opens a successor pointing back through `previousRegistrationId`, so the
 * chain of keepers is readable in both directions and no edit can lose one.
 */
@Entity('pos_vehicle_registrations')
@Index('idx_pos_vehicle_registrations_vehicle', ['vehicleId', 'status'])
@Index('idx_pos_vehicle_registrations_owner', ['ownerId'])
@Index('idx_pos_vehicle_registrations_expiry', [
  'tenantId',
  'status',
  'expiresAt',
])
@Index('idx_pos_vehicle_registrations_branch', ['branchId', 'issuedAt'])
export class VehicleRegistration {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  /** The office that issued THIS registration — not necessarily the vehicle's home. */
  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'bigint' })
  vehicleId!: number;

  @Column({ type: 'bigint' })
  ownerId!: number;

  /** Null only while PENDING_ISSUE — a live registration always holds a plate. */
  @Column({ type: 'bigint', nullable: true })
  plateId!: number | null;

  /** Printed on the certificate. The Bureau's own document number. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  certificateNumber!: string | null;

  /**
   * The token in the certificate's QR, resolved by the public verification
   * page. Crockford base32 from the shared receipt-verification helper, whose
   * I/L→1 and O→0 folding is what lets an officer read one down a phone line.
   *
   * Unique across the whole table, not per tenant: it is a global lookup key
   * with no tenant in the URL to disambiguate it.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  verificationCode!: string | null;

  @Column({
    type: 'varchar',
    length: 24,
    default: VehicleRegistrationStatus.PENDING_ISSUE,
  })
  status!: VehicleRegistrationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  issuedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  /** When it stopped being the live registration, whatever ended it. */
  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  /**
   * The checkout that paid for it.
   *
   * The join between the registry and the money, and the idempotency key for
   * issuance: issuing is keyed on this id, so a retried or double-submitted
   * settle cannot produce two registrations or consume two plates.
   */
  @Column({ type: 'int', nullable: true })
  issuedCheckoutId!: number | null;

  @Column({ type: 'int', nullable: true })
  issuedByUserId!: number | null;

  /** The registration this one succeeds, on a transfer or a renewal. */
  @Column({ type: 'bigint', nullable: true })
  previousRegistrationId!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
