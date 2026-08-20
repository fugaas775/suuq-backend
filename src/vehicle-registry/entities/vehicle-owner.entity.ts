import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VehicleOwnerKind {
  PERSON = 'PERSON',
  COMPANY = 'COMPANY',
  /** A government body's own fleet — a bureau, a woreda office, a hospital. */
  GOVERNMENT = 'GOVERNMENT',
  /** An NGO or association. Kept distinct because exemptions often key on it. */
  ORGANISATION = 'ORGANISATION',
}

/**
 * The registered keeper of a vehicle.
 *
 * A separate table rather than columns on the registration, because one owner
 * holds many vehicles and appears in many registrations over time — a haulier
 * with forty trucks is one owner, and re-typing their details forty times is
 * forty chances to spell them differently. It is also what makes "every vehicle
 * this person owns" a query rather than a fuzzy name search.
 *
 * TENANT-scoped, so a person who registers a car in Jigjiga and a truck in
 * Godey is one owner in the region's records, not two.
 *
 * ── This table is the privacy-sensitive one ─────────────────────────────────
 *
 * Everything here is personal data about a named citizen: their national ID,
 * their phone, the woreda they live in. None of it may ever reach the public
 * verification page, which answers "is this vehicle legal" and not "who owns
 * it" — a plate-to-address lookup open to anyone is a stalking tool. Only an
 * authenticated officer sees these fields. See the privacy split in the plan.
 */
@Entity('pos_vehicle_owners')
@Index('idx_pos_vehicle_owners_tenant_phone', ['tenantId', 'phone'])
export class VehicleOwner {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  @Column({ type: 'varchar', length: 16, default: VehicleOwnerKind.PERSON })
  kind!: VehicleOwnerKind;

  /** As written on the identity document, in whatever script it uses. */
  @Column({ type: 'varchar', length: 255 })
  fullName!: string;

  /**
   * National ID, kebele ID or company registration number.
   *
   * Nullable, and that is deliberate rather than lax. A registry that refused a
   * vehicle until its owner produced an ID would send the vehicle away
   * unregistered — worse for the Bureau than a record with a gap in it. Where
   * it IS given it is unique per tenant, so the same person cannot become two
   * owners with two vehicle histories.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  nationalId!: string | null;

  /** Tax identification number, for commercial keepers. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  tin!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  address!: string | null;

  /** Administrative geography, and how the Bureau reports ownership by area. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  zone!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  woreda!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
