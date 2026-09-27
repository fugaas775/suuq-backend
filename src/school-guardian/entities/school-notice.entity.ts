import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SchoolNoticeAudience = 'ALL' | 'CLASSES';

/**
 * A notice from the school office to parents — a holiday, an exam week, a
 * fee deadline, a meeting. Shown on the parents' portal to every family
 * (ALL) or to the families of the named classes. Never deleted from the
 * record by the parent's side; the office switches one off (isActive) or
 * lets it expire.
 */
@Entity('pos_school_notices')
@Index('idx_pos_school_notices_branch_published', ['branchId', 'publishedAt'])
export class SchoolNotice {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 16, default: 'ALL' })
  audience!: SchoolNoticeAudience;

  /** Lower-cased class codes when audience is CLASSES. */
  @Column({ type: 'simple-array', nullable: true })
  classCodes!: string[] | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  publishedAt!: Date;

  /** Last day the notice shows (inclusive); null = until switched off. */
  @Column({ type: 'date', nullable: true })
  expiresAt!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', nullable: true })
  createdByUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  createdByName!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
