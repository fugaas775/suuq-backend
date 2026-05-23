import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum HotelRoomStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
}

@Entity('pos_hotel_rooms')
@Index('idx_pos_hotel_rooms_branch', ['branchId'])
@Index('idx_pos_hotel_rooms_branch_number', ['branchId', 'roomNumber'], {
  unique: true,
})
export class HotelRoom {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** e.g. '101', '202A' */
  @Column({ type: 'varchar', length: 64 })
  roomNumber!: string;

  /** e.g. 'STANDARD', 'DELUXE', 'SUITE' */
  @Column({ type: 'varchar', length: 64, nullable: true })
  roomType!: string | null;

  /** Floor number */
  @Column({ type: 'int', nullable: true })
  floor!: number | null;

  /** Max occupancy */
  @Column({ type: 'int', nullable: true, default: 2 })
  maxOccupancy!: number | null;

  /** Short description or amenities note */
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 16, default: HotelRoomStatus.ACTIVE })
  status!: HotelRoomStatus;

  /** Arbitrary extra attributes (bed type, view, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
