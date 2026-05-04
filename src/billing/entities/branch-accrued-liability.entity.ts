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
import { Branch } from '../../branches/entities/branch.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? value : Number(value),
};

export enum BranchAccruedLiabilityCategory {
  PAYROLL = 'PAYROLL',
  RENT = 'RENT',
  UTILITIES = 'UTILITIES',
  TAX = 'TAX',
  INTEREST = 'INTEREST',
  OTHER = 'OTHER',
}

export enum BranchAccruedLiabilityStatus {
  OPEN = 'OPEN',
  SETTLED = 'SETTLED',
}

@Entity('branch_accrued_liabilities')
@Index(['branchId', 'accruedAt'])
@Index(['branchId', 'dueAt'])
export class BranchAccruedLiability {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;

  @Column({ type: 'varchar', length: 255 })
  label!: string;

  @Column({
    type: 'enum',
    enum: BranchAccruedLiabilityCategory,
    default: BranchAccruedLiabilityCategory.OTHER,
  })
  category!: BranchAccruedLiabilityCategory;

  @Column({
    type: 'enum',
    enum: BranchAccruedLiabilityStatus,
    default: BranchAccruedLiabilityStatus.OPEN,
  })
  status!: BranchAccruedLiabilityStatus;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: number;

  @Column({ type: 'timestamp' })
  accruedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  dueAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  settledAt?: Date | null;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
