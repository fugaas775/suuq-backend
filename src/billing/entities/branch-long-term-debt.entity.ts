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

export enum BranchLongTermDebtStatus {
  ACTIVE = 'ACTIVE',
  SETTLED = 'SETTLED',
}

@Entity('branch_long_term_debts')
@Index(['branchId', 'issuedAt'])
@Index(['branchId', 'maturityAt'])
export class BranchLongTermDebt {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;

  @Column({ type: 'varchar', length: 255 })
  lenderName!: string;

  @Column({
    type: 'enum',
    enum: BranchLongTermDebtStatus,
    default: BranchLongTermDebtStatus.ACTIVE,
  })
  status!: BranchLongTermDebtStatus;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  principalAmount!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  outstandingPrincipal!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  currentPortionAmount!: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  interestRate?: number | null;

  @Column({ type: 'timestamp' })
  issuedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  maturityAt?: Date | null;

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
