import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VehiclePlateStatus {
  /** A blank in the office's drawer, available to issue. */
  IN_STOCK = 'IN_STOCK',
  /**
   * Claimed by a registration that has not completed. The state that makes
   * payment-then-issue recoverable: the plate is off the shelf so no second
   * clerk can take it, but nothing has been handed over yet.
   */
  ALLOCATED = 'ALLOCATED',
  /** On a vehicle, on the road. */
  ISSUED = 'ISSUED',
  /** Handed back — deregistered, or replaced by a new series. Reissuable. */
  RETURNED = 'RETURNED',
  /** Reported lost or stolen. Never reissued: the number is live in the wild. */
  LOST = 'LOST',
  /** Physically destroyed and accounted for. */
  DESTROYED = 'DESTROYED',
}

/**
 * One physical number plate.
 *
 * A row per blank, materialised when its series is created. That makes "how
 * many plates are left in Godey" a COUNT rather than arithmetic, gives a
 * spoiled or lost plate somewhere to be recorded, and — the reason it matters
 * most — makes allocation a single atomic statement:
 *
 *   UPDATE pos_vehicle_plates SET status='ALLOCATED', "registrationId"=$2
 *   WHERE id = (
 *     SELECT id FROM pos_vehicle_plates
 *     WHERE "seriesId"=$1 AND status='IN_STOCK'
 *     ORDER BY "sortKey" LIMIT 1
 *     FOR UPDATE SKIP LOCKED
 *   ) RETURNING *;
 *
 * FOR UPDATE SKIP LOCKED is the whole safety argument. Two clerks pressing
 * Issue in the same second take different plates: the second skips the row the
 * first has locked rather than blocking on it or, worse, reading it as free.
 *
 * `plateNumber` is unique per TENANT — the duplicate-plate-across-two-woredas
 * problem is the one the Bureau most needs solved — and case-insensitively so,
 * since the same number typed 'ET5-01234' and 'et5-01234' is one plate.
 */
@Entity('pos_vehicle_plates')
@Index('idx_pos_vehicle_plates_pick', ['seriesId', 'status', 'sortKey'])
@Index('idx_pos_vehicle_plates_branch_status', ['branchId', 'status'])
export class VehiclePlate {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  /** Which office holds it. Moves only when the Bureau reallocates a series. */
  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'bigint' })
  seriesId!: number;

  /**
   * The number as it is printed and as the public types it: '3-SM-01234'.
   *
   * Composed from the three columns below by formatPlateNumber, never parsed
   * back apart — the arrangement is an assumption pending the Bureau's
   * confirmation, and anything that parsed this string would break the day it
   * changes.
   */
  @Column({ type: 'varchar', length: 32 })
  plateNumber!: string;

  /** Ethiopian class code: 1 taxi, 2 private, 3 commercial, 4 government, 5 civic. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  plateCode!: string | null;

  /** Issuing region — 'SM' for the Somali Region. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  regionCode!: string | null;

  /** The numeric part on its own, so the parts never have to be parsed back. */
  @Column({ type: 'int', nullable: true })
  serial!: number | null;

  /**
   * Issue order within the series. The numeric part, so plates go out in the
   * order the office has them stacked; sorting on `plateNumber` would put
   * 5-01000 before 5-0999 and hand out the drawer backwards.
   */
  @Column({ type: 'int' })
  sortKey!: number;

  @Column({ type: 'varchar', length: 16, default: VehiclePlateStatus.IN_STOCK })
  status!: VehiclePlateStatus;

  /** The registration holding it, while ALLOCATED or ISSUED. */
  @Column({ type: 'bigint', nullable: true })
  registrationId!: number | null;

  /** Why it left circulation — the case reference for a lost plate. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  statusReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
