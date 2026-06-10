import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { RetailTenant } from './retail-tenant.entity';
import { EquityPartner } from './equity-partner.entity';

@Entity('equity_split_assignments')
export class EquitySplitAssignment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  equityPartnerId!: number;

  @ManyToOne(() => EquityPartner, (p) => p.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equityPartnerId' })
  partner!: EquityPartner;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'int', nullable: true })
  retailTenantId?: number | null;

  @ManyToOne(() => RetailTenant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'retailTenantId' })
  retailTenant?: RetailTenant | null;

  /** Numerator of the revenue split (default 1). */
  @Column({ type: 'int', default: 1 })
  splitNumerator!: number;

  /** Denominator of the revenue split (default 2 → 1/2). */
  @Column({ type: 'int', default: 2 })
  splitDenominator!: number;

  @CreateDateColumn()
  assignedAt!: Date;

  /** Null = perpetual; set to terminate the assignment at a future date. */
  @Column({ type: 'timestamp', nullable: true })
  activeUntil?: Date | null;
}
