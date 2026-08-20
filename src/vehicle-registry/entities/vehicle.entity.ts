import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A physical vehicle, for as long as it exists.
 *
 * ── Identity, not licence ───────────────────────────────────────────────────
 *
 * This row is created once and never transferred. It has no owner column, no
 * plate column and no expiry: those belong to a {@link VehicleRegistration},
 * of which a vehicle has many over its life — one per ownership period. Selling
 * a car closes the current registration and opens another against this same
 * row.
 *
 * That split is what makes history free. The alternative — owner and plate as
 * columns here, overwritten on sale — loses the previous keeper the moment the
 * new one is recorded, and a registry whose whole purpose is answering "who had
 * this vehicle in 2024" cannot be built on a table that forgets.
 *
 * ── Region-wide uniqueness ──────────────────────────────────────────────────
 *
 * `vin` (the chassis number) is unique per TENANT, not per branch. This is the
 * one place the platform's branch-scoping convention is deliberately not
 * followed, and it is the reason the registry is worth building at all: a
 * chassis registered in Jigjiga must not be registrable again in Godey. Access
 * is still checked per branch by PosBranchAccessGuard — only the uniqueness
 * query spans the tenant.
 *
 * Enforced case-insensitively in the migration (`UPPER("vin")`), because a VIN
 * is transcribed by hand off a stamped plate and 'ABC123' beside 'abc123' would
 * be one vehicle registered twice.
 */
@Entity('pos_vehicles')
@Index('idx_pos_vehicles_tenant_class', ['tenantId', 'classId'])
@Index('idx_pos_vehicles_home_branch', ['homeBranchId'])
export class Vehicle {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  /**
   * The office that first registered it. A record of where the vehicle entered
   * the system, NOT a permission boundary — an owner who moves to another zone
   * renews at the office in front of them, and the registry would be useless if
   * a truck could only ever be seen by the woreda that first licensed it.
   */
  @Column({ type: 'int' })
  homeBranchId!: number;

  @Column({ type: 'bigint' })
  classId!: number;

  /** Chassis / VIN, as stamped. Unique across the whole region. */
  @Column({ type: 'varchar', length: 64 })
  vin!: string;

  /**
   * Indexed but NOT unique. An engine is replaceable, so two vehicles can
   * honestly carry the same engine number across a rebuild, and enforcing
   * uniqueness would block the second registration with no way to explain it.
   * It is still the field an investigator searches on, so it is indexed.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  engineNumber!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  make!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  model!: string | null;

  @Column({ type: 'int', nullable: true })
  modelYear!: number | null;

  /** Printed on the certificate and shown on every verification scan. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  colour!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  fuel!: string | null;

  @Column({ type: 'int', nullable: true })
  seats!: number | null;

  @Column({ type: 'int', nullable: true })
  grossWeightKg!: number | null;

  @Column({ type: 'int', nullable: true })
  engineCc!: number | null;

  /** Customs declaration or import permit reference, for an imported vehicle. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  importRef!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
