import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum VehicleEventType {
  REGISTERED = 'REGISTERED',
  RENEWED = 'RENEWED',
  TRANSFERRED = 'TRANSFERRED',
  INSPECTED = 'INSPECTED',
  FLAGGED = 'FLAGGED',
  FLAG_CLEARED = 'FLAG_CLEARED',
  PLATE_ISSUED = 'PLATE_ISSUED',
  PLATE_REPLACED = 'PLATE_REPLACED',
  DEREGISTERED = 'DEREGISTERED',
  /**
   * A supervisor issued against a failed or missing inspection, or waived a
   * penalty. Recorded rather than prevented: overrides happen in a real office,
   * and the choice is between a system that knows about them and one that is
   * routed around on paper.
   */
  OVERRIDE = 'OVERRIDE',
}

/**
 * What happened to a vehicle, in order, for as long as the record exists.
 *
 * Append-only. Nothing updates or deletes a row here; a mistake is corrected by
 * a further event that says so. That is the difference between a history and a
 * current state with a log next to it — the registrations table already carries
 * current state, so if this table were mutable it would add nothing.
 *
 * Deliberately separate from the platform's `audit_log`, which exists for
 * administrative actions and whose `targetId` is a NOT NULL int. These rows are
 * not an audit trail bolted on for compliance: a vehicle's history is a thing
 * the Bureau reads, prints and is asked about in a dispute, so it is domain
 * data with its own shape — an actor, a branch, the checkout that paid, and a
 * reason.
 *
 * `checkoutId` is what lets any event be traced back to the money that
 * accompanied it, and `reason` is what an OVERRIDE is worth nothing without.
 */
@Entity('pos_vehicle_events')
@Index('idx_pos_vehicle_events_vehicle', ['vehicleId', 'occurredAt'])
@Index('idx_pos_vehicle_events_registration', ['registrationId'])
@Index('idx_pos_vehicle_events_branch_type', ['branchId', 'type', 'occurredAt'])
export class VehicleEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  /** Where it happened — which office, or which checkpoint's home office. */
  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'bigint' })
  vehicleId!: number;

  /** Null for events about the vehicle rather than a licence — a stolen flag. */
  @Column({ type: 'bigint', nullable: true })
  registrationId!: number | null;

  @Column({ type: 'varchar', length: 24 })
  type!: VehicleEventType;

  @Column({ type: 'int', nullable: true })
  actorUserId!: number | null;

  /** The fee that accompanied it, where there was one. */
  @Column({ type: 'int', nullable: true })
  checkoutId!: number | null;

  /** Required in practice for OVERRIDE and every flag; free text otherwise. */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta!: Record<string, unknown> | null;

  /**
   * Set explicitly rather than defaulted from createdAt: a clerk recording
   * yesterday's inspection is recording when it HAPPENED, and a history that
   * silently reordered itself around data-entry time would be useless in the
   * dispute it exists to settle.
   */
  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
