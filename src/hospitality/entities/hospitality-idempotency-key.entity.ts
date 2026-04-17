import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('pos_hospitality_idempotency_keys')
@Unique('uq_pos_hospitality_idempotency_branch_key', [
  'branchId',
  'idempotencyKey',
])
@Index('idx_pos_hospitality_idempotency_branch_created', [
  'branchId',
  'createdAt',
])
export class HospitalityIdempotencyKey {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @Column({ type: 'jsonb' })
  responsePayload!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
