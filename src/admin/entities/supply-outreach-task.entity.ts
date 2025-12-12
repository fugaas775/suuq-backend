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

export enum SupplyOutreachStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'supply_outreach_task' })
@Index('idx_supply_outreach_status', ['status'])
@Index('idx_supply_outreach_created', ['createdByAdminId'])
export class SupplyOutreachTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 180 })
  term!: string;

  @Column({
    type: 'enum',
    enum: SupplyOutreachStatus,
    enumName: 'supply_outreach_status_enum',
    default: SupplyOutreachStatus.PENDING,
  })
  status!: SupplyOutreachStatus;

  @Column({ type: 'int', array: true, name: 'request_ids' })
  requestIds!: number[];

  @Column({ type: 'int', name: 'request_count', default: 0 })
  requestCount!: number;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'::jsonb" })
  payload?: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'created_by_admin_id' })
  createdByAdmin!: User;

  @Column({ type: 'int', name: 'created_by_admin_id' })
  createdByAdminId!: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_vendor_id' })
  assignedVendor?: User | null;

  @Column({ type: 'int', name: 'assigned_vendor_id', nullable: true })
  assignedVendorId?: number | null;

  @Column({ type: 'timestamp', nullable: true, name: 'assigned_at' })
  assignedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
