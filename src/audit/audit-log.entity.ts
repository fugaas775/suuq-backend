import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  actorId!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actorEmail!: string | null;

  @Column({ type: 'varchar', length: 128 })
  action!: string; // e.g., vendor.verification.update

  @Column({ type: 'varchar', length: 64 })
  targetType!: string; // e.g., vendor

  @Column({ type: 'int' })
  targetId!: number; // e.g., vendor user id

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta!: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
