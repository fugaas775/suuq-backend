import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pos_hospitality_bill_interventions')
@Unique('uq_pos_hospitality_bill_intervention_branch_bill', [
  'branchId',
  'billId',
])
@Index('idx_pos_hospitality_bill_intervention_branch_updated', [
  'branchId',
  'updatedAt',
])
@Index('idx_pos_hospitality_bill_intervention_branch_action', [
  'branchId',
  'actionType',
])
@Index('idx_pos_hospitality_bill_intervention_branch_priority', [
  'branchId',
  'priority',
])
export class HospitalityBillIntervention {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 128 })
  interventionId!: string;

  @Column({ type: 'varchar', length: 128 })
  billId!: string;

  @Column({ type: 'varchar', length: 255 })
  billLabel!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  tableId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tableLabel!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  receiptId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  receiptNumber!: string | null;

  @Column({ type: 'varchar', length: 16 })
  actionType!: string;

  @Column({ type: 'varchar', length: 32 })
  lifecycleStatus!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  serviceOwner!: string | null;

  @Column({ type: 'int', default: 0 })
  itemCount!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: string;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'varchar', length: 16 })
  priority!: string;

  @Column({ type: 'int', nullable: true })
  actorUserId!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actorDisplayName!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
