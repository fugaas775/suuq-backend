import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RetailTenant } from '../../retail/entities/retail-tenant.entity';

export enum SellerWorkspaceStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum SellerWorkspaceBillingStatus {
  NOT_STARTED = 'NOT_STARTED',
  PLAN_SELECTED = 'PLAN_SELECTED',
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
}

export type SellerWorkspaceProgressState = Record<
  string,
  {
    completed?: boolean;
    connected?: boolean;
    requested?: boolean;
    detail?: string | null;
    updatedAt?: string | null;
  }
>;

@Entity('seller_workspaces')
@Index(['ownerUserId'], { unique: true })
export class SellerWorkspace {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  ownerUserId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  owner!: User;

  @Column({ type: 'int', nullable: true })
  primaryVendorId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primaryVendorId' })
  primaryVendor?: User | null;

  @Column({ type: 'int', nullable: true })
  primaryRetailTenantId?: number | null;

  @ManyToOne(() => RetailTenant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primaryRetailTenantId' })
  primaryRetailTenant?: RetailTenant | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  selectedPlanCode?: string | null;

  @Column({
    type: 'enum',
    enum: SellerWorkspaceBillingStatus,
    default: SellerWorkspaceBillingStatus.NOT_STARTED,
  })
  billingStatus!: SellerWorkspaceBillingStatus;

  @Column({
    type: 'enum',
    enum: SellerWorkspaceStatus,
    default: SellerWorkspaceStatus.ACTIVE,
  })
  status!: SellerWorkspaceStatus;

  @Column({ type: 'timestamp', nullable: true })
  planSelectedAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  onboardingState?: SellerWorkspaceProgressState | null;

  @Column({ type: 'jsonb', nullable: true })
  channelState?: SellerWorkspaceProgressState | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
