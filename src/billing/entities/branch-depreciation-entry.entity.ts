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
import { BranchFixedAsset } from './branch-fixed-asset.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? value : Number(value),
};

@Entity('branch_depreciation_entries')
@Index(['branchId', 'occurredAt'])
@Index(['fixedAssetId', 'occurredAt'])
export class BranchDepreciationEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;

  @Column({ type: 'int' })
  fixedAssetId!: number;

  @ManyToOne(() => BranchFixedAsset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixedAssetId' })
  fixedAsset?: BranchFixedAsset;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: number;

  @Column({ type: 'timestamp' })
  occurredAt!: Date;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'int', nullable: true })
  recordedByUserId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
