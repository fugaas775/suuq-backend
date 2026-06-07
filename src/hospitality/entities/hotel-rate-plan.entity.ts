import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pos_hotel_rate_plans')
@Index('idx_pos_hotel_rate_plans_branch', ['branchId'])
export class HotelRatePlan {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** Human-readable name, e.g. 'Standard Weekday', 'Weekend Suite' */
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** Applies to a specific room type, or null = all room types */
  @Column({ type: 'varchar', length: 64, nullable: true })
  roomType!: string | null;

  /** Weekday rate (Mon–Thu) per night */
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  weekdayRate!: number;

  /** Weekend rate (Fri–Sat) per night; defaults to weekdayRate if null */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  weekendRate!: number | null;

  /** ISO 4217 currency */
  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  /** Tax percent (e.g. 15 = 15%). Nullable = no tax line */
  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  taxPercent!: number | null;

  /** Service charge percent (e.g. 10 = 10%). Nullable = none */
  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  serviceChargePercent!: number | null;

  /** Whether this plan is available for new reservations */
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /**
   * Meal plan included in this rate.
   * ROOM_ONLY | BED_AND_BREAKFAST | HALF_BOARD | FULL_BOARD
   */
  @Column({ type: 'varchar', length: 32, default: 'ROOM_ONLY' })
  mealPlan!: string;

  /** Minimum nights required to qualify for this rate. Defaults to 1. */
  @Column({ type: 'int', default: 1 })
  minimumNights!: number;

  /** Optional start of the validity window (ISO date, inclusive). */
  @Column({ type: 'date', nullable: true })
  validFrom!: string | null;

  /** Optional end of the validity window (ISO date, inclusive). */
  @Column({ type: 'date', nullable: true })
  validTo!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
