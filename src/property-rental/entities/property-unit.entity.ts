import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PropertyUnitStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum PropertyUnitType {
  STUDIO = 'STUDIO',
  ONE_BED = 'ONE_BED',
  TWO_BED = 'TWO_BED',
  THREE_BED = 'THREE_BED',
  HOUSE = 'HOUSE',
  ROOM = 'ROOM',
  OTHER = 'OTHER',
}

/**
 * A rentable property unit in the branch registry. Month-based analogue of
 * HotelRoom. Independent of the HOTEL room table.
 */
@Entity('pos_property_units')
@Index('idx_pos_property_unit_branch_status', ['branchId', 'status'])
@Index('uq_pos_property_unit_branch_code', ['branchId', 'propertyCode'], {
  unique: true,
})
export class PropertyUnit {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** Unique per branch, e.g. 'APT-3B'. */
  @Column({ type: 'varchar', length: 64 })
  propertyCode!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 16, default: PropertyUnitType.OTHER })
  unitType!: PropertyUnitType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ type: 'int', nullable: true })
  capacity!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  areaSqm!: number | null;

  @Column({ type: 'varchar', length: 16, default: PropertyUnitStatus.ACTIVE })
  status!: PropertyUnitStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
