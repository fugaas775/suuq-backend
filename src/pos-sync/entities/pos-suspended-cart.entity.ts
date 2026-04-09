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
import { PosRegisterSession } from './pos-register-session.entity';

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string | number) =>
    typeof value === 'string' ? parseFloat(value) : value,
};

export enum PosSuspendedCartStatus {
  SUSPENDED = 'SUSPENDED',
  RESUMED = 'RESUMED',
  DISCARDED = 'DISCARDED',
}

@Entity('pos_suspended_carts')
@Index(['branchId', 'status', 'registerId'])
export class PosSuspendedCart {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'int', nullable: true })
  registerSessionId?: number | null;

  @ManyToOne(() => PosRegisterSession, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'registerSessionId' })
  registerSession?: PosRegisterSession | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  registerId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  label!: string;

  @Column({
    type: 'enum',
    enum: PosSuspendedCartStatus,
    default: PosSuspendedCartStatus.SUSPENDED,
  })
  status!: PosSuspendedCartStatus;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  promoCode?: string | null;

  @Column({ type: 'int', default: 0 })
  itemCount!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  total!: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'jsonb' })
  cartSnapshot!: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'int', nullable: true })
  suspendedByUserId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  suspendedByName?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resumedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  resumedByUserId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resumedByName?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  discardedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  discardedByUserId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  discardedByName?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
