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
import { RetailTenant } from './retail-tenant.entity';

export enum RetailModule {
  POS_CORE = 'POS_CORE',
  INVENTORY_CORE = 'INVENTORY_CORE',
  INVENTORY_AUTOMATION = 'INVENTORY_AUTOMATION',
  DESKTOP_BACKOFFICE = 'DESKTOP_BACKOFFICE',
  ACCOUNTING = 'ACCOUNTING',
  HR_ATTENDANCE = 'HR_ATTENDANCE',
  ERP_CONNECTORS = 'ERP_CONNECTORS',
  AI_ANALYTICS = 'AI_ANALYTICS',
}

@Entity('tenant_module_entitlements')
@Index(['tenantId', 'module'], { unique: true })
export class TenantModuleEntitlement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  @ManyToOne(() => RetailTenant, (tenant) => tenant.entitlements, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenantId' })
  tenant!: RetailTenant;

  @Column({ type: 'enum', enum: RetailModule })
  module!: RetailModule;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startsAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
