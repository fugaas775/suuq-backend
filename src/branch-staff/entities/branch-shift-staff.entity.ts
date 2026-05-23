import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BranchShift } from './branch-shift.entity';

@Entity('branch_shift_staff')
@Unique(['shiftId', 'userId'])
export class BranchShiftStaff {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  shiftId!: number;

  @ManyToOne(() => BranchShift, (shift) => shift.staffAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'shiftId' })
  shift!: BranchShift;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'int' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;
}
