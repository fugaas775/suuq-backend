import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { BranchStaffRole } from './branch-staff-assignment.entity';

@Entity('branch_staff_invites')
@Unique(['branchId', 'email'])
@Index(['email', 'isActive'])
export class BranchStaffInvite {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({
    type: 'enum',
    enum: BranchStaffRole,
    enumName: 'branch_staff_assignments_role_enum',
  })
  role!: BranchStaffRole;

  @Column({ type: 'simple-array', default: '' })
  permissions!: string[];

  @Column({ type: 'int', nullable: true })
  invitedByUserId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invitedByUserId' })
  invitedBy?: User | null;

  @Column({ type: 'int', nullable: true })
  acceptedByUserId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'acceptedByUserId' })
  acceptedBy?: User | null;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
