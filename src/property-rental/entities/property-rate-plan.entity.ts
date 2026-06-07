import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A pricing plan for property rentals. Month-based analogue of HotelRatePlan,
 * but keyed on monthly/weekly rates rather than weekday/weekend nightly rates.
 * Independent of the HOTEL rate plan table.
 */
@Entity('pos_property_rate_plans')
@Index('idx_pos_property_rate_plan_branch', ['branchId'])
export class PropertyRatePlan {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** FK to pos_property_units.id — null for a branch-wide default plan. */
  @Column({ type: 'bigint', nullable: true })
  propertyId!: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  monthlyRate!: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  weeklyRate!: number | null;

  /** Optional nightly rate for very short stays. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  nightlyRate!: number | null;

  /** Default security deposit applied at move-in. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  depositAmount!: number | null;

  /** Default late-payment fee. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  lateFeeAmount!: number | null;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  taxPercent!: number | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'date', nullable: true })
  validFrom!: string | null;

  @Column({ type: 'date', nullable: true })
  validTo!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
