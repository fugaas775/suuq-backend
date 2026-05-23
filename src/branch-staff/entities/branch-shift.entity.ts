import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { BranchShiftStaff } from './branch-shift-staff.entity';

@Entity('branch_shifts')
export class BranchShift {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /**
   * Local start time in HH:MM format (24-hour).
   * Compared against branch-local time derived from branch.timezone.
   */
  @Column({ type: 'varchar', length: 5 })
  startTime!: string;

  /**
   * Local end time in HH:MM format (24-hour).
   * If endTime < startTime the shift spans midnight.
   */
  @Column({ type: 'varchar', length: 5 })
  endTime!: string;

  /**
   * Days of week this shift is active.
   * Values: "0" = Sunday, "1" = Monday, … "6" = Saturday.
   * Stored as a simple-array (comma-separated).
   */
  @Column({ type: 'simple-array' })
  daysOfWeek!: string[];

  @Column({ default: true })
  isActive!: boolean;

  @OneToMany(() => BranchShiftStaff, (ss) => ss.shift, { cascade: true })
  staffAssignments!: BranchShiftStaff[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
