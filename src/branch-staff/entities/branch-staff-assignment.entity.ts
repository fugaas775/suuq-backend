import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Branch } from '../../branches/entities/branch.entity';

export enum BranchStaffRole {
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
}

export enum BranchStaffCapability {
  MANAGE_BRANCH_STAFF = 'MANAGE_BRANCH_STAFF',
}

@Entity('branch_staff_assignments')
@Unique(['branchId', 'userId'])
export class BranchStaffAssignment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'int' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'enum', enum: BranchStaffRole })
  role!: BranchStaffRole;

  @Column({ type: 'simple-array', default: '' })
  permissions!: string[];

  /**
   * Optional whitelist of surface IDs (e.g. 'pos-s', 'reports') the
   * assignee may access. NULL means "no extra restriction beyond role
   * default" — managers see everything by default, operators see only
   * `/ops/pos-s` unless surfaces are explicitly assigned.
   */
  @Column({ type: 'simple-array', nullable: true })
  assignedSurfaces!: string[] | null;

  @Column({ type: 'simple-array', default: '' })
  capabilities!: string[];

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
