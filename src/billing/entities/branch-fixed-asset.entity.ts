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

export enum BranchFixedAssetCategory {
  EQUIPMENT = 'EQUIPMENT',
  FURNITURE = 'FURNITURE',
  VEHICLE = 'VEHICLE',
  LEASEHOLD_IMPROVEMENT = 'LEASEHOLD_IMPROVEMENT',
  TECHNOLOGY = 'TECHNOLOGY',
  OTHER = 'OTHER',
}

export enum BranchFixedAssetStatus {
  ACTIVE = 'ACTIVE',
  DISPOSED = 'DISPOSED',
}

@Entity('branch_fixed_assets')
@Index(['branchId', 'acquiredAt'])
export class BranchFixedAsset {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    type: 'enum',
    enum: BranchFixedAssetCategory,
    default: BranchFixedAssetCategory.OTHER,
  })
  category!: BranchFixedAssetCategory;

  @Column({
    type: 'enum',
    enum: BranchFixedAssetStatus,
    default: BranchFixedAssetStatus.ACTIVE,
  })
  status!: BranchFixedAssetStatus;

  @Column({ type: 'timestamp' })
  acquiredAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  disposedAt?: Date | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  capitalizationAmount!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  salvageValue!: number;

  @Column({ type: 'int', nullable: true })
  usefulLifeMonths?: number | null;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
