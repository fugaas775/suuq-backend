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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
