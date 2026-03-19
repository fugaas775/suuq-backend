import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { TenantModuleEntitlement } from './tenant-module-entitlement.entity';
import { TenantSubscription } from './tenant-subscription.entity';

export enum RetailTenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

@Entity('retail_tenants')
@Index(['name'], { unique: true })
export class RetailTenant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 32, nullable: true, unique: true })
  code?: string | null;

  @Column({
    type: 'enum',
    enum: RetailTenantStatus,
    default: RetailTenantStatus.ACTIVE,
  })
  status!: RetailTenantStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  billingEmail?: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  defaultCurrency?: string | null;

  @Column({ type: 'int', nullable: true })
  ownerUserId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerUserId' })
  owner?: User | null;

  @OneToMany(() => Branch, (branch) => branch.retailTenant)
  branches?: Branch[];

  @OneToMany(() => TenantSubscription, (subscription) => subscription.tenant)
  subscriptions?: TenantSubscription[];

  @OneToMany(() => TenantModuleEntitlement, (entitlement) => entitlement.tenant)
  entitlements?: TenantModuleEntitlement[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
