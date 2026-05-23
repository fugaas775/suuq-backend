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

  /**
   * Optional lane/experience profile code (e.g. CAFETERIA_KITCHEN) that
   * restricts this operator to a specific POS UI surface.
   */
  @Column({ type: 'varchar', nullable: true, default: null })
  posExperienceProfileCode!: string | null;

  @Column({ default: true })
  isActive!: boolean;

  /**
   * Percentage of service revenue this stylist receives (0–100).
   * Relevant for BARBER_COUNTER / SALON_STYLIST lanes only.
   */
  @Column({ type: 'smallint', nullable: true, default: null })
  serviceSharePct!: number | null;

  /**
   * When set, any pos_manager_approval token for this user on this branch
   * that was issued before this timestamp is considered revoked.
   * Populated by DELETE /operator-sessions?userId=<id>.
   */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  sessionRevokedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
