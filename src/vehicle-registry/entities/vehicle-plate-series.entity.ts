import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VehiclePlateSeriesStatus {
  ACTIVE = 'ACTIVE',
  /** Fully issued or withdrawn. No further plates may be drawn from it. */
  CLOSED = 'CLOSED',
}

/**
 * A block of plate numbers allotted to one office.
 *
 * The Bureau hands a zone office a range — say 5-01000 to 5-01999 — and the
 * office issues from it. Creating a series MATERIALISES every number in it as a
 * row in `pos_vehicle_plates`; this table is the header that records who was
 * given what.
 *
 * Materialising the range is what makes allocation safe and stock countable.
 * The alternative, a `nextNumber` counter incremented on issue, has the two
 * failure modes a registry cannot afford: two clerks reading the same counter
 * in the same second both get the same plate, and a number that is skipped or
 * spoiled has nowhere to be recorded, so the office's physical plates and the
 * system's count drift apart with nothing to reconcile them against.
 *
 * There is deliberately no `issuedCount` column. It would be a denormalised
 * number that drifts from the plates themselves the first time anything writes
 * outside the service; the count is a COUNT, and the rows are the truth.
 */
@Entity('pos_vehicle_plate_series')
@Index('idx_pos_vehicle_plate_series_branch_status', ['branchId', 'status'])
export class VehiclePlateSeries {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  /** The office holding the physical blanks. Plates ARE branch-scoped stock. */
  @Column({ type: 'int' })
  branchId!: number;

  /** Restricts the series to one class of vehicle. Null = any class. */
  @Column({ type: 'bigint', nullable: true })
  classId!: number | null;

  /**
   * The Ethiopian class code every plate in this block carries — 1 taxi,
   * 2 private, 3 commercial, 4 government, 5 religious & civic.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  plateCode!: string | null;

  /** The issuing region — 'SM' (ሶማ) for the Somali Region. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  regionCode!: string | null;

  /**
   * @deprecated The original single-prefix model, before the class and region
   * codes were understood to be two independent identifiers. Retained so a
   * series allotted under it still reads back.
   */
  @Column({ type: 'varchar', length: 16 })
  prefix!: string;

  @Column({ type: 'int' })
  rangeStart!: number;

  @Column({ type: 'int' })
  rangeEnd!: number;

  /**
   * How many digits the numeric part is padded to, so 7 prints as '00007'.
   * Stored rather than inferred from rangeEnd: a Bureau that orders 5-00001 to
   * 5-00999 still wants five digits, not three.
   */
  @Column({ type: 'int', default: 5 })
  numberWidth!: number;

  @Column({
    type: 'varchar',
    length: 16,
    default: VehiclePlateSeriesStatus.ACTIVE,
  })
  status!: VehiclePlateSeriesStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
