import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SchoolRoomSeating = 'DESK' | 'MAT';

/**
 * A classroom: its desks, and so its seats.
 *
 * SMAQ 2026-09-20: combined desks seat three, every room is used twice a
 * day (a morning class and an afternoon class), and two desks are broken.
 * The room is the thing with the desks; the classes that sit in it, by
 * shift, are on the registry (`pos_school_classes.roomId`). Capacity is
 * derived — (desks − broken) × seats per desk — never typed twice; a room
 * whose children sit on a mat carries its own count instead.
 */
@Entity('pos_school_rooms')
@Index('idx_pos_school_rooms_branch', ['branchId'])
export class SchoolRoom {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** What the school calls the room — "Room 3", "5aad & 6aad". */
  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 8, default: 'DESK' })
  seating!: SchoolRoomSeating;

  @Column({ type: 'int', default: 0 })
  desks!: number;

  @Column({ type: 'int', default: 0 })
  brokenDesks!: number;

  @Column({ type: 'int', default: 3 })
  seatsPerDesk!: number;

  /** For a MAT room: how many children sit. */
  @Column({ type: 'int', nullable: true })
  matCapacity!: number | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
