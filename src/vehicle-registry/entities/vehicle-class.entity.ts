import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VehicleClassStatus {
  ACTIVE = 'ACTIVE',
  /**
   * No longer registrable. Kept, never deleted: vehicles already licensed under
   * the class still point at it, and a registry that could drop a class would
   * orphan the record of every vehicle in it.
   */
  RETIRED = 'RETIRED',
}

/**
 * A class of road vehicle, as the Bureau defines it.
 *
 * This table is the answer to "cover all road vehicles from day one". A private
 * car, a goods truck, a minibus taxi, a bajaj and a trailer differ in exactly
 * four ways that matter to a registry — what they are called, what they are
 * charged, how long a licence runs, and whether they must be inspected — so
 * they are rows here rather than an enum somewhere in code. Adding a class the
 * Bureau invents next year is a row, not a deploy.
 *
 * TENANT-scoped, not branch-scoped. A class of vehicle is a regional policy: a
 * minibus is a minibus in Jigjiga and in Godey, and per-office class tables
 * would let two zones quietly diverge on what a vehicle even is.
 *
 * ── Why the fees are SKUs and not product ids ───────────────────────────────
 *
 * {@link SchoolClass} references its fee by `feeProductId`, and this table
 * deliberately does not. Products are BRANCH-scoped; this row is TENANT-scoped.
 * A product id would bind a region-wide class to one office's product row, so
 * every other office would either read a fee it cannot sell or need a class of
 * its own — which is the divergence the tenant scoping exists to prevent.
 *
 * A SKU is the stable name of the same fee across every office. The registry
 * resolves it against the issuing branch's own catalogue at transaction time,
 * and `PosCheckoutService` then re-prices the line from that product record, so
 * the gazetted price is whatever the office's catalogue says and a clerk cannot
 * type over it.
 *
 * Nullable, all six: a Bureau can lay out its class structure before it has
 * priced anything, exactly as a school lays out classes before fees.
 */
@Entity('pos_vehicle_classes')
@Index('idx_pos_vehicle_classes_tenant_status', ['tenantId', 'status'])
export class VehicleClass {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  /** The Bureau. Uniqueness and every registry query hang off this. */
  @Column({ type: 'int' })
  tenantId!: number;

  /** Stable machine name: 'PRIVATE_CAR', 'MINIBUS', 'TRUCK', 'MOTORCYCLE'. */
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  /**
   * Trilingual by column rather than by translation file, because these are the
   * Bureau's own words on a statutory document. A certificate that printed a
   * class name from a developer's locale bundle would be printing our wording,
   * not theirs.
   */
  @Column({ type: 'varchar', length: 255 })
  nameEn!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nameSo!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nameAm!: string | null;

  /**
   * The plate prefix this class draws from, when the Bureau segregates series
   * by class (Ethiopian plates encode vehicle type). Null = no class-specific
   * prefix; a series may still name one itself.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  plateSeriesPrefix!: string | null;

  /** How long a licence runs. Twelve months for almost everything, so far. */
  @Column({ type: 'int', default: 12 })
  renewalMonths!: number;

  /**
   * Whether a renewal is gated on a current roadworthiness pass.
   *
   * True for anything that carries people or goods. A Bureau may set it false
   * for, say, a trailer — the point is that it is the Bureau's call per class
   * and not a rule buried in the renewal code path.
   */
  @Column({ type: 'boolean', default: true })
  inspectionRequired!: boolean;

  /**
   * On sale, does the plate stay with the vehicle or go back to stock?
   *
   * Ethiopia keeps the plate with the vehicle, so this defaults true. It is a
   * column because getting it wrong in the other direction is expensive: a
   * transfer that wrongly recycled a plate would put a live number back in the
   * issuable pool while a car on the road still carries it.
   */
  @Column({ type: 'boolean', default: true })
  plateFollowsVehicle!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  registrationFeeSku!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  renewalFeeSku!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  transferFeeSku!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  plateFeeSku!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  inspectionFeeSku!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  penaltyFeeSku!: string | null;

  /** Registry order — a class list is not alphabetical any more than a school's. */
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'varchar', length: 16, default: VehicleClassStatus.ACTIVE })
  status!: VehicleClassStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
