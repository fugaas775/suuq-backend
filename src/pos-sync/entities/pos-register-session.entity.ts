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
  to: (value: number | null | undefined) =>
    value === null || value === undefined ? value : value,
  from: (value: string | number | null) =>
    value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? parseFloat(value)
        : value,
};

export enum PosRegisterSessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

@Entity('pos_register_sessions')
@Index(['branchId', 'registerId', 'status'])
export class PosRegisterSession {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'varchar', length: 128 })
  registerId!: string;

  @Column({
    type: 'enum',
    enum: PosRegisterSessionStatus,
    default: PosRegisterSessionStatus.OPEN,
  })
  status!: PosRegisterSessionStatus;

  @Column({ type: 'timestamp' })
  openedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  closedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  openedByUserId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  openedByName?: string | null;

  @Column({ type: 'int', nullable: true })
  closedByUserId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  closedByName?: string | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  openingFloat?: number | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  closingFloat?: number | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
