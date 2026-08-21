import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VehicleFlagType {
  STOLEN = 'STOLEN',
  IMPOUNDED = 'IMPOUNDED',
  /** Wanted in connection with an investigation, without being reported stolen. */
  WANTED = 'WANTED',
  /** Held by a court order — a dispute, an estate, an unpaid judgement. */
  COURT_HOLD = 'COURT_HOLD',
}

/**
 * A report against a vehicle — stolen, impounded, wanted, held.
 *
 * ── On the VEHICLE, never on the registration ───────────────────────────────
 *
 * A stolen car is stolen whoever the paperwork says owns it, and a thief's
 * first move is to re-register it. Hanging the flag off a registration would
 * mean a transfer quietly cleared it: the old registration closes, a new one
 * opens, and the vehicle comes out the other side with a clean record. Pointing
 * at the durable vehicle identity makes the flag survive every ownership change
 * the registry can perform.
 *
 * Raising and clearing are separate permissions on purpose. Any officer may
 * report a vehicle — that has to be fast, at the roadside, with no supervisor
 * present. Releasing one is a registrar's signature, because a cleared flag is
 * how a stolen car becomes sellable.
 *
 * Cleared rather than deleted: "this was reported in March and released in
 * April" is exactly what a buyer's lawyer asks about, and a row that vanished
 * cannot answer it.
 */
@Entity('pos_vehicle_flags')
@Index('idx_pos_vehicle_flags_vehicle', ['vehicleId'])
export class VehicleFlag {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  @Column({ type: 'bigint' })
  vehicleId!: number;

  @Column({ type: 'varchar', length: 24 })
  type!: VehicleFlagType;

  /** The police case or court reference this report hangs on. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  reference!: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  note!: string | null;

  @Column({ type: 'int', nullable: true })
  raisedByUserId!: number | null;

  /** Which office or checkpoint reported it. */
  @Column({ type: 'int', nullable: true })
  raisedAtBranchId!: number | null;

  @Column({ type: 'timestamptz' })
  raisedAt!: Date;

  /** Null means OPEN — this is the column every verification scan reads. */
  @Column({ type: 'timestamptz', nullable: true })
  clearedAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  clearedByUserId!: number | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  clearReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
